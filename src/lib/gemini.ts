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

  return ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']
}

async function generateWithSafety(
  promptOrParts: any,
  jsonMode: boolean = true,
  maxRetries: number = 2
) {
  const activeModels = await getLiveActiveModels()
  let lastError: any = null

  const sortedModels = [
    ...activeModels.filter((m) => m.includes('3.8')),
    ...activeModels.filter((m) => !m.includes('3.8'))
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

/**
 * Matnli xabarni niyatini aniqlash:
 * - TRANSACTION (kiritish)
 * - REPORT (fayl sifatida hisobot so'rash)
 * - QUERY (savol/tahlil so'rash)
 * - OTHER
 */
export async function analyzeTextMessage(text: string) {
  const prompt = `
Sen aqlli shaxsiy moliyaviy yordamchi AIsan. Foydalanuvchi quyidagi xabarni yozdi: "${text}"

Vazifang xabarni 4 turdan biriga ajratish:
1. REPORT: Foydalanuvchi hisobotni fayl (PDF/Excel) sifatida so'ragan bo'lsa (masalan: "O'tgan oy hisobotini ber pdf va excel fayllarni", "bu oylik hisobotni excelda tashla", "menga hisobot faylini yubor", "pdf hisobot ber").
   Bunda:
   action: "REPORT"
   report_period: "month" | "last_month" | "year" | "all"
   report_formats: ("pdf" | "excel") ro'yxati (masalan: ["pdf", "excel"] yoki faqat ["pdf"])

2. TRANSACTION: Yangi xarajat yoki daromad kiritish bo'lsa (masalan: "2 ta flesh oldim 30 ming", "taksiga 15000 ketdi", "oylik tushdi 3 mln").
   action: "TRANSACTION"
   type: "EXPENSE" yoki "INCOME"
   amount: son
   category: Kategoriya nomi
   description: qisqa izoh

3. QUERY: O'z budjeti haqida oddiy savol/tahlil so'ragan bo'lsa (masalan: "Oxirgi oyda ichimliklar uchun qancha sarfladim?", "Kecha qancha xarajat qildim?").
   action: "QUERY"

4. OTHER: Boshqa har qanday suhbat.
   action: "OTHER"

Sening javobing FAQAT quyidagi JSON formatida bo'lsin:
{
  "action": "TRANSACTION" | "REPORT" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "category": string | null,
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
export async function analyzeAudioMessage(audioBase64: string, mimeType: string = 'audio/ogg') {
  const prompt = `
Foydalanuvchi ovozli xabar yubordi.
Audioni diqqat bilan tingla va quyidagi JSON formatida natija ber:
1. Agar yangi kirim yoki chiqim bo'lsa -> action: "TRANSACTION"
2. Agar hisobot faylini (PDF yoki Excel) so'rayotgan bo'lsa -> action: "REPORT", report_period: "month"|"last_month"|"year"|"all", report_formats: ["pdf", "excel"]
3. Agar o'z xarajatlari haqida savol so'rayotgan bo'lsa -> action: "QUERY"
4. Boshqa bo'lsa -> action: "OTHER"

{
  "action": "TRANSACTION" | "REPORT" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "category": string | null,
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
export async function answerFinancialQuery(userQuestion: string, transactionsContext: any[]) {
  const prompt = `
Sen shaxsiy moliyaviy maslahatchi va tahlilchisan.
Foydalanuvchi savoli: "${userQuestion}"

Quyida foydalanuvchining ma'lumotlar bazasidagi oxirgi tranzaksiyalari (kirim va chiqimlari):
${JSON.stringify(transactionsContext, null, 2)}

Vazifang:
1. Bazadagi ma'lumotlarni chuqur tahlil qil.
2. Agar savol ma'lum bir toifaga tegishli bo'lsa, mos yozuvlarni topib summalarini hisobla.
3. Foydalanuvchiga Telegram formatida (HTML teglari bilan: <b>bold</b>, <i>italic</i>) do'stona, aniq va lo'nda javob qaytar.
4. Javob o'zbek tilida, professional va dalda beruvchi ohangda bo'lsin.
`

  return generateWithSafety(prompt, false)
}
