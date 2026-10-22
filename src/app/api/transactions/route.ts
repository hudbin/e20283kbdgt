import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getExchangeRates } from '@/lib/currency'
import { getAuthenticatedTelegramUser } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const auth = getAuthenticatedTelegramUser(req)
    const { searchParams } = new URL(req.url)
    const telegramId = auth ? auth.telegramId : Number(searchParams.get('telegram_id'))
    const spaceId = searchParams.get('space_id')

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 })
    }

    let query = supabase
      .from('transactions')
      .select('*, categories(name), accounts:account_id(name, type, color), to_accounts:to_account_id(name, type, color)')

    if (spaceId && spaceId !== 'personal') {
      query = query.eq('space_id', spaceId)
    } else {
      query = query.eq('telegram_id', Number(telegramId))
    }

    const { data: transactions, error } = await query.order('date', { ascending: false })

    if (error) {
      // Agar to_account_id ustuni hali bo'lmasa fallback
      let fallbackQuery = supabase
        .from('transactions')
        .select('*, categories(name), accounts:account_id(name, type, color)')

      if (spaceId && spaceId !== 'personal') {
        fallbackQuery = fallbackQuery.eq('space_id', spaceId)
      } else {
        fallbackQuery = fallbackQuery.eq('telegram_id', Number(telegramId))
      }

      const { data: fallbackTx, error: fbErr } = await fallbackQuery.order('date', { ascending: false })
      if (fbErr) throw fbErr
      return NextResponse.json({ transactions: fallbackTx || [] })
    }

    return NextResponse.json({ transactions: transactions || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = getAuthenticatedTelegramUser(req)
    const body = await req.json()
    const { telegram_id, category_id, account_id, to_account_id, amount, currency = 'UZS', type, description, date, space_id } = body

    const userTgId = auth ? auth.telegramId : Number(telegram_id)

    if (!userTgId || !amount || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const numAmount = Number(amount)
    const numTelegramId = userTgId
    const cur = (currency || 'UZS').toUpperCase()

    let exchangeRate = 1
    if (cur !== 'UZS') {
      try {
        const rates = await getExchangeRates()
        exchangeRate = (rates as any)[cur] || 1
      } catch (_) {}
    }

    // TRANSFER amaliyoti uchun alohida mantiq
    if (type === 'TRANSFER') {
      if (!account_id || !to_account_id) {
        return NextResponse.json({ error: "O'tkazma uchun chiqim va kirim hisoblari ko'rsatilishi shart" }, { status: 400 })
      }
      if (account_id === to_account_id) {
        return NextResponse.json({ error: "Bir xil hisoblar o'rtasida o'tkazma qilib bo'lmaydi" }, { status: 400 })
      }

      // Tranzaksiyani saqlaymiz
      const insertPayload: any = {
        telegram_id: numTelegramId,
        category_id: null,
        account_id,
        amount: numAmount,
        currency: cur,
        exchange_rate: exchangeRate,
        type: 'TRANSFER',
        description: description || "Hisoblararo o'tkazma",
        date: date || new Date().toISOString()
      }
      if (to_account_id) {
        insertPayload.to_account_id = to_account_id
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert(insertPayload)
        .select('*, categories(name), accounts:account_id(name, type, color), to_accounts:to_account_id(name, type, color)')
        .single()

      if (error) throw error

      // Chiqim hisobi balansini kamaytiramiz
      const { data: fromAcc } = await supabase.from('accounts').select('balance, currency').eq('id', account_id).single()
      if (fromAcc) {
        const fromBal = Number(fromAcc.balance) || 0
        const fromCur = (fromAcc.currency || 'UZS').toUpperCase()
        const deduct = fromCur === cur ? numAmount : numAmount * exchangeRate
        await supabase.from('accounts').update({ balance: fromBal - deduct }).eq('id', account_id)
      }

      // Kirim hisobi balansini oshiramiz
      const { data: toAcc } = await supabase.from('accounts').select('balance, currency').eq('id', to_account_id).single()
      if (toAcc) {
        const toBal = Number(toAcc.balance) || 0
        const toCur = (toAcc.currency || 'UZS').toUpperCase()
        const add = toCur === cur ? numAmount : numAmount * exchangeRate
        await supabase.from('accounts').update({ balance: toBal + add }).eq('id', to_account_id)
      }

      return NextResponse.json({ transaction: data })
    }

    // Oddiy INCOME yoki EXPENSE
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
        currency: cur,
        exchange_rate: exchangeRate,
        type,
        description: description || '',
        date: date || new Date().toISOString(),
        space_id: space_id && space_id !== 'personal' ? space_id : null
      })
      .select('*, categories(name), accounts:account_id(name, type, color)')
      .single()

    if (error) throw error

    // Agar hisob bog'langan bo'lsa, uning balansini yangilaymiz
    if (finalAccountId) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance, currency')
        .eq('id', finalAccountId)
        .single()

      if (acc) {
        const currentBal = Number(acc.balance) || 0
        const accCur = (acc.currency || 'UZS').toUpperCase()
        const changeAmount = accCur === cur ? numAmount : numAmount * exchangeRate
        const newBal = type === 'INCOME' ? currentBal + changeAmount : currentBal - changeAmount
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
    if (existingTx) {
      const txAmount = Number(existingTx.amount) || 0
      const txCur = (existingTx.currency || 'UZS').toUpperCase()
      const txRate = Number(existingTx.exchange_rate) || 1
      const getAmountForAccount = (accCur: string) => (accCur === txCur ? txAmount : txAmount * txRate)

      if (existingTx.type === 'TRANSFER') {
        // Chiqim hisobiga qaytarib qo'shamiz
        if (existingTx.account_id) {
          const { data: fromAcc } = await supabase.from('accounts').select('balance, currency').eq('id', existingTx.account_id).single()
          if (fromAcc) {
            const curVal = getAmountForAccount((fromAcc.currency || 'UZS').toUpperCase())
            await supabase.from('accounts').update({ balance: (Number(fromAcc.balance) || 0) + curVal }).eq('id', existingTx.account_id)
          }
        }
        // Kirim hisobidan qaytarib ayiramiz
        if (existingTx.to_account_id) {
          const { data: toAcc } = await supabase.from('accounts').select('balance, currency').eq('id', existingTx.to_account_id).single()
          if (toAcc) {
            const curVal = getAmountForAccount((toAcc.currency || 'UZS').toUpperCase())
            await supabase.from('accounts').update({ balance: (Number(toAcc.balance) || 0) - curVal }).eq('id', existingTx.to_account_id)
          }
        }
      } else if (existingTx.account_id) {
        const { data: acc } = await supabase
          .from('accounts')
          .select('balance, currency')
          .eq('id', existingTx.account_id)
          .single()

        if (acc) {
          const currentBal = Number(acc.balance) || 0
          const curVal = getAmountForAccount((acc.currency || 'UZS').toUpperCase())
          // Agar INCOME o'chirilgan bo'lsa balansdan ayiramiz, EXPENSE o'chirilgan bo'lsa qaytarib qo'shamiz
          const restoredBal = existingTx.type === 'INCOME' ? currentBal - curVal : currentBal + curVal
          await supabase
            .from('accounts')
            .update({ balance: restoredBal })
            .eq('id', existingTx.account_id)
        }
      }
    }

    return NextResponse.json({ success: true, message: "Tranzaksiya muvaffaqiyatli o'chirildi", deleted: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
