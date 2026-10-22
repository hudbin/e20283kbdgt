import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedTelegramUser } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const auth = getAuthenticatedTelegramUser(req)
    const { searchParams } = new URL(req.url)
    const telegramId = auth ? auth.telegramId : Number(searchParams.get('telegram_id'))

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 })
    }

    const { data: goals, error } = await supabase
      .from('goals')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ goals: [] })
    }

    const now = new Date()

    const calculatedGoals = (goals || []).map((g: any) => {
      const target = Number(g.target_amount) || 0
      const current = Number(g.current_amount) || 0
      const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
      const remaining = Math.max(0, target - current)

      let daysLeft: number | null = null
      let monthlyNeeded: number | null = null

      if (g.deadline) {
        const dDate = new Date(g.deadline)
        const diffMs = dDate.getTime() - now.getTime()
        daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

        if (daysLeft > 0 && remaining > 0) {
          const monthsLeft = Math.max(1, daysLeft / 30.4)
          monthlyNeeded = Math.round(remaining / monthsLeft)
        }
      }

      return {
        ...g,
        target_amount: target,
        current_amount: current,
        percent,
        remaining,
        days_left: daysLeft,
        monthly_needed: monthlyNeeded
      }
    })

    return NextResponse.json({ goals: calculatedGoals })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      telegram_id,
      goal_id,
      action, // 'CREATE' | 'DEPOSIT' | 'WITHDRAW'
      amount,
      name,
      target_amount,
      current_amount = 0,
      currency = 'UZS',
      deadline = null,
      color = 'amber'
    } = body

    if (!telegram_id) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 })
    }

    const numTelegramId = Number(telegram_id)

    // Maqsadga pul qo'shish yoki yechish (Top-up / Withdraw)
    if (action === 'DEPOSIT' || action === 'WITHDRAW') {
      if (!goal_id || !amount) {
        return NextResponse.json({ error: 'goal_id and amount are required' }, { status: 400 })
      }

      const numAmount = Number(amount)
      const { data: goal } = await supabase.from('goals').select('*').eq('id', goal_id).single()
      if (!goal) {
        return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
      }

      const curVal = Number(goal.current_amount) || 0
      const newVal = action === 'DEPOSIT' ? curVal + numAmount : Math.max(0, curVal - numAmount)
      const isCompleted = newVal >= Number(goal.target_amount)

      const { data: updated, error: updateErr } = await supabase
        .from('goals')
        .update({
          current_amount: newVal,
          status: isCompleted ? 'COMPLETED' : 'ACTIVE'
        })
        .eq('id', goal_id)
        .select()
        .single()

      if (updateErr) throw updateErr

      return NextResponse.json({ success: true, goal: updated })
    }

    // Yangi maqsad yaratish
    if (!name || !target_amount) {
      return NextResponse.json({ error: 'name and target_amount are required' }, { status: 400 })
    }

    const { data: newGoal, error: insertErr } = await supabase
      .from('goals')
      .insert({
        telegram_id: numTelegramId,
        name: name.trim(),
        target_amount: Number(target_amount),
        current_amount: Number(current_amount) || 0,
        currency: (currency || 'UZS').toUpperCase(),
        deadline: deadline || null,
        color
      })
      .select()
      .single()

    if (insertErr) throw insertErr

    return NextResponse.json({ success: true, goal: newGoal })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const telegramId = searchParams.get('telegram_id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    let query = supabase.from('goals').delete().eq('id', id)
    if (telegramId) {
      query = query.eq('telegram_id', Number(telegramId))
    }

    const { error } = await query
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
