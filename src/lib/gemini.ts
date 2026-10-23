import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let liveActiveModels: string[] = []
let lastFetchedTime = 0

async function getLiveActiveModels(): Promise<string[]> {
  const now = Date.now()
  if (liveActiveModels.length > 0 && now - lastFetchedTime < 30 * 60 * 1000) {
    return liveActiveModels
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (res.ok) {
      const data = await res.json()
      if (data.models && Array.isArray(data.models)) {
        const valid = data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''))

        valid.sort((a: string, b: string) => {
          const aFlash = a.includes('flash') ? -1 : 1
          const bFlash = b.includes('flash') ? -1 : 1
          return aFlash - bFlash
        })

        if (valid.length > 0) {
          liveActiveModels = valid
          lastFetchedTime = now
          return liveActiveModels
        }
      }
    }
  } catch (err: any) {
    console.warn('[AI] Jonli modellarni tekshirishda xatolik:', err?.message)
  }

  return [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash'
  ]
}

async function generateWithSafety(
  promptOrParts: any,
  jsonMode: boolean = true,
  maxRetries: number = 2
) {
  const activeModels = await getLiveActiveModels()
  let lastError: any = null

  // Prioritize active fast/stable models (3.5-flash, 3.5-flash-lite, 3.1-flash-lite, 3.8-flash)
  const priorityList = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ]

  const sortedModels = [
    ...priorityList.filter((m) => activeModels.includes(m)),
    ...activeModels.filter((m) => !priorityList.includes(m))
  ]

  for (const modelName of sortedModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {})
      })

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await model.generateContent(promptOrParts)
          const text = result.response.text()
          if (text) {
            return text
          }
        } catch (err: any) {
          lastError = err
          const status = err?.status || err?.statusCode
          const isOverloaded =
            status === 503 ||
            status === 429 ||
            err?.message?.includes('high demand') ||
            err?.message?.includes('Overloaded') ||
            err?.message?.includes('Resource has been exhausted')

          if (isOverloaded && attempt < maxRetries) {
            await sleep(1500)
            continue
          }
          break
        }
      }
    } catch (err: any) {
      lastError = err
    }
  }

  throw lastError || new Error("AI serverlari hozirda band.")
}

export interface CategoryContextItem {
  name: string
  type?: 'EXPENSE' | 'INCOME' | string
}

export function formatCategoriesPrompt(categories: Array<CategoryContextItem | string> = []): string {
  if (!categories || categories.length === 0) {
    return `Kategoriya tanlashda: Xarajat yoki kirim mazmuniga mos, qisqa va aniq yangi kategoriya nomini taklif qil (masalan: "Oziq-ovqat", "Transport", "Kiyim", "Maosh"). "is_new_category": true deb belgilang.`
  }

  const expenseList: string[] = []
  const incomeList: string[] = []
  const genericList: string[] = []

  for (const item of categories) {
    if (typeof item === 'string') {
      genericList.push(item)
    } else if (item.type === 'INCOME') {
      incomeList.push(item.name)
    } else if (item.type === 'EXPENSE') {
      expenseList.push(item.name)
    } else {
      genericList.push(item.name)
    }
  }

  let text = `Foydalanuvchining ma'lumotlar bazasidagi mavjud kategoriyalari:`
  if (expenseList.length > 0) {
    text += `\n- Chiqimlar (EXPENSE) uchun mavjud: [${expenseList.join(', ')}]`
  }
  if (incomeList.length > 0) {
    text += `\n- Kirimlar (INCOME) uchun mavjud: [${incomeList.join(', ')}]`
  }
  if (genericList.length > 0) {
    text += `\n- Boshqa mavjud: [${genericList.join(', ')}]`
  }

  text += `

MUHIM KATEGORIYA TANLASH QOIDASI:
1. Birinchi navbatda xabar mazmunini chuqur tahlil qilib, yuqoridagi MAVJUD kategoriyalar ro'yxatidan eng mos keladiganini tanla.
   - Masalan: Agar mavjud kategoriyalar ichida "Transport" bo'lsa va foydalanuvchi "taksiga 15000", "benzinga 50000" yoki "avtobusga 2000" desa, yangi kategoriya yaratmasdan AYNAN "Transport" deb tanla va "is_new_category": false qil.
   - Agar mavjud kategoriyalar ichida "Oziq-ovqat" bo'lsa va foydalanuvchi "lavash 35000", "non 4000", "bozorlik 120000" desa, AYNAN "Oziq-ovqat" deb tanla va "is_new_category": false qil.
2. Faqat va faqat yuqoridagi mavjud ro'yxatda xabar mazmuniga mos keladigan biron bir kategoriya mutlaqo bo'lmasa (yoki mos kelishi juda noaniq bo'lsa), o'zing eng munosib yangi kategoriya nomini taklif qil va "is_new_category": true deb belgilang.`

  return text
}

