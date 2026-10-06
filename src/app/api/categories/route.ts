import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const telegramId = searchParams.get('telegram_id')
    const type = searchParams.get('type')

    let query = supabase.from('categories').select('*')

    if (telegramId) {
      query = query.or(`telegram_id.eq.${Number(telegramId)},is_default.eq.true`)
    } else {
      query = query.eq('is_default', true)
    }

    if (type) {
      query = query.eq('type', type)
    }

    const { data: categories, error } = await query.order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ categories: categories || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { telegram_id, name, type } = body

    if (!telegram_id || !name || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        telegram_id: Number(telegram_id),
        name,
        type,
        is_default: false
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ category: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
