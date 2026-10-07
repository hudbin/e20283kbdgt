import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// API'dan jonli olingan faol modellar keshi (faqat ayni paytda Google tomonidan qo'llab-quvvatlanayotganlar)
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
        // Faqat generateContent ishlaydigan va eskirib o'chirilmagan modellar
        const valid = data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''))

        // Eng yangi va flash modellarni boshiga saralaymiz
        valid.sort((a: string, b: string) => {
          const aFlash = a.includes('flash') ? -1 : 1
          const bFlash = b.includes('flash') ? -1 : 1
          return aFlash - bFlash
        })

        if (valid.length > 0) {
          liveActiveModels = valid
          lastFetchedTime = now
          console.log('[AI] Ayni vaqtda faol va qo\'llab-quvvatlanayotgan modellar:', liveActiveModels)
          return liveActiveModels
        }
      }
    }
  } catch (err: any) {
    console.warn('[AI] Jonli modellarni tekshirishda xatolik:', err?.message)
  }

  return ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']
}

/**
 * Universal xavfsiz generatsiya:
 * 1. Google API'dan AYNAN HOZIR FAOL bo'lgan modellar ro'yxatini oladi.
 * 2. Avval gemini-3.8-flash ga urinadi.
 * 3. Agar 503/429 bo'lsa, 1.5s kutib qayta urinadi.
 * 4. Agar eskirgan bo'lsa (404/deprecated) yoki server band bo'lsa, ro'yxatdagi boshqa JONLI modelga o'tadi.
 */
async function generateWithSafety(
  promptOrParts: any,
  jsonMode: boolean = true,
  maxRetries: number = 2
) {
  const activeModels = await getLiveActiveModels()
  let lastError: any = null

  // gemini-3.8-flash ro'yxat boshida bo'lishini ta'minlaymiz (agar mavjud bo'lsa)
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

          console.warn(`[AI] ${modelName} (urinish ${attempt}) xato: ${err?.message}`)

          if (isOverloaded && attempt < maxRetries) {
            console.log(`[AI] 503/429 aniqlandi. 1.5s kutib qayta urinilmoqda...`)
            await sleep(1500)
            continue
          }
          break // Keyingi faol modelga o'tish
        }
      }
    } catch (err: any) {
      lastError = err
      console.warn(`[AI] ${modelName} ishga tushmadi: ${err?.message}`)
    }
  }

  throw lastError || new Error("AI serverlari hozirda band.")
}

/**
 * Matnli xabarni niyatini aniqlash
 */
export async function analyzeTextMessage(text: string) {
  const prompt = `
Sen aqlli shaxsiy moliyaviy yordamchi AIsan. Foydalanuvchi quyidagi xabarni yozdi: "${text}"

Vazifang:
1. Agar bu yangi tranzaksiya (xarajat yoki daromad kiritish, masalan: "2 ta flesh oldim 30 ming", "taksiga 15000 ketdi", "oylik tushdi 3 mln") bo'lsa:
   action: "TRANSACTION"
   type: "EXPENSE" yoki "INCOME"
   amount: son (masalan: 30000)
   category: Kategoriya nomi (masalan: Ichimliklar, Oziq-ovqat, Transport, Maosh, Xaridlar va h.k.)
   description: qisqa izoh

2. Agar bu o'zining budjeti, xarajatlari yoki daromadlari haqida SAVOL yoki TAHLIL (masalan: "Oxirgi oyda ichimliklar uchun qancha sarfladim?", "Kecha qancha xarajat qildim?", "Eng ko'p nimaga pul ketdi?", "Menda qancha pul qoldi?") bo'lsa:
   action: "QUERY"
   type: null
   amount: null
   category: null
   description: null

3. Boshqa hollarda:
   action: "OTHER"
   type: null
   amount: null
   category: null
   description: null

Sening javobing FAQAT quyidagi JSON formatida bo'lsin:
{
  "action": "TRANSACTION" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "category": string | null,
  "description": string | null
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
2. Agar o'z xarajatlari haqida savol so'rayotgan bo'lsa -> action: "QUERY"
3. Boshqa bo'lsa -> action: "OTHER"

{
  "action": "TRANSACTION" | "QUERY" | "OTHER",
  "type": "EXPENSE" | "INCOME" | null,
  "amount": number | null,
  "category": string | null,
  "description": string | null
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
2. Agar savol ma'lum bir toifaga (masalan, ichimliklar, taksi, oziq-ovqat) tegishli bo'lsa, mos yozuvlarni topib summalarini hisobla.
3. Foydalanuvchiga Telegram formatida (HTML teglari bilan: <b>bold</b>, <i>italic</i>) do'stona, aniq va lo'nda javob qaytar.
4. Javob o'zbek tilida, professional va dalda beruvchi ohangda bo'lsin.
`

  return generateWithSafety(prompt, false)
}
