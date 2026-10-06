import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
export const genAI = new GoogleGenerativeAI(apiKey)

// Eng so'nggi Flash modelidan foydalanamiz
export const geminiFlashModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// Agar ovozli fayllar bilan ishlash kerak bo'lsa
// Google Gemini API File API ham bor, yoki base64 orqali yuborish mumkin
