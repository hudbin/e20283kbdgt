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
      .select('*, categories(name), accounts(name, type, color)')
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
    const { telegram_id, category_id, account_id, amount, type, description, date } = body

    if (!telegram_id || !amount || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const numAmount = Number(amount)
    const numTelegramId = Number(telegram_id)

    // Agar account_id ko'rsatilmagan bo'lsa, default hisobni qidiramiz
    let finalAccountId = account_id || null
    if (!finalAccountId) {
      const { data: defaultAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('telegram_id', numTelegramId)
        .eq('is_default', true)
        .maybeSingle()
      if (defaultAcc) {
        finalAccountId = defaultAcc.id
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        telegram_id: numTelegramId,
        category_id: category_id || null,
        account_id: finalAccountId,
        amount: numAmount,
        type,
        description: description || '',
        date: date || new Date().toISOString()
      })
      .select('*, categories(name), accounts(name, type, color)')
      .single()

    if (error) throw error

    // Agar hisob bog'langan bo'lsa, uning balansini yangilaymiz
    if (finalAccountId) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', finalAccountId)
        .single()

      if (acc) {
        const currentBal = Number(acc.balance) || 0
        const newBal = type === 'INCOME' ? currentBal + numAmount : currentBal - numAmount
        await supabase
          .from('accounts')
          .update({ balance: newBal })
          .eq('id', finalAccountId)
      }
    }

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

    // O'chirishdan oldin tranzaksiyani tekshirib olamiz (balansni tiklash uchun)
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    let query = supabase.from('transactions').delete().eq('id', id)

    if (telegramId) {
      query = query.eq('telegram_id', Number(telegramId))
    }

    const { data, error } = await query.select()

    if (error) throw error

    // Agar hisob bog'langan bo'lsa, balansni orqaga qaytaramiz (rollback)
    if (existingTx && existingTx.account_id) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', existingTx.account_id)
        .single()

      if (acc) {
        const currentBal = Number(acc.balance) || 0
        const txAmount = Number(existingTx.amount) || 0
        // Agar INCOME o'chirilgan bo'lsa balansdan ayiramiz, EXPENSE o'chirilgan bo'lsa qaytarib qo'shamiz
        const restoredBal = existingTx.type === 'INCOME' ? currentBal - txAmount : currentBal + txAmount
        await supabase
          .from('accounts')
          .update({ balance: restoredBal })
          .eq('id', existingTx.account_id)
      }
    }

    return NextResponse.json({ success: true, message: "Tranzaksiya muvaffaqiyatli o'chirildi", deleted: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

