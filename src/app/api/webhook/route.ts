import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { analyzeTextMessage, analyzeAudioMessage } from '@/lib/gemini'

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

async function sendTypingAction(chatId: number, action: 'typing' | 'record_voice' = 'typing') {
  try {
    await fetch(`${TELEGRAM_API_URL}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action })
    })
  } catch (_) {}
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (body.message) {
      const { chat, text, from, voice } = body.message

      // Foydalanuvchini bazaga kiritish / yangilash
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

      let parsedData: any = null

      if (text) {
        await sendTypingAction(chat.id, 'typing')
        try {
          const responseText = await analyzeTextMessage(text)
          parsedData = JSON.parse(responseText)
        } catch (e: any) {
          console.error("AI Text Error:", e)
          await sendMessage(chat.id, "Tahlil qilishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.")
          return NextResponse.json({ ok: true })
        }
      } else if (voice) {
        await sendTypingAction(chat.id, 'typing')
        try {
          // Telegramdan ovozli fayl ma'lumotini olish
          const fileRes = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${voice.file_id}`)
          const fileData = await fileRes.json()

          if (fileData.ok && fileData.result?.file_path) {
            const fileDownloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
            const audioStreamRes = await fetch(fileDownloadUrl)
            const audioBuffer = await audioStreamRes.arrayBuffer()
            const audioBase64 = Buffer.from(audioBuffer).toString('base64')

            const responseText = await analyzeAudioMessage(audioBase64, voice.mime_type || 'audio/ogg')
            parsedData = JSON.parse(responseText)
          } else {
            await sendMessage(chat.id, "Ovozli faylni yuklab olishda muammo yuz berdi.")
            return NextResponse.json({ ok: true })
          }
        } catch (e: any) {
          console.error("AI Voice Error:", e)
          await sendMessage(chat.id, "Ovozli xabarni tahlil qilishda xatolik yuz berdi.")
          return NextResponse.json({ ok: true })
        }
      }

      if (parsedData && parsedData.type && parsedData.amount) {
        const typeLabel = parsedData.type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'
        const categoryLabel = parsedData.category || (parsedData.type === 'EXPENSE' ? 'Xarajat' : 'Daromad')
        const amountNum = Number(parsedData.amount)
        const descText = parsedData.description ? `\n📝 <b>Izoh:</b> ${parsedData.description}` : ''

        const confirmMessage = `<b>Tahlil qilindi:</b>\n\n📌 <b>Tur:</b> ${typeLabel}\n💰 <b>Summa:</b> ${amountNum.toLocaleString()} so'm\n📂 <b>Kategoriya:</b> ${categoryLabel}${descText}\n\nMa'lumotlarni tasdiqlaysizmi?`

        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `c_${parsedData.type[0]}_${amountNum}_${encodeURIComponent(categoryLabel.slice(0, 20))}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
      } else if (text || voice) {
        await sendMessage(chat.id, "Kechirasiz, xabaringizdan moliyaviy ma'lumot (summa va tur) ajratib ololmadim.")
      }

    } else if (body.callback_query) {
      const callbackQuery = body.callback_query
      const data = callbackQuery.data
      const chatId = callbackQuery.message.chat.id
      const messageId = callbackQuery.message.message_id
      const fromId = callbackQuery.from.id

      if (data === 'cancel') {
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
        const parts = data.split('_')
        const type = parts[1] === 'E' ? 'EXPENSE' : 'INCOME'
        const amount = parseFloat(parts[2])
        const categoryName = decodeURIComponent(parts[3] || (type === 'EXPENSE' ? 'Xarajat' : 'Daromad'))

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
          description: "Telegram orqali kiritildi"
        })

        await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n${type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'}: ${amount.toLocaleString()} so'm (${categoryName})`,
            parse_mode: 'HTML'
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
