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

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    let id = searchParams.get('id')
    let telegramId = searchParams.get('telegram_id')

    if (!id) {
      try {
        const body = await req.json()
        id = body?.id
        if (body?.telegram_id) {
          telegramId = String(body.telegram_id)
        }
      } catch (_) {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Tranzaksiya id majburiy' }, { status: 400 })
    }

    let query = supabase.from('transactions').delete().eq('id', id)

    if (telegramId) {
      query = query.eq('telegram_id', Number(telegramId))
    }

    const { data, error } = await query.select()

    if (error) throw error

    return NextResponse.json({ success: true, message: "Tranzaksiya muvaffaqiyatli o'chirildi", deleted: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

