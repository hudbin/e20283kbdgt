import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const telegramId = searchParams.get('telegram_id')

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 })
    }

    const numTelegramId = Number(telegramId)

    // 1. Hisoblar (Accounts)
    const { data: accounts, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('telegram_id', numTelegramId)

    // 2. Qarzlar va kreditlar (Debts)
    const { data: debts, error: debtErr } = await supabase
      .from('debts')
      .select('*, accounts(name, color)')
      .eq('telegram_id', numTelegramId)
      .eq('status', 'ACTIVE')

    const userAccounts = accounts || []
    const userDebts = debts || []

    // Aktivlar (Mavjud barcha pullar: naqd pul, debet kartalar va kredit kartalarning musbat qoldiqlari)
    const totalAssets = userAccounts.reduce((sum, acc) => sum + Math.max(0, Number(acc.balance) || 0), 0)

    // Majburiyatlar: Mening qarzlarim va kreditlarim (BORROWED, LOAN)
    // LENT - bu menga qaytishi kerak bo'lgan pul (aktiv qarz)
    const borrowedDebts = userDebts.filter(d => d.type === 'BORROWED' || d.type === 'LOAN')
    const totalLiabilities = borrowedDebts.reduce((sum, d) => sum + Math.max(0, Number(d.amount) - Number(d.paid_amount)), 0)

    // Menga qaytishi kerak bo'lgan qarzlar (Receivables)
    const lentDebts = userDebts.filter(d => d.type === 'LENT')
    const totalReceivables = lentDebts.reduce((sum, d) => sum + Math.max(0, Number(d.amount) - Number(d.paid_amount)), 0)

    // Sof boylik (Net Worth) = Hamyonlardagi pullar + Menga qaytishi kerak qarzlar - Mening barcha qarz/kreditlarim
    const netWorth = totalAssets + totalReceivables - totalLiabilities

    // 3. Yaqinlashib kelayotgan to'lovlar (Upcoming Payments Pipeline)
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-indexed
    const todayDate = now.getDate()

    const upcomingPayments: any[] = []

    for (const d of borrowedDebts) {
      const remainingDebt = Math.max(0, Number(d.amount) - Number(d.paid_amount))
      if (remainingDebt <= 0) continue

      let payDate: Date | null = null
      let targetDay = d.payment_day || (d.grace_due_day ? d.grace_due_day : null)

      // Agar qarzda payment_day bo'lsa (oylik muntazam to'lov kuni)
      if (targetDay) {
        if (targetDay >= todayDate) {
          // Bu oyda hali kelmagan
          payDate = new Date(currentYear, currentMonth, targetDay, 23, 59, 59)
        } else {
          // Keyingi oyga o'tgan
          payDate = new Date(currentYear, currentMonth + 1, targetDay, 23, 59, 59)
        }
      } else if (d.due_date) {
        // Aniq muddat sanasi bo'lsa
        payDate = new Date(d.due_date)
      }

      if (payDate) {
        const diffTime = payDate.getTime() - now.getTime()
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        upcomingPayments.push({
          id: d.id,
          person_name: d.person_name,
          type: d.type,
          is_credit_card: Boolean(d.is_credit_card),
          remaining_debt: remainingDebt,
          payment_amount: d.is_credit_card ? remainingDebt : (Number(d.monthly_payment) > 0 ? Number(d.monthly_payment) : remainingDebt),
          due_date: payDate.toISOString(),
          days_left: daysLeft,
          account_name: d.accounts?.name || null
        })
      }
    }

    // Sanasi bo'yicha eng yaqini birinchi kelishi uchun saralaymiz
    upcomingPayments.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

    // 4. Kredit kartalar ro'yxati (Grace period vizualizatsiyasi uchun)
    const creditCards = userDebts
      .filter(d => d.is_credit_card)
      .map(card => {
        const spentAmount = Math.max(0, Number(card.amount) - Number(card.paid_amount))
        const limit = Number(card.credit_limit) || Number(card.amount) || 0
        const availableLimit = Math.max(0, limit - spentAmount)
        const targetDay = card.grace_due_day || 20

        let graceDate: Date
        if (targetDay >= todayDate) {
          graceDate = new Date(currentYear, currentMonth, targetDay, 23, 59, 59)
        } else {
          graceDate = new Date(currentYear, currentMonth + 1, targetDay, 23, 59, 59)
        }

        const daysLeft = Math.ceil((graceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        return {
          id: card.id,
          name: card.person_name,
          credit_limit: limit,
          spent_amount: spentAmount,
          available_limit: availableLimit,
          grace_due_day: targetDay,
          grace_due_date: graceDate.toISOString(),
          days_left: daysLeft
        }
      })

    return NextResponse.json({
      net_worth: netWorth,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_receivables: totalReceivables,
      accounts: userAccounts,
      upcoming_payments: upcomingPayments,
      credit_cards: creditCards
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
