import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const telegramId = searchParams.get('telegram_id')

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 })
    }

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('telegram_id', Number(telegramId))
      .order('date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ transactions: transactions || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { telegram_id, category_id, amount, type, description, date } = body

    if (!telegram_id || !amount || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        telegram_id: Number(telegram_id),
        category_id: category_id || null,
        amount: Number(amount),
        type,
        description: description || '',
        date: date || new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ transaction: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