export interface AccountContextItem {
  id: string
  name: string
  type: string
}

export function formatAccountsPrompt(accounts: Array<AccountContextItem | string> = []): string {
  if (!accounts || accounts.length === 0) {
    return ''
  }

  const list = accounts.map(a => (typeof a === 'string' ? a : `${a.name} (${a.type})`))
  return `Foydalanuvchining hisoblari va kartalari (Accounts): [${list.join(', ')}]
Agar xabarda ushbu hisoblardan biri aytilgan yoki nazarda tutilgan bo'lsa (masalan "Anorbankdan 50 ming", "Uzcardga tushdi", "Kredit kartadan ishlatdim"), mos hisob nomini "account_name" ga yoz. Agar xabarda aniq aytilmagan bo'lsa, "account_name": null qoldir.`
}

/**
 * Matnli xabarni niyatini aniqlash:
 * - TRANSACTION (oddiy kiritish)
 * - DEBT (qarz berish, qarz olish, kredit, qarz qaytarish)
 * - REPORT (fayl sifatida hisobot so'rash)
 * - QUERY (savol/tahlil so'rash)
 * - OTHER
 */
export async function analyzeTextMessage(
  text: string,
  existingCategories: Array<CategoryContextItem | string> = [],
  existingAccounts: Array<AccountContextItem | string> = []
) {
  const categoriesContext = formatCategoriesPrompt(existingCategories)
  const accountsContext = formatAccountsPrompt(existingAccounts)

  const prompt = `
Sen aqlli shaxsiy moliyaviy yordamchi AIsan. Foydalanuvchi quyidagi xabarni yozdi: "${text}"

${categoriesContext}

${accountsContext}

Vazifang xabarni quyidagi turlardan biriga ajratish:
1. REPORT: Foydalanuvchi hisobotni fayl (PDF/Excel) sifatida so'ragan bo'lsa (masalan: "O'tgan oy hisobotini ber pdf va excel fayllarni", "bu oylik hisobotni excelda tashla", "menga hisobot faylini yubor", "pdf hisobot ber").
   Bunda:
   action: "REPORT"
   report_period: "month" | "last_month" | "year" | "all"
   report_formats: ("pdf" | "excel") ro'yxati (masalan: ["pdf", "excel"] yoki faqat ["pdf"])

2. TRANSFER: Hisoblararo pul o'tkazish, kartadan naqd pul yechish (bankomat) yoki naqd pulni kartaga kiritish.
   Misollar:
   - "Uzcarddan naqdga 200 ming yechdim" -> action: "TRANSFER", amount: 200000, from_account_name: "Uzcard", to_account_name: "Naqd"
   - "Humodan Anorbankka 500 ming o'tkazdim" -> action: "TRANSFER", amount: 500000, from_account_name: "Humo", to_account_name: "Anorbank"
   - "Bankomatdan kartamdan 100 ming naqd pul yechdim" -> action: "TRANSFER", amount: 100000, from_account_name: "Karta", to_account_name: "Naqd"
   - "Naqd puldan kartamga 300 ming tashladim" -> action: "TRANSFER", amount: 300000, from_account_name: "Naqd", to_account_name: "Karta"
   Bunda:
   action: "TRANSFER"
   amount: son
   from_account_name: qaysi hisob/kartadan pul chiqdi
   to_account_name: qaysi hisob/kartaga pul kirdi
   description: qisqa izoh

3. DEBT: Qarz berish, qarz olish, bank krediti, mikroqarz olish, qarzni qaytarish yoki kredit to'lash bilan bog'liq amallar.
   Misollar:
   - "Aliga 200 ming qarz berdim" -> action: "DEBT", debt_action: "LEND", person_name: "Ali", amount: 200000
   - "Vali akadan 500 ming qarz oldim" -> action: "DEBT", debt_action: "BORROW", person_name: "Vali aka", amount: 500000
   - "TBC dan 5 mln mikroqarz oldim" -> action: "DEBT", debt_action: "LOAN", person_name: "TBC", amount: 5000000
   - "Bankdan 10 mln kredit oldim" -> action: "DEBT", debt_action: "LOAN", person_name: "Bank", amount: 10000000
   - "Vali akaga 500 ming qarzni qaytardim" -> action: "DEBT", debt_action: "REPAY", person_name: "Vali aka", amount: 500000
   - "TBC kreditiga 600 ming to'ladim" -> action: "DEBT", debt_action: "REPAY", person_name: "TBC", amount: 600000
   - "Ali 200 ming qarzini qaytardi" -> action: "DEBT", debt_action: "RECEIVE", person_name: "Ali", amount: 200000
   Bunda:
   action: "DEBT"
   debt_action: "LEND" | "BORROW" | "LOAN" | "REPAY" | "RECEIVE"
   person_name: Shaxs yoki bank/tashkilot nomi
   amount: son
   due_date: string | null (agar qaytarish sanasi ko'rsatilgan bo'lsa)
   description: qisqa izoh

4. TRANSACTION: Oddiy xarajat yoki daromad kiritish bo'lsa (masalan: "2 ta flesh oldim 30 ming", "Anorbankdan 15000 taksiga ketdi", "oylik tushdi 3 mln", "50$ ga ko'ylak oldim").
   SHUNINGDEK BANK SMS XABARLARI (Payme, Click, Uzum, Banklar):
   Foydalanuvchi bank yoki to'lov tizimidan kelgan SMS'ni yuborganida:
   - Masalan: "Oplata: KORZINKA. Summa: 145 000 UZS. Karta: *1234" -> type: "EXPENSE", amount: 145000, category: "Oziq-ovqat", description: "KORZINKA (SMS)"
   - "Spisanie 45 000.00 UZS; Karta *8899; YANDEX GO" -> type: "EXPENSE", amount: 45000, category: "Transport", description: "YANDEX GO (SMS)"
   - "Zachislenie 3 000 000 UZS; Karta *1122; Otpravitel: OOO IT" -> type: "INCOME", amount: 3000000, category: "Daromad", description: "Kirim (SMS)"
   - "Perevod na kartu *4321: 100 000 UZS" -> type: "EXPENSE", amount: 100000, category: "O'tkazma", description: "Kartaga o'tkazma"
   Bunda:
   action: "TRANSACTION"
   type: "EXPENSE" yoki "INCOME"
   amount: son
   currency: "UZS" | "USD" | "EUR" | "RUB" (agar $ / dollar / usd bo'lsa "USD", evro bo'lsa "EUR", rubl bo'lsa "RUB", aks holda "UZS")
   category: Kategoriya nomi (mavjud ro'yxatdan eng mosi yoki yangi taklif)
   is_new_category: boolean (mavjud bo'lsa false, yangi taklif bo'lsa true)
   account_name: Foydalanuvchi aytgan yoki SMS dagi karta/hisob nomi yoki null
   description: qisqa izoh

5. GOAL: Moliyaviy jamg'arma maqsadiga (kopilka) pul qo'shish yoki yechish (masalan: "Umra maqsadimga 500 ming qo'shdim", "Mashina uchun 100$ jamg'ardim", "Kopilkaga 200 ming soldim").
   Bunda:
   action: "GOAL"
   goal_name: Maqsad nomi (masalan "Umra", "Mashina", "Kopilka")
   amount: son
   currency: "UZS" | "USD" | "EUR" | "RUB"

6. QUERY: O'z budjeti, kreditlari, kredit kartalari yoki qarzlari haqida savol/tahlil so'ragan bo'lsa (masalan: "Bu oy qancha kredit to'lashim kerak?", "Kredit kartamda qancha foizsiz davr qoldi?", "Oxirgi oyda oziq-ovqatga qancha sarfladim?", "Menda qancha balans qoldi?").
   action: "QUERY"

7. OTHER: Boshqa har qanday suhbat yoki noaniq gap.
   action: "OTHER"

Sening javobing FAQAT quyidagi JSON formatida bo'lsin:
{
  "action": "TRANSACTION" | "TRANSFER" | "DEBT" | "GOAL" | "REPORT" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "currency": "UZS" | "USD" | "EUR" | "RUB",
  "category": string | null,
  "is_new_category": boolean | null,
  "account_name": string | null,
  "from_account_name": string | null,
  "to_account_name": string | null,
  "goal_name": string | null,
  "debt_action": "LEND" | "BORROW" | "LOAN" | "REPAY" | "RECEIVE" | null,
  "person_name": string | null,
  "due_date": string | null,
  "description": string | null,
  "report_period": "month" | "last_month" | "year" | "all" | null,
  "report_formats": ["pdf", "excel"] | null
}
`
  return generateWithSafety(prompt, true)
}

