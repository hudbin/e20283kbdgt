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
  existingCategories: Array<CategoryContextItem | string> = []
) {
  const categoriesContext = formatCategoriesPrompt(existingCategories)

  const prompt = `
Sen aqlli shaxsiy moliyaviy yordamchi AIsan. Foydalanuvchi quyidagi xabarni yozdi: "${text}"

${categoriesContext}

Vazifang xabarni 5 turdan biriga ajratish:
1. REPORT: Foydalanuvchi hisobotni fayl (PDF/Excel) sifatida so'ragan bo'lsa (masalan: "O'tgan oy hisobotini ber pdf va excel fayllarni", "bu oylik hisobotni excelda tashla", "menga hisobot faylini yubor", "pdf hisobot ber").
   Bunda:
   action: "REPORT"
   report_period: "month" | "last_month" | "year" | "all"
   report_formats: ("pdf" | "excel") ro'yxati (masalan: ["pdf", "excel"] yoki faqat ["pdf"])

2. DEBT: Qarz berish, qarz olish, kredit olish, qarzni qaytarish yoki kredit to'lash bilan bog'liq amallar.
   Misollar:
   - "Aliga 200 ming qarz berdim" -> action: "DEBT", debt_action: "LEND", person_name: "Ali", amount: 200000
   - "Vali akadan 500 ming qarz oldim" -> action: "DEBT", debt_action: "BORROW", person_name: "Vali aka", amount: 500000
   - "Bankdan 10 mln kredit oldim" -> action: "DEBT", debt_action: "LOAN", person_name: "Bank", amount: 10000000
   - "Vali akaga 500 ming qarzni qaytardim" -> action: "DEBT", debt_action: "REPAY", person_name: "Vali aka", amount: 500000
   - "Kreditga 1 mln to'ladim" -> action: "DEBT", debt_action: "REPAY", person_name: "Kredit", amount: 1000000
   - "Ali 200 ming qarzini qaytardi" -> action: "DEBT", debt_action: "RECEIVE", person_name: "Ali", amount: 200000
   Bunda:
   action: "DEBT"
   debt_action: "LEND" | "BORROW" | "LOAN" | "REPAY" | "RECEIVE"
   person_name: Shaxs yoki bank/tashkilot nomi
   amount: son
   due_date: string | null (agar qaytarish sanasi ko'rsatilgan bo'lsa)
   description: qisqa izoh

3. TRANSACTION: Oddiy xarajat yoki daromad kiritish bo'lsa (masalan: "2 ta flesh oldim 30 ming", "taksiga 15000 ketdi", "oylik tushdi 3 mln").
   action: "TRANSACTION"
   type: "EXPENSE" yoki "INCOME"
   amount: son
   category: Kategoriya nomi (mavjud ro'yxatdan eng mosi yoki yangi taklif)
   is_new_category: boolean (mavjud bo'lsa false, yangi taklif bo'lsa true)
   description: qisqa izoh

4. QUERY: O'z budjeti yoki qarzlari haqida savol/tahlil so'ragan bo'lsa (masalan: "Oxirgi oyda ichimliklar uchun qancha sarfladim?", "Kimdan qancha qarzim bor?", "Menga kimlar qarz?").
   action: "QUERY"

5. OTHER: Boshqa har qanday suhbat yoki noaniq gap.
   action: "OTHER"

Sening javobing FAQAT quyidagi JSON formatida bo'lsin:
{
  "action": "TRANSACTION" | "DEBT" | "REPORT" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "category": string | null,
  "is_new_category": boolean | null,
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
  existingCategories: Array<CategoryContextItem | string> = []
) {
  const categoriesContext = formatCategoriesPrompt(existingCategories)

  const prompt = `
Foydalanuvchi ovozli xabar yubordi.
Audioni diqqat bilan tingla va quyidagi JSON formatida natija ber:
1. Agar yangi oddiy kirim yoki chiqim bo'lsa -> action: "TRANSACTION", type: "EXPENSE"|"INCOME", amount, category
2. Agar qarz berish, qarz olish, kredit olish yoki qarzni to'lash bo'lsa -> action: "DEBT", debt_action: "LEND"|"BORROW"|"LOAN"|"REPAY"|"RECEIVE", person_name, amount, due_date
3. Agar hisobot faylini (PDF yoki Excel) so'rayotgan bo'lsa -> action: "REPORT", report_period: "month"|"last_month"|"year"|"all", report_formats: ["pdf", "excel"]
4. Agar o'z xarajatlari yoki qarzlari haqida savol so'rayotgan bo'lsa -> action: "QUERY"
5. Boshqa bo'lsa -> action: "OTHER"

${categoriesContext}

{
  "action": "TRANSACTION" | "DEBT" | "REPORT" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "category": string | null,
  "is_new_category": boolean | null,
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
 * Foydalanuvchining savoliga bazadagi ma'lumotlar asosida aqlli javob qaytarish
 */
export async function answerFinancialQuery(
  userQuestion: string,
  transactionsContext: any[],
  debtsContext: any[] = []
) {
  const prompt = `
Sen shaxsiy moliyaviy maslahatchi va tahlilchisan.
Foydalanuvchi savoli: "${userQuestion}"

Quyida foydalanuvchining ma'lumotlar bazasidagi oxirgi tranzaksiyalari (kirim va chiqimlari):
${JSON.stringify(transactionsContext, null, 2)}

Quyida foydalanuvchining ma'lumotlar bazasidagi qarz va kreditlari (debts):
${JSON.stringify(debtsContext, null, 2)}

Vazifang:
1. Bazadagi ma'lumotlarni chuqur tahlil qil.
2. Agar savol qarzlar ("Kimdan qarzim bor?", "Menga kimlar qarz?", "Kredit qoldig'im qancha?") haqida bo'lsa, qarzlar ro'yxatidan aniq hisoblab ber.
3. Agar savol ma'lum bir xarajat/kirim toifasiga tegishli bo'lsa, mos yozuvlarni topib summalarini hisobla.
4. Foydalanuvchiga Telegram formatida (HTML teglari bilan: <b>bold</b>, <i>italic</i>) do'stona, aniq va lo'nda javob qaytar.
5. Javob o'zbek tilida, professional va dalda beruvchi ohangda bo'lsin.
`

  return generateWithSafety(prompt, false)
}
