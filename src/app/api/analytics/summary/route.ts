import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getExchangeRates, convertToUZS } from '@/lib/currency'
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
    const rates = await getExchangeRates()

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

    // Aktivlar (Mavjud barcha pullar CBU kursi bilan UZS ga o'girilib hisoblanadi)
    const totalAssets = userAccounts.reduce((sum, acc) => {
      const bal = Number(acc.balance) || 0
      return sum + Math.max(0, convertToUZS(bal, acc.currency, rates))
    }, 0)

    // Majburiyatlar: Mening qarzlarim va kreditlarim (BORROWED, LOAN)
    const borrowedDebts = userDebts.filter(d => d.type === 'BORROWED' || d.type === 'LOAN')
    const totalLiabilities = borrowedDebts.reduce((sum, d) => {
      const rem = Math.max(0, Number(d.amount) - Number(d.paid_amount))
      return sum + convertToUZS(rem, d.currency, rates)
    }, 0)

    // Menga qaytishi kerak bo'lgan qarzlar (Receivables)
    const lentDebts = userDebts.filter(d => d.type === 'LENT')
    const totalReceivables = lentDebts.reduce((sum, d) => {
      const rem = Math.max(0, Number(d.amount) - Number(d.paid_amount))
      return sum + convertToUZS(rem, d.currency, rates)
    }, 0)

    // Sof boylik (Net Worth) = Hamyonlardagi pullar + Menga qaytishi kerak qarzlar - Mening barcha qarz/kreditlarim
    const netWorth = totalAssets + totalReceivables - totalLiabilities
    const netWorthUsd = rates.USD > 0 ? (netWorth / rates.USD).toFixed(1) : "0"

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

    // 5. Byudjetlar (Budgets)
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString()
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).toISOString()

    const { data: userBudgets } = await supabase
      .from('budgets')
      .select('*, categories(name, type)')
      .eq('telegram_id', numTelegramId)

    const { data: monthExpenses } = await supabase
      .from('transactions')
      .select('amount, category_id')
      .eq('telegram_id', numTelegramId)
      .eq('type', 'EXPENSE')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)

    const expList = monthExpenses || []
    const totalMonthExpense = expList.reduce((sum, e) => sum + Number(e.amount), 0)

    const budgetsWithSpent = (userBudgets || []).map((b: any) => {
      let spent = 0
      if (b.category_id) {
        spent = expList
          .filter(e => e.category_id === b.category_id)
          .reduce((sum, e) => sum + Number(e.amount), 0)
      } else {
        spent = totalMonthExpense
      }

      const limitAmount = Number(b.amount) || 0
      const percent = limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0
      const remaining = limitAmount - spent

      let status = 'NORMAL'
      if (percent >= 100) status = 'EXCEEDED'
      else if (percent >= 75) status = 'WARNING'

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

    // 6. Jamg'arma Maqsadlari (Goals)
    const { data: userGoals } = await supabase
      .from('goals')
      .select('*')
      .eq('telegram_id', numTelegramId)
      .order('created_at', { ascending: false })

    const calculatedGoals = (userGoals || []).map((g: any) => {
      const target = Number(g.target_amount) || 0
      const current = Number(g.current_amount) || 0
      const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
      const remaining = Math.max(0, target - current)

      let daysLeft: number | null = null
      let monthlyNeeded: number | null = null

      if (g.deadline) {
        const dDate = new Date(g.deadline)
        const diffMs = dDate.getTime() - now.getTime()
        daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        if (daysLeft > 0 && remaining > 0) {
          const monthsLeft = Math.max(1, daysLeft / 30.4)
          monthlyNeeded = Math.round(remaining / monthsLeft)
        }
      }

      return {
        ...g,
        target_amount: target,
        current_amount: current,
        percent,
        remaining,
        days_left: daysLeft,
        monthly_needed: monthlyNeeded
      }
    })

    // 7. Obunalar va Muntazam to'lovlar (Subscriptions)
    const { data: userSubs } = await supabase
      .from('subscriptions')
      .select('*, categories(name)')
      .eq('telegram_id', numTelegramId)
      .eq('status', 'ACTIVE')
      .order('billing_day', { ascending: true })

    const calculatedSubs = (userSubs || []).map((s: any) => {
      const bDay = Number(s.billing_day) || 1
      let nextDate: Date
      if (bDay >= todayDate) {
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
    }).sort((a: any, b: any) => a.days_left - b.days_left)

    return NextResponse.json({
      net_worth: netWorth,
      net_worth_usd: Number(netWorthUsd),
      exchange_rates: rates,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_receivables: totalReceivables,
      accounts: userAccounts,
      upcoming_payments: upcomingPayments,
      credit_cards: creditCards,
      budgets: budgetsWithSpent,
      goals: calculatedGoals,
      subscriptions: calculatedSubs,
      total_month_expense: totalMonthExpense
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
