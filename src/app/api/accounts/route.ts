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

    // Foydalanuvchining hisoblarini olamiz
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('telegram_id', numTelegramId)
      .order('created_at', { ascending: true })

    if (error) {
      // Agar jadval hali bo'lmasa yoki xato bo'lsa
      console.error('Error fetching accounts:', error)
      return NextResponse.json({ accounts: [] })
    }

    // Agar foydalanuvchida hali hech qanday hisob bo'lmasa, boshlang'ich hisoblarni yaratamiz
    if (!accounts || accounts.length === 0) {
      const defaultAccounts = [
        {
          telegram_id: numTelegramId,
          name: 'Asosiy karta',
          type: 'DEBIT_CARD',
          balance: 0,
          is_default: true,
          color: 'blue'
        },
        {
          telegram_id: numTelegramId,
          name: 'Naqd pul',
          type: 'CASH',
          balance: 0,
          is_default: false,
          color: 'emerald'
        }
      ]

      const { data: createdDefaults } = await supabase
        .from('accounts')
        .insert(defaultAccounts)
        .select()

      return NextResponse.json({ accounts: createdDefaults || [] })
    }

    return NextResponse.json({ accounts: accounts || [] })
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
      type = 'DEBIT_CARD',
      currency = 'UZS',
      balance = 0,
      credit_limit = 0,
      grace_due_day = null,
      color = 'blue',
      is_default = false
    } = body

    if (!telegram_id || !name) {
      return NextResponse.json({ error: "telegram_id va hisob nomi majburiy" }, { status: 400 })
    }

    // Agar bu hisob default qilinsa, boshqalarini default emas qilish
    if (is_default) {
      await supabase
        .from('accounts')
        .update({ is_default: false })
        .eq('telegram_id', Number(telegram_id))
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        telegram_id: Number(telegram_id),
        name: name.trim(),
        type,
        currency: (currency || 'UZS').toUpperCase(),
        balance: Number(balance) || 0,
        credit_limit: Number(credit_limit) || 0,
        grace_due_day: grace_due_day ? Number(grace_due_day) : null,
        color,
        is_default: Boolean(is_default)
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ account: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, telegram_id, name, type, balance, credit_limit, grace_due_day, color, is_default } = body

    if (!id || !telegram_id) {
      return NextResponse.json({ error: 'id va telegram_id kerak' }, { status: 400 })
    }

    if (is_default) {
      await supabase
        .from('accounts')
        .update({ is_default: false })
        .eq('telegram_id', Number(telegram_id))
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (type !== undefined) updateData.type = type
    if (balance !== undefined) updateData.balance = Number(balance)
    if (credit_limit !== undefined) updateData.credit_limit = Number(credit_limit)
    if (grace_due_day !== undefined) updateData.grace_due_day = grace_due_day ? Number(grace_due_day) : null
    if (color !== undefined) updateData.color = color
    if (is_default !== undefined) updateData.is_default = Boolean(is_default)

    const { data, error } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .eq('telegram_id', Number(telegram_id))
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ account: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const telegramId = searchParams.get('telegram_id')

    if (!id || !telegramId) {
      return NextResponse.json({ error: 'id va telegram_id kerak' }, { status: 400 })
    }

    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id)
      .eq('telegram_id', Number(telegramId))

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