/**
 * Ovozli xabarni tahlil qilish
 */
export async function analyzeAudioMessage(
  audioBase64: string,
  mimeType: string = 'audio/ogg',
  existingCategories: Array<CategoryContextItem | string> = [],
  existingAccounts: Array<AccountContextItem | string> = []
) {
  const categoriesContext = formatCategoriesPrompt(existingCategories)
  const accountsContext = formatAccountsPrompt(existingAccounts)

  const prompt = `
Foydalanuvchi ovozli xabar yubordi.
Audioni diqqat bilan tingla va quyidagi JSON formatida natija ber:
${categoriesContext}
${accountsContext}

1. Agar hisoblararo o'tkazma yoki naqd yechish/to'ldirish bo'lsa -> action: "TRANSFER", amount, from_account_name, to_account_name, description
2. Agar yangi oddiy kirim yoki chiqim bo'lsa -> action: "TRANSACTION", type: "EXPENSE"|"INCOME", amount, category, account_name, description
3. Agar qarz berish, qarz olish, kredit olish yoki qarzni to'lash bo'lsa -> action: "DEBT", debt_action: "LEND"|"BORROW"|"LOAN"|"REPAY"|"RECEIVE", person_name, amount, due_date
4. Agar hisobot faylini (PDF yoki Excel) so'rayotgan bo'lsa -> action: "REPORT", report_period: "month"|"last_month"|"year"|"all", report_formats: ["pdf", "excel"]
5. Agar savol yoki tahlil so'rayotgan bo'lsa (masalan "Kreditlarim qancha qoldi?") -> action: "QUERY"
6. Noma'lum bo'lsa -> action: "OTHER"

Javobni FAQAT to'g'ri JSON formatida qaytar:
{
  "action": "TRANSACTION" | "TRANSFER" | "DEBT" | "REPORT" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "currency": "UZS" | "USD" | "EUR" | "RUB",
  "category": string | null,
  "is_new_category": boolean | null,
  "account_name": string | null,
  "from_account_name": string | null,
  "to_account_name": string | null,
  "debt_action": "LEND" | "BORROW" | "LOAN" | "REPAY" | "RECEIVE" | null,
  "person_name": string | null,
  "due_date": string | null,
  "description": string | null,
  "report_period": "month" | "last_month" | "year" | "all" | null,
  "report_formats": ["pdf", "excel"] | null
}
`
  const parts = [
    prompt,
    {
      inlineData: {
        data: audioBase64,
        mimeType: mimeType
      }
    }
  ]

  return generateWithSafety(parts, true)
}

