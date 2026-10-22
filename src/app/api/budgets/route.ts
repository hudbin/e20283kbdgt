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

    const numTelegramId = Number(telegramId)

    // Foydalanuvchining byudjetlarini olamiz
    const { data: budgets, error: budgetErr } = await supabase
      .from('budgets')
      .select('*, categories(name, type)')
      .eq('telegram_id', numTelegramId)

    if (budgetErr) {
      // Agar jadval hali ochilmagan bo'lsa bo'sh ro'yxat qaytaramiz
      return NextResponse.json({ budgets: [], error: budgetErr.message })
    }

    // Joriy oyning boshi va oxirini aniqlaymiz
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

    // Joriy oyda qilingan xarajatlarni olamiz
    const { data: currentMonthExpenses } = await supabase
      .from('transactions')
      .select('amount, category_id')
      .eq('telegram_id', numTelegramId)
      .eq('type', 'EXPENSE')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)

    const expenses = currentMonthExpenses || []

    // Har bir byudjet uchun sarflangan summa va foizni hisoblaymiz
    const calculatedBudgets = (budgets || []).map((b: any) => {
      let spent = 0
      if (b.category_id) {
        spent = expenses
          .filter(e => e.category_id === b.category_id)
          .reduce((sum, e) => sum + Number(e.amount), 0)
      } else {
        // Umumiy byudjet bo'lsa - barcha xarajatlar
        spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
      }

      const limitAmount = Number(b.amount) || 0
      const percent = limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0
      const remaining = limitAmount - spent

      let status = 'NORMAL' // < 75%
      if (percent >= 100) {
        status = 'EXCEEDED' // >= 100%
      } else if (percent >= 75) {
        status = 'WARNING' // 75% - 99%
      }

      return {
        id: b.id,
        category_id: b.category_id,
        category_name: b.categories?.name || 'Umumiy oylik byudjet',
        amount: limitAmount,
        spent,
        remaining,
        percent,
        status,
        period: b.period || 'MONTHLY'
      }
    })

    return NextResponse.json({ budgets: calculatedBudgets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { telegram_id, category_id, amount, period } = body

    if (!telegram_id || !amount) {
      return NextResponse.json({ error: 'telegram_id and amount are required' }, { status: 400 })
    }

    const numTelegramId = Number(telegram_id)
    const numAmount = Number(amount)
    const budgetPeriod = period || 'MONTHLY'
    const finalCategoryId = category_id || null

    // Avval mavjudligini tekshiramiz (upsert uchun)
    let query = supabase
      .from('budgets')
      .select('id')
      .eq('telegram_id', numTelegramId)
      .eq('period', budgetPeriod)

    if (finalCategoryId) {
      query = query.eq('category_id', finalCategoryId)
    } else {
      query = query.is('category_id', null)
    }

    const { data: existing } = await query.maybeSingle()

    let resultData = null
    if (existing) {
      const { data, error } = await supabase
        .from('budgets')
        .update({ amount: numAmount })
        .eq('id', existing.id)
        .select('*, categories(name)')
        .single()
      if (error) throw error
      resultData = data
    } else {
      const { data, error } = await supabase
        .from('budgets')
        .insert({
          telegram_id: numTelegramId,
          category_id: finalCategoryId,
          amount: numAmount,
          period: budgetPeriod
        })
        .select('*, categories(name)')
        .single()
      if (error) throw error
      resultData = data
    }

    return NextResponse.json({ success: true, budget: resultData })
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

    let query = supabase.from('budgets').delete().eq('id', id)
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
