export interface ExchangeRates {
  USD: number
  EUR: number
  RUB: number
  updatedAt: number
}

let cachedRates: ExchangeRates | null = null
const CACHE_DURATION_MS = 60 * 60 * 1000 // 1 soat kesh

// Standart zaxira kurslar (CBU serveriga ulanib bo'lmaganda)
const DEFAULT_RATES: ExchangeRates = {
  USD: 12850,
  EUR: 13950,
  RUB: 135,
  updatedAt: 0
}

/**
 * Markaziy Bank (CBU) rasmiy kurslarini olish
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now()
  if (cachedRates && now - cachedRates.updatedAt < CACHE_DURATION_MS) {
    return cachedRates
  }

  try {
    const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', {
      next: { revalidate: 3600 }
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        const usdItem = data.find((item: any) => item.Ccy === 'USD')
        const eurItem = data.find((item: any) => item.Ccy === 'EUR')
        const rubItem = data.find((item: any) => item.Ccy === 'RUB')

        const rates: ExchangeRates = {
          USD: usdItem ? parseFloat(usdItem.Rate) || DEFAULT_RATES.USD : DEFAULT_RATES.USD,
          EUR: eurItem ? parseFloat(eurItem.Rate) || DEFAULT_RATES.EUR : DEFAULT_RATES.EUR,
          RUB: rubItem ? parseFloat(rubItem.Rate) || DEFAULT_RATES.RUB : DEFAULT_RATES.RUB,
          updatedAt: now
        }

        cachedRates = rates
        return rates
      }
    }
  } catch (error) {
    console.warn("[Currency] CBU kurslarini olishda xatolik, zaxira kurs ishlatiladi:", error)
  }

  return cachedRates || DEFAULT_RATES
}

/**
 * Har qanday valyutadagi summani UZS ga konvertatsiya qilish
 */
export function convertToUZS(amount: number, currency: string = 'UZS', rates?: ExchangeRates): number {
  const cur = (currency || 'UZS').toUpperCase()
  if (cur === 'UZS') return amount

  const r = rates || cachedRates || DEFAULT_RATES
  if (cur === 'USD') return amount * r.USD
  if (cur === 'EUR') return amount * r.EUR
  if (cur === 'RUB') return amount * r.RUB

  return amount
}

/**
 * Chiroyli formatlash
 */
export function formatCurrency(amount: number, currency: string = 'UZS'): string {
  const cur = (currency || 'UZS').toUpperCase()
  const formattedNum = Number(amount).toLocaleString('uz-UZ')

  if (cur === 'USD') return `$${formattedNum}`
  if (cur === 'EUR') return `€${formattedNum}`
  if (cur === 'RUB') return `${formattedNum} ₽`
  return `${formattedNum} so'm`
}