/**
 * Chek / Kvitansiya rasmi (Image) yoki PDF kvitansiyasini tahlil qilish
 */
export async function analyzeMediaReceipt(
  mediaBase64: string,
  mimeType: string,
  userCaption: string = '',
  existingCategories: Array<{ name: string; type: string }> = [],
  existingAccounts: Array<{ id: string; name: string; type: string; is_default: boolean; balance?: number }> = []
) {
  const categoriesContext = formatCategoriesPrompt(existingCategories)
  const accountsContext = formatAccountsPrompt(existingAccounts)

  const prompt = `
Foydalanuvchi to'lov cheki, kvitansiya, bank o'tkazmasi skrinshoti yoki PDF kvitansiyasini yubordi.
Foydalanuvchi izohi (agar bo'lsa): "${userCaption}"

Ushbu rasm yoki PDF hujjatni diqqat bilan o'rgan (OCR va tahlil qil):
- Kvitansiyada qanday xizmat, tovar yoki kimga pul o'tkazilgan (Kompaniya, do'kon, odam ismi)?
- Summa qancha (UZS, USD va h.k.)?
- Agar bu karta orqali to'lov yoki o'tkazma bo'lsa, qaysi hisobdan ketgan (masalan, Uzcard, Humo, Visa yoki bank)?
- Agar bu kommunal, oziq-ovqat, restoran, transport, kiyim yoki boshqa xarajat bo'lsa mos kategoriyani tanla.
- Agar bu hisoblararo o'tkazma (masalan o'zining boshqa kartasiga o'tkazish) bo'lsa -> action: "TRANSFER"
- Agar odatiy do'kon/xizmat to'lovi yoki pul o'tkazmasi bo'lsa -> action: "TRANSACTION", type: "EXPENSE"

${categoriesContext}
${accountsContext}

QOIDALAR:
1. Chiqim bo'lsa (to'lov cheki, pul yuborish, xarid): type: "EXPENSE".
2. Kirim bo'lsa (kartaga pul tushgani haqidagi kvitansiya): type: "INCOME".
3. Summani aniq raqam sifatida ol (masalan 45000).
4. description maydonida qisqa va tushunarli qilib yoz (masalan: "Korzinkada xarid", "Anvarbekka o'tkazma", "Beeline to'lovi").

Javobni FAQAT to'g'ri JSON formatida qaytar:
{
  "action": "TRANSACTION" | "TRANSFER" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "currency": "UZS" | "USD" | "EUR" | "RUB",
  "category": string | null,
  "is_new_category": boolean | null,
  "account_name": string | null,
  "from_account_name": string | null,
  "to_account_name": string | null,
  "description": string | null
}
`

  const parts = [
    prompt,
    {
      inlineData: {
        data: mediaBase64,
        mimeType: mimeType
      }
    }
  ]

  return generateWithSafety(parts, true)
}

