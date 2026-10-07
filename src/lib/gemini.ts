import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

export const TARGET_MODEL = 'gemini-3.8-flash'

/**
 * Matnli xabarni niyatini aniqlash:
 * 1. Yangi kirim/chiqim kiritish (TRANSACTION)
 * 2. Bazadan savol so'rash / tahlil talab qilish (QUERY)
 * 3. Boshqa suhbat yoki tushunarsiz (OTHER)
 */
export async function analyzeTextMessage(text: string) {
  const model = genAI.getGenerativeModel({
    model: TARGET_MODEL,
    generationConfig: {
      responseMimeType: "application/json"
    }
  })

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

  const result = await model.generateContent(prompt)
  return result.response.text()
}

/**
 * Ovozli xabarni tahlil qilish (TRANSACTION yoki QUERY)
 */
export async function analyzeAudioMessage(audioBase64: string, mimeType: string = 'audio/ogg') {
  const model = genAI.getGenerativeModel({
    model: TARGET_MODEL,
    generationConfig: {
      responseMimeType: "application/json"
    }
  })

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

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: audioBase64,
        mimeType: mimeType
      }
    }
  ])

  return result.response.text()
}

/**
 * Foydalanuvchining savoliga bazadagi ma'lumotlar asosida aqlli javob qaytarish
 */
export async function answerFinancialQuery(userQuestion: string, transactionsContext: any[]) {
  const model = genAI.getGenerativeModel({
    model: TARGET_MODEL
  })

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

  const result = await model.generateContent(prompt)
  return result.response.text()
}
