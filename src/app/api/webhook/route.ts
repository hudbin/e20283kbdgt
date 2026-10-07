import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { analyzeTextMessage, analyzeAudioMessage, answerFinancialQuery } from '@/lib/gemini'
import { generatePdfBuffer, generateExcelBuffer } from '@/lib/reports/generator'

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

async function sendDocumentBuffer(chatId: number, buffer: Buffer, filename: string, caption?: string) {
  const blob = new Blob([new Uint8Array(buffer)])
  const formData = new FormData()
  formData.append('chat_id', String(chatId))
  formData.append('document', blob, filename)
  if (caption) {
    formData.append('caption', caption)
  }

  const res = await fetch(`${TELEGRAM_API_URL}/sendDocument`, {
    method: 'POST',
    body: formData
  })
  return res.json()
}

async function sendTypingAction(chatId: number, action: 'typing' | 'upload_document' = 'typing') {
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
          `Salom, ${from.first_name}! 👋\nMen sizning shaxsiy budjet yordamchiningizman.\n\n` +
          `🔹 <b>Xarajat/Kirim kiritish:</b> <i>"2 ta flesh 30 ming"</i> yoki ovozli xabar qoldiring.\n` +
          `🔹 <b>Hisobot fayllarini so'rash:</b> <i>"O'tgan oy hisobotini ber pdf va excel fayllarda"</i> deb yozing yoki ayting.\n` +
          `🔹 <b>Tahliliy savollar:</b> <i>"Ichimliklar uchun qancha sarfladim?"</i>, <i>"Menda qancha balans qoldi?"</i> deb so'rang.\n` +
          `🔹 <b>Mini App:</b> To'liq grafiklar uchun pastdagi tugmani bosing.`,
          {
            inline_keyboard: [
              [{ text: "Mini App'ni ochish 🚀", web_app: { url: appUrl } }]
            ]
          }
        )
        return NextResponse.json({ ok: true })
      }

      let parsedData: any = null
      let originalPromptText = text || ""

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
          const fileRes = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${voice.file_id}`)
          const fileData = await fileRes.json()

          if (fileData.ok && fileData.result?.file_path) {
            const fileDownloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
            const audioStreamRes = await fetch(fileDownloadUrl)
            const audioBuffer = await audioStreamRes.arrayBuffer()
            const audioBase64 = Buffer.from(audioBuffer).toString('base64')

            const responseText = await analyzeAudioMessage(audioBase64, voice.mime_type || 'audio/ogg')
            parsedData = JSON.parse(responseText)
            originalPromptText = parsedData?.description || "Ovozli xabar"
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

      // 1. Agar foydalanuvchi HISOBOT FAYLINI so'ragan bo'lsa (REPORT):
      if (parsedData?.action === 'REPORT') {
        await sendTypingAction(chat.id, 'upload_document')
        await sendMessage(chat.id, "⏳ Hisobotingiz tayyorlanmoqda, hozir fayllarni yuboraman...")

        // Supabase bazasidan ma'lumotlarni olamiz
        const { data: allTransactions } = await supabase
          .from('transactions')
          .select('amount, type, description, date, categories(name)')
          .eq('telegram_id', from.id)
          .order('date', { ascending: false })

        const now = new Date()
        const period = parsedData.report_period || 'month'

        const filtered = (allTransactions || []).filter((t: any) => {
          const d = new Date(t.date)
          if (period === 'all') return true
          if (period === 'year') return d.getFullYear() === now.getFullYear()
          if (period === 'last_month') {
            const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
            const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
            return d.getMonth() === prevMonth && d.getFullYear() === prevYear
          }
          // Default: joriy oy
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        })

        if (filtered.length === 0) {
          await sendMessage(chat.id, "Ushbu davr uchun hali hech qanday amaliyotlar mavjud emas.")
          return NextResponse.json({ ok: true })
        }

        const periodTitle =
          period === 'last_month'
            ? "O'tgan oy"
            : period === 'year'
            ? "Joriy yil"
            : period === 'all'
            ? "Barcha davr"
            : "Joriy oy"

        const formats = parsedData.report_formats || ['pdf', 'excel']
        const hasPdf = formats.includes('pdf')
        const hasExcel = formats.includes('excel')

        if (hasPdf) {
          const pdfBuffer = generatePdfBuffer(filtered, periodTitle)
          await sendDocumentBuffer(
            chat.id,
            pdfBuffer,
            `hisobot_${period}_${Date.now()}.pdf`,
            `📄 <b>${periodTitle} boʻyicha PDF hisobot</b>`
          )
        }

        if (hasExcel) {
          const excelBuffer = generateExcelBuffer(filtered)
          await sendDocumentBuffer(
            chat.id,
            excelBuffer,
            `hisobot_${period}_${Date.now()}.xlsx`,
            `📊 <b>${periodTitle} boʻyicha Excel hisobot</b>`
          )
        }

        return NextResponse.json({ ok: true })
      }

      // 2. Agar foydalanuvchi SAVOL yoki TAHLIL so'ragan bo'lsa (QUERY):
      if (parsedData?.action === 'QUERY') {
        await sendTypingAction(chat.id, 'typing')

        const { data: userTransactions } = await supabase
          .from('transactions')
          .select('amount, type, description, date, categories(name)')
          .eq('telegram_id', from.id)
          .order('date', { ascending: false })
          .limit(100)

        const simplifiedData = (userTransactions || []).map((t: any) => ({
          amount: t.amount,
          type: t.type,
          category: t.categories?.name || 'Nomaʼlum',
          description: t.description,
          date: t.date
        }))

        const aiAnswer = await answerFinancialQuery(originalPromptText, simplifiedData)
        await sendMessage(chat.id, aiAnswer)
        return NextResponse.json({ ok: true })
      }

      // 3. Agar yangi TRANZAKSIYA bo'lsa:
      if (parsedData?.type && parsedData?.amount) {
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
        await sendMessage(chat.id, "Kechirasiz, xabaringizni to'liq tushunmadim. Xarajat kiritish uchun: <i>\"30 mingga go'sht oldim\"</i>, hisobot uchun: <i>\"O'tgan oy hisobotini ber pdf va excelda\"</i> deb yozing.")
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
