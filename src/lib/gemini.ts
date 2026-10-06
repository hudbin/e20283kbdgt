import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Jonli ravishda Google API'dan sizning kalitingiz uchun mavjud modellarni olish
let cachedModels: string[] = []
let lastFetchedTime = 0

async function getLiveModels(): Promise<string[]> {
  const now = Date.now()
  // 1 soat davomida keshda saqlaymiz
  if (cachedModels.length > 0 && now - lastFetchedTime < 60 * 60 * 1000) {
    return cachedModels
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (res.ok) {
      const data = await res.json()
      if (data.models && Array.isArray(data.models)) {
        // Faqat generateContent metodini qo'llab-quvvatlovchi modellarni filtrlaymiz
        const validModels = data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''))

        // Flash va tezkor modellarni birinchi o'ringa qo'yamiz
        validModels.sort((a: string, b: string) => {
          const aFlash = a.includes('flash') ? -1 : 1
          const bFlash = b.includes('flash') ? -1 : 1
          return aFlash - bFlash
        })

        if (validModels.length > 0) {
          cachedModels = validModels
          lastFetchedTime = now
          console.log('[AI] Jonli mavjud modellar ro\'yxati olindi:', cachedModels)
          return cachedModels
        }
      }
    }
  } catch (err: any) {
    console.warn('[AI] Jonli modellarni olishda xatolik:', err?.message)
  }

  // Agar tarmoq yoki API xato bersa, zaxira ro'yxat:
  return [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro'
  ]
}

/**
 * Jonli aniqlangan barcha modellarni ketma-ket sinab ko'radi.
 * Agar server band (429, 503) bo'lsa, kutib qayta urinadi.
 */
export async function generateContentWithFallback(prompt: string, maxRetriesPerModel: number = 2) {
  const modelsToTry = await getLiveModels()
  let lastError: any = null

  for (const modelName of modelsToTry) {
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
          const isBusy =
            status === 429 ||
            status === 503 ||
            err?.message?.includes('Resource has been exhausted') ||
            err?.message?.includes('Overloaded')

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

    // Keyingi modelga o'tish oldidan 1 soniya tanaffus
    await sleep(1000)
  }

  throw lastError || new Error("Barcha AI modellari band yoki xatolik yuz berdi.")
}
