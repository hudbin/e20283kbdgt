import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

// Mavjud Gemini modellari ro'yxati (eng yaxshi/tezkorlaridan boshlab zaxiraga qarab)
export const AVAILABLE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro'
]

// Server band (429, 503) yoki vaqtincha xatolik bo'lsa kutish funksiyasi
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Modellarni ketma-ket sinab ko'radi.
 * Agar xatolik bo'lsa yoki server band bo'lsa 1.5 soniya kutib,
 * keyingi modelga o'tadi.
 */
export async function generateContentWithFallback(prompt: string, maxRetriesPerModel: number = 2) {
  let lastError: any = null

  for (const modelName of AVAILABLE_MODELS) {
    try {
      console.log(`[AI] Attempting model: ${modelName}`)
      const model = genAI.getGenerativeModel({ model: modelName })

      for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
        try {
          const result = await model.generateContent(prompt)
          const text = result.response.text()
          if (text) {
            console.log(`[AI] Success with model: ${modelName}`)
            return text
          }
        } catch (err: any) {
          lastError = err
          const status = err?.status || err?.statusCode
          const isBusy = status === 429 || status === 503 || err?.message?.includes('Resource has been exhausted') || err?.message?.includes('Overloaded')

          console.warn(`[AI] Error on ${modelName} (attempt ${attempt}): ${err.message}`)

          if (isBusy && attempt < maxRetriesPerModel) {
            console.log(`[AI] Server busy (status ${status}). Waiting 2s before retry...`)
            await sleep(2000)
            continue
          }
          break // Keyingi modelga o'tish
        }
      }
    } catch (err: any) {
      lastError = err
      console.warn(`[AI] Model ${modelName} failed initialization: ${err.message}`)
    }

    // Keyingi modelga o'tishdan oldin 1 soniya kutish
    await sleep(1000)
  }

  throw lastError || new Error("Barcha AI modellari band yoki xatolik yuz berdi.")
}
