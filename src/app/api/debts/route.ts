import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const telegramId = searchParams.get('telegram_id')
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 })
    }

    let query = supabase
      .from('debts')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (type) {
      query = query.eq('type', type)
    }

    const { data: debts, error } = await query

    if (error) throw error

    return NextResponse.json({ debts: debts || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      telegram_id,
      person_name,
      type,
      amount,
      due_date,
      description,
      affect_wallet = true
    } = body

    if (!telegram_id || !person_name || !type || !amount) {
      return NextResponse.json({ error: 'Majburiy maydonlar to\'ldirilmagan' }, { status: 400 })
    }

    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: 'Noto\'g\'ri summa' }, { status: 400 })
    }

    // 1. Qarzlar jadvaliga qo'shish
    const { data: newDebt, error: debtError } = await supabase
      .from('debts')
      .insert({
        telegram_id: Number(telegram_id),
        person_name: person_name.trim(),
        type, // 'LENT', 'BORROWED', 'LOAN'
        amount: numAmount,
        paid_amount: 0,
        due_date: due_date || null,
        status: 'ACTIVE',
        description: description || ''
      })
      .select()
      .single()

    if (debtError) throw debtError

    // 2. Agar hamyon balansiga ta'sir qilishi so'ralgan bo'lsa:
    // - LENT (qarz berdim) -> Chiqim (cho'ntakdan ketdi)
    // - BORROWED / LOAN (qarz/kredit oldim) -> Kirim (cho'ntakka kirdi)
    if (affect_wallet && newDebt) {
      const txType = type === 'LENT' ? 'EXPENSE' : 'INCOME'
      const descLabel =
        type === 'LENT'
          ? `Qarz berildi: ${person_name}`
          : type === 'LOAN'
          ? `Kredit olindi: ${person_name}`
          : `Qarz olindi: ${person_name}`

      await supabase.from('transactions').insert({
        telegram_id: Number(telegram_id),
        amount: numAmount,
        type: txType,
        description: descLabel,
        debt_id: newDebt.id,
        date: new Date().toISOString()
      })
    }

    return NextResponse.json({ debt: newDebt })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, telegram_id, amount, note, mark_as_paid = false } = body

    if (!id || !telegram_id) {
      return NextResponse.json({ error: 'id va telegram_id kerak' }, { status: 400 })
    }

    // 1. Mavjud qarzni olamiz
    const { data: debt, error: fetchErr } = await supabase
      .from('debts')
      .select('*')
      .eq('id', id)
      .eq('telegram_id', Number(telegram_id))
      .single()

    if (fetchErr || !debt) {
      return NextResponse.json({ error: 'Qarz topilmadi' }, { status: 404 })
    }

    const payAmount = mark_as_paid ? Number(debt.amount) - Number(debt.paid_amount) : Number(amount)
    if (payAmount <= 0) {
      return NextResponse.json({ error: 'To\'lov summasi noto\'g\'ri' }, { status: 400 })
    }

    const newPaidAmount = Math.min(Number(debt.amount), Number(debt.paid_amount) + payAmount)
    const newStatus = newPaidAmount >= Number(debt.amount) ? 'PAID' : 'ACTIVE'

    // 2. Qarzni yangilaymiz
    const { data: updatedDebt, error: updateErr } = await supabase
      .from('debts')
      .update({
        paid_amount: newPaidAmount,
        status: newStatus
      })
      .eq('id', id)
      .select()
      .single()

    if (updateErr) throw updateErr

    // 3. Hamyonga mos tranzaksiya kiritamiz:
    // - LENT (men bergan qarzim qaytib kelsa) -> Kirim (+payAmount)
    // - BORROWED / LOAN (olgan qarzim/kreditimni to'lasam) -> Chiqim (-payAmount)
    const txType = debt.type === 'LENT' ? 'INCOME' : 'EXPENSE'
    const descLabel =
      debt.type === 'LENT'
        ? `Qarz qaytdi: ${debt.person_name}${note ? ` (${note})` : ''}`
        : debt.type === 'LOAN'
        ? `Kredit to'landi: ${debt.person_name}${note ? ` (${note})` : ''}`
        : `Qarz qaytarildi: ${debt.person_name}${note ? ` (${note})` : ''}`

    await supabase.from('transactions').insert({
      telegram_id: Number(telegram_id),
      amount: payAmount,
      type: txType,
      description: descLabel,
      debt_id: debt.id,
      date: new Date().toISOString()
    })

    return NextResponse.json({ debt: updatedDebt })
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
      .from('debts')
      .delete()
      .eq('id', id)
      .eq('telegram_id', Number(telegramId))

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
