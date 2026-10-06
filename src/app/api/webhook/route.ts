import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { geminiFlashModel } from '@/lib/gemini'

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  const res = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    })
  })
  return res.json()
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('Received webhook:', JSON.stringify(body, null, 2))

    if (body.message) {
      const { chat, text, from, voice } = body.message

      // Foydalanuvchini bazaga qo'shish yoki yangilash
      await supabase.from('users').upsert({
        telegram_id: from.id,
        username: from.username,
        first_name: from.first_name,
        language_code: from.language_code
      }, { onConflict: 'telegram_id' })

      if (text === '/start') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://e20283kbdgt.vercel.app'
        await sendMessage(
          chat.id, 
          `Salom, ${from.first_name}! 👋\nMen sizning shaxsiy budjet yordamchiningizman.\nXarajat va daromadlaringizni yozib yuboring yoki ovozli xabar qoldiring. Mini App orqali ham ishlashingiz mumkin.`,
          {
            inline_keyboard: [
              [{ text: "Mini App'ni ochish 🚀", web_app: { url: appUrl } }]
            ]
          }
        )
        return NextResponse.json({ ok: true })
      }

      if (text) {
        // Matnni AI bilan tahlil qilish
        const prompt = `
Sen shaxsiy budjet yordamchisisan. Foydalanuvchi quyidagi xabarni yubordi: "${text}"
Ushbu xabardan xarajat yoki daromadni, summani, va toifani (kategoriyani) aniqla.
Sening javobing faqat quyidagi JSON formatida bo'lsin:
{
  "type": "EXPENSE" yoki "INCOME",
  "amount": summa (faqat son, masalan 50000),
  "category": "Kategoriya nomi",
  "description": "Foydalanuvchi xabari mazmuni bo'yicha izoh"
}
Agar xabar moliyaviy amaliyot bo'lmasa, shunchaki null qaytar. Hech qanday qo'shimcha matn yozma. JSON dan boshqa narsa qaytarilmasligi kerak.
`
        try {
          const result = await geminiFlashModel.generateContent(prompt)
          const responseText = result.response.text()
          
          let parsedData = null
          // JSON ni extract qilish (agar markdown backticks ichida bo'lsa)
          const jsonMatch = responseText.match(/```json\n([\s\S]*)\n```/) || responseText.match(/```\n([\s\S]*)\n```/)
          
          if (jsonMatch) {
             parsedData = JSON.parse(jsonMatch[1])
          } else {
             parsedData = JSON.parse(responseText)
          }

          if (parsedData && parsedData.type) {
             const confirmMessage = `<b>Tahlil qilindi:</b>\n\n📌 <b>Tur:</b> ${parsedData.type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'}\n💰 <b>Summa:</b> ${parsedData.amount} so'm\n📂 <b>Kategoriya:</b> ${parsedData.category}\n📝 <b>Izoh:</b> ${parsedData.description}\n\nMa'lumotlarni tasdiqlaysizmi?`
             
             // Ma'lumotlarni callback_data orqali yuborish uzunligi chegaralangan bo'lishi mumkin (64 bayt).
             // Shuning uchun, vaqtinchalik Redis yoki shunchaki ixchamlashtirilgan shaklda yuboramiz.
             const callbackData = JSON.stringify({
               a: 'confirm',
               t: parsedData.type === 'EXPENSE' ? 'E' : 'I',
               am: parsedData.amount,
               c: parsedData.category
               // description sig'masligi mumkin
             })
             
             await sendMessage(chat.id, confirmMessage, {
               inline_keyboard: [
                 [
                   { text: "✅ Tasdiqlash", callback_data: `c_${parsedData.type[0]}_${parsedData.amount}_${parsedData.category.substring(0, 10)}` },
                   { text: "❌ Bekor qilish", callback_data: "cancel" }
                 ]
               ]
             })
          } else {
             await sendMessage(chat.id, "Kechirasiz, xabaringizdan moliyaviy ma'lumotni ajratib ololmadim.")
          }

        } catch (e) {
          console.error("AI Error:", e)
          await sendMessage(chat.id, "Tahlil qilishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.")
        }
      }

      // Ovozli xabarni ishlash: (Kengaytirish kerak: faylni Telegramdan olib, Geminiga jo'natish)
      if (voice) {
         await sendMessage(chat.id, "Ovozli xabar qabul qilindi. AI tahlili ustida ishlamoqdaman...")
         // Ovozli faylni yuklab olish va Geminiga yuborish logikasi qo'shiladi
      }
    } else if (body.callback_query) {
      const callbackQuery = body.callback_query
      const data = callbackQuery.data
      const chatId = callbackQuery.message.chat.id
      const messageId = callbackQuery.message.message_id
      const fromId = callbackQuery.from.id

      if (data === 'cancel') {
        // Tahrirlash orqali xabarni o'zgartiramiz
        await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: "❌ Amaliyot bekor qilindi."
          })
        })
      } else if (data.startsWith('c_')) {
        // c_E_50000_Kategoriya
        const parts = data.split('_')
        const type = parts[1] === 'E' ? 'EXPENSE' : 'INCOME'
        const amount = parseFloat(parts[2])
        const categoryName = parts[3]

        // Kategoriyani topish yoki yaratish
        let categoryId = null
        const { data: catData } = await supabase
           .from('categories')
           .select('id')
           .eq('telegram_id', fromId)
           .eq('name', categoryName)
           .single()
           
        if (catData) {
          categoryId = catData.id
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ telegram_id: fromId, name: categoryName, type })
            .select('id').single()
          if (newCat) categoryId = newCat.id
        }

        await supabase.from('transactions').insert({
          telegram_id: fromId,
          category_id: categoryId,
          amount,
          type,
          description: "Bot orqali kiritildi"
        })

        await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: "✅ Muvaffaqiyatli saqlandi!"
          })
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