/**
 * Foydalanuvchining savoliga bazadagi ma'lumotlar asosida aqlli javob qaytarish
 */
export async function answerFinancialQuery(
  userQuestion: string,
  transactionsContext: any[],
  debtsContext: any[] = [],
  accountsContext: any[] = []
) {
  const prompt = `
Sen shaxsiy moliyaviy maslahatchi va tahlilchisan.
Foydalanuvchi savoli: "${userQuestion}"

Quyida foydalanuvchining hisoblari va kartalari (accounts):
${JSON.stringify(accountsContext, null, 2)}

Quyida foydalanuvchining ma'lumotlar bazasidagi oxirgi tranzaksiyalari (kirim va chiqimlari):
${JSON.stringify(transactionsContext, null, 2)}

Quyida foydalanuvchining ma'lumotlar bazasidagi qarz, mikroqarz, kredit va kredit kartalari (debts):
${JSON.stringify(debtsContext, null, 2)}

Vazifang:
1. Bazadagi ma'lumotlarni chuqur tahlil qil.
2. Agar savol kreditlar, to'lov sanalari ("Bu oy qancha kredit to'lashim kerak?", "Kredit qoldig'im qancha?", "Kimdan qancha qarzim bor?") haqida bo'lsa, qarzlar va kredit kartalarning oylik to'lovlari hamda qoldiqlarini aniq hisoblab tushuntir.
3. Agar savol hisoblar/kartalar balansi haqida bo'lsa ("Balansim qancha?", "Kartamda qancha bor?"), accounts ro'yxatidan aniq aytib ber.
4. Foydalanuvchiga Telegram formatida (HTML teglari bilan: <b>bold</b>, <i>italic</i>) do'stona, aniq va lo'nda javob qaytar.
5. Javob o'zbek tilida, professional va dalda beruvchi ohangda bo'lsin.
`

  return generateWithSafety(prompt, false)
}
