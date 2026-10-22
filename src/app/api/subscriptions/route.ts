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

    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('*, categories(name), accounts(name, color)')
      .eq('telegram_id', Number(telegramId))
      .order('billing_day', { ascending: true })

    if (error) {
      return NextResponse.json({ subscriptions: [] })
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const todayDay = now.getDate()

    const calculatedSubs = (subs || []).map((s: any) => {
      const bDay = Number(s.billing_day) || 1
      let nextDate: Date

      if (bDay >= todayDay) {
        nextDate = new Date(currentYear, currentMonth, bDay, 23, 59, 59)
      } else {
        nextDate = new Date(currentYear, currentMonth + 1, bDay, 23, 59, 59)
      }

      const diffMs = nextDate.getTime() - now.getTime()
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      return {
        ...s,
        amount: Number(s.amount) || 0,
        next_billing_date: nextDate.toISOString(),
        days_left: daysLeft
      }
    })

    // Eng yaqin to'lanadigan obunalar birinchi kelishi uchun saralaymiz
    calculatedSubs.sort((a, b) => a.days_left - b.days_left)

    return NextResponse.json({ subscriptions: calculatedSubs })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      telegram_id,
      name,
      amount,
      currency = 'UZS',
      billing_day,
      category_id = null,
      account_id = null,
      period = 'MONTHLY'
    } = body

    if (!telegram_id || !name || !amount || !billing_day) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        telegram_id: Number(telegram_id),
        name: name.trim(),
        amount: Number(amount),
        currency: (currency || 'UZS').toUpperCase(),
        billing_day: Number(billing_day),
        category_id: category_id || null,
        account_id: account_id || null,
        period: period || 'MONTHLY',
        status: 'ACTIVE'
      })
      .select('*, categories(name), accounts(name)')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, subscription: data })
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

    let query = supabase.from('subscriptions').delete().eq('id', id)
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
