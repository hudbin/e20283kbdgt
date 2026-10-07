import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

// Faqat belgilangan aniq modeldan foydalanamiz
export const TARGET_MODEL = 'gemini-3.8-flash'

/**
 * Matnli xabarni bevosita gemini-3.8-flash orqali tahlil qilish
 */
export async function analyzeTextMessage(text: string) {
  const model = genAI.getGenerativeModel({
    model: TARGET_MODEL,
    generationConfig: {
      responseMimeType: "application/json"
    }
  })

  const prompt = `
Sen shaxsiy budjet yordamchisisan. Foydalanuvchi quyidagi xabarni yubordi: "${text}"
Ushbu xabardan xarajat yoki daromadni, summani, va toifani (kategoriyani) aniqla.
Sening javobing faqat quyidagi JSON formatida bo'lsin:
{
  "type": "EXPENSE" yoki "INCOME",
  "amount": summa (faqat son, masalan 50000),
  "category": "Kategoriya nomi (masalan: Oziq-ovqat, Transport, Maosh, Xaridlar, Sog'liq, Kommunal)",
  "description": "Foydalanuvchi xabari mazmuni bo'yicha qisqa izoh"
}
Agar xabar moliyaviy amaliyot (kirim yoki chiqim) bo'lmasa yoki tushunarsiz bo'lsa:
{
  "type": null,
  "amount": null,
  "category": null,
  "description": null
}
`

  const result = await model.generateContent(prompt)
  return result.response.text()
}

/**
 * Ovozli xabar audiosini (base64) bevosita gemini-3.8-flash orqali tahlil qilish
 */
export async function analyzeAudioMessage(audioBase64: string, mimeType: string = 'audio/ogg') {
  const model = genAI.getGenerativeModel({
    model: TARGET_MODEL,
    generationConfig: {
      responseMimeType: "application/json"
    }
  })

  const prompt = `
Foydalanuvchi o'z xarajat yoki daromadi haqida ovozli xabar yubordi.
Audioni diqqat bilan tingla va quyidagi JSON formatida natija ber:
{
  "type": "EXPENSE" yoki "INCOME",
  "amount": summa (faqat son, masalan 30000),
  "category": "Kategoriya nomi (masalan: Oziq-ovqat, Transport, Maosh, Xaridlar, Sog'liq, Kommunal)",
  "description": "Ovozda nima aytilgani bo'yicha qisqa izoh"
}
Agar ovozda moliyaviy amaliyot haqida aytilmagan bo'lsa:
{
  "type": null,
  "amount": null,
  "category": null,
  "description": null
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
