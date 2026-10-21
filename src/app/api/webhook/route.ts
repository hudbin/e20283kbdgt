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
          `🔹 <b>Oxirgisini o'chirish:</b> <i>/undo</i> yoki <i>"oxirgisini o'chir"</i> deb yozing.\n` +
          `🔹 <b>Mini App:</b> To'liq grafiklar uchun pastdagi tugmani bosing.`,
          {
            inline_keyboard: [
              [{ text: "Mini App'ni ochish 🚀", web_app: { url: appUrl } }]
            ]
          }
        )
        return NextResponse.json({ ok: true })
      }

      const lowerText = (text || "").toLowerCase().trim()
      if (
        lowerText === '/undo' ||
        lowerText === "oxirgisini o'chir" ||
        lowerText === "oxirgi xarajatni o'chir" ||
        lowerText === "oxirgi tranzaksiyani o'chir" ||
        lowerText === "oxirgisini bekor qil"
      ) {
        const { data: lastTx } = await supabase
          .from('transactions')
          .select('id, amount, type, description, date, categories(name)')
          .eq('telegram_id', from.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!lastTx) {
          await sendMessage(chat.id, "Sizda o'chirish uchun amaliyotlar topilmadi.")
          return NextResponse.json({ ok: true })
        }

        await supabase.from('transactions').delete().eq('id', lastTx.id)
        const categoryData = lastTx.categories as any
        const catName = (Array.isArray(categoryData) ? categoryData[0]?.name : categoryData?.name) || (lastTx.type === 'EXPENSE' ? 'Xarajat' : 'Kirim')

        await sendMessage(
          chat.id,
          `🗑 <b>Oxirgi tranzaksiya o'chirildi:</b>\n\n` +
          `📌 <b>Tur:</b> ${lastTx.type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'}\n` +
          `💰 <b>Summa:</b> ${Number(lastTx.amount).toLocaleString()} so'm\n` +
          `📂 <b>Kategoriya:</b> ${catName}`
        )
        return NextResponse.json({ ok: true })
      }

      let parsedData: any = null
      let originalPromptText = text || ""

      // Bazadan foydalanuvchining mavjud kategoriyalarini olamiz
      let existingCategories: Array<{ name: string; type: string }> = []
      try {
        const { data: catData } = await supabase
          .from('categories')
          .select('name, type')
          .or(`telegram_id.eq.${from.id},is_default.eq.true`)

        if (catData && catData.length > 0) {
          existingCategories = catData
        }
      } catch (catErr) {
        console.error("Kategoriyalarni yuklashda xatolik:", catErr)
      }

      if (text) {
        await sendTypingAction(chat.id, 'typing')
        try {
          const responseText = await analyzeTextMessage(text, existingCategories)
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

            const responseText = await analyzeAudioMessage(audioBase64, voice.mime_type || 'audio/ogg', existingCategories)
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

        const { data: userDebts } = await supabase
          .from('debts')
          .select('*')
          .eq('telegram_id', from.id)
          .order('created_at', { ascending: false })

        const simplifiedData = (userTransactions || []).map((t: any) => ({
          amount: t.amount,
          type: t.type,
          category: t.categories?.name || 'Nomaʼlum',
          description: t.description,
          date: t.date
        }))

        const simplifiedDebts = (userDebts || []).map((d: any) => ({
          person_name: d.person_name,
          type: d.type === 'LENT' ? 'Berilgan qarz' : d.type === 'LOAN' ? 'Bank krediti' : 'Olingan qarz',
          total_amount: d.amount,
          paid_amount: d.paid_amount,
          remaining_amount: Number(d.amount) - Number(d.paid_amount),
          status: d.status === 'PAID' ? 'Yopilgan' : 'Faol',
          due_date: d.due_date
        }))

        const aiAnswer = await answerFinancialQuery(originalPromptText, simplifiedData, simplifiedDebts)
        await sendMessage(chat.id, aiAnswer)
        return NextResponse.json({ ok: true })
      }

      // 3. Agar QARZ yoki KREDIT amaliyoti bo'lsa (DEBT):
      if (parsedData?.action === 'DEBT' && parsedData?.amount) {
        const debtAction = parsedData.debt_action || 'LEND'
        const personName = (parsedData.person_name || 'Nomaʼlum').trim()
        const amountNum = Number(parsedData.amount)
        const dueText = parsedData.due_date ? `\n📅 <b>Muddat:</b> ${parsedData.due_date}` : ''
        const descText = parsedData.description ? `\n📝 <b>Izoh:</b> ${parsedData.description}` : ''

        let actionTitle = ''
        let actionDesc = ''
        if (debtAction === 'LEND') {
          actionTitle = '🤝 Qarz berish'
          actionDesc = `👤 <b>Kimga:</b> ${personName}\n💡 <i>(Hamyondan chiqim boʻladi va qarzlar daftaringizga yoziladi)</i>`
        } else if (debtAction === 'BORROW') {
          actionTitle = '📥 Qarz olish'
          actionDesc = `👤 <b>Kimdan:</b> ${personName}\n💡 <i>(Hamyonga kirim boʻladi va qarz majburiyati ochiladi)</i>`
        } else if (debtAction === 'LOAN') {
          actionTitle = '🏦 Kredit olish'
          actionDesc = `🏛 <b>Bank/Tashkilot:</b> ${personName}\n💡 <i>(Hamyonga kirim boʻladi va kredit ochiladi)</i>`
        } else if (debtAction === 'REPAY') {
          actionTitle = '💸 Qarz/Kredit toʻlash'
          actionDesc = `👤 <b>Kimga:</b> ${personName}\n💡 <i>(Hamyondan chiqim boʻladi va qarz qoldigʻi kamayadi)</i>`
        } else if (debtAction === 'RECEIVE') {
          actionTitle = '💰 Qarz qaytib kelishi'
          actionDesc = `👤 <b>Kimdan:</b> ${personName}\n💡 <i>(Hamyonga kirim boʻladi va qarz yopiladi)</i>`
        }

        const confirmMessage = `<b>Qarz amaliyoti tahlil qilindi:</b>\n\n📌 <b>Amal:</b> ${actionTitle}\n💰 <b>Summa:</b> ${amountNum.toLocaleString()} so'm\n${actionDesc}${dueText}${descText}\n\nMa'lumotlarni tasdiqlaysizmi?`

        const safePerson = encodeURIComponent(personName.slice(0, 25))
        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `d_${debtAction}_${amountNum}_${safePerson}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
        return NextResponse.json({ ok: true })
      }

      // 4. Agar yangi TRANZAKSIYA bo'lsa:
      if (parsedData?.type && parsedData?.amount) {
        const typeLabel = parsedData.type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'
        const categoryLabel = parsedData.category || (parsedData.type === 'EXPENSE' ? 'Xarajat' : 'Daromad')
        const amountNum = Number(parsedData.amount)
        const descText = parsedData.description ? `\n📝 <b>Izoh:</b> ${parsedData.description}` : ''
        const categoryBadge = parsedData.is_new_category ? ' <i>(Yangi taklif 🆕)</i>' : ''

        const confirmMessage = `<b>Tahlil qilindi:</b>\n\n📌 <b>Tur:</b> ${typeLabel}\n💰 <b>Summa:</b> ${amountNum.toLocaleString()} so'm\n📂 <b>Kategoriya:</b> ${categoryLabel}${categoryBadge}${descText}\n\nMa'lumotlarni tasdiqlaysizmi?`

        const safeCat = encodeURIComponent(categoryLabel.slice(0, 25))
        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `c_${parsedData.type[0]}_${amountNum}_${safeCat}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
      } else if (text || voice) {
        await sendMessage(chat.id, "Kechirasiz, xabaringizni to'liq tushunmadim. Xarajat kiritish uchun: <i>\"30 mingga go'sht oldim\"</i>, qarz uchun: <i>\"Aliga 200 ming qarz berdim\"</i> deb yozing.")
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
        // 1. Dastlab bazadan mavjud kategoriya qidiriladi (shaxsiy yoki default)
        const { data: catData } = await supabase
           .from('categories')
           .select('id')
           .or(`telegram_id.eq.${fromId},is_default.eq.true`)
           .ilike('name', categoryName)
           .order('is_default', { ascending: true })
           .limit(1)
           .maybeSingle()
           
        if (catData) {
          categoryId = catData.id
        } else {
          // 2. Agar mavjud bo'lmasa, AI taklif qilgan yangi kategoriya bazaga kiritiladi
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ telegram_id: fromId, name: categoryName, type, is_default: false })
            .select('id')
            .single()
          if (newCat) categoryId = newCat.id
        }

        const { data: insertedTx } = await supabase.from('transactions').insert({
          telegram_id: fromId,
          category_id: categoryId,
          amount,
          type,
          description: "Telegram orqali kiritildi"
        }).select('id').single()

        await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n${type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'}: ${amount.toLocaleString()} so'm (${categoryName})`,
            parse_mode: 'HTML',
            reply_markup: insertedTx?.id ? {
              inline_keyboard: [
                [{ text: "🗑 O'chirish", callback_data: `del_tx_${insertedTx.id}` }]
              ]
            } : undefined
          })
        })
      } else if (data.startsWith('del_tx_')) {
        const txId = data.replace('del_tx_', '')
        const { error } = await supabase
          .from('transactions')
          .delete()
          .eq('id', txId)
          .eq('telegram_id', fromId)

        if (error) {
          await sendMessage(chatId, "❌ Tranzaksiyani o'chirishda xatolik yuz berdi.")
        } else {
          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: "🗑 <b>Ushbu tranzaksiya o'chirildi!</b>",
              parse_mode: 'HTML'
            })
          })
        }
      } else if (data.startsWith('d_')) {
        const parts = data.split('_')
        const debtAction = parts[1] // LEND, BORROW, LOAN, REPAY, RECEIVE
        const amount = parseFloat(parts[2])
        const personName = decodeURIComponent(parts[3] || 'Nomaʼlum')

        if (debtAction === 'LEND') {
          const { data: newDebt } = await supabase
            .from('debts')
            .insert({
              telegram_id: fromId,
              person_name: personName,
              type: 'LENT',
              amount,
              paid_amount: 0,
              status: 'ACTIVE'
            })
            .select('id')
            .single()

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'EXPENSE',
            description: `Qarz berildi: ${personName}`,
            debt_id: newDebt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n🤝 <b>Qarz berildi:</b> ${amount.toLocaleString()} so'm (${personName})\n<i>(Hamyondan yechildi va qarzlar daftaringizga kiritildi)</i>`,
              parse_mode: 'HTML'
            })
          })
        } else if (debtAction === 'BORROW' || debtAction === 'LOAN') {
          const debtType = debtAction === 'LOAN' ? 'LOAN' : 'BORROWED'
          const { data: newDebt } = await supabase
            .from('debts')
            .insert({
              telegram_id: fromId,
              person_name: personName,
              type: debtType,
              amount,
              paid_amount: 0,
              status: 'ACTIVE'
            })
            .select('id')
            .single()

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'INCOME',
            description: debtAction === 'LOAN' ? `Kredit olindi: ${personName}` : `Qarz olindi: ${personName}`,
            debt_id: newDebt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n📥 <b>${debtAction === 'LOAN' ? 'Kredit' : 'Qarz'} olindi:</b> ${amount.toLocaleString()} so'm (${personName})\n<i>(Hamyonga qo'shildi va majburiyat ochildi)</i>`,
              parse_mode: 'HTML'
            })
          })
        } else if (debtAction === 'REPAY') {
          // Olingan qarz yoki kreditni to'lash
          const { data: activeDebts } = await supabase
            .from('debts')
            .select('*')
            .eq('telegram_id', fromId)
            .in('type', ['BORROWED', 'LOAN'])
            .eq('status', 'ACTIVE')
            .ilike('person_name', `%${personName}%`)
            .limit(1)

          let debt = activeDebts?.[0]
          if (!debt) {
            const { data: anyDebts } = await supabase
              .from('debts')
              .select('*')
              .eq('telegram_id', fromId)
              .in('type', ['BORROWED', 'LOAN'])
              .eq('status', 'ACTIVE')
              .order('created_at', { ascending: false })
              .limit(1)
            debt = anyDebts?.[0]
          }

          let remainingText = ''
          if (debt) {
            const newPaid = Math.min(Number(debt.amount), Number(debt.paid_amount) + amount)
            const newStatus = newPaid >= Number(debt.amount) ? 'PAID' : 'ACTIVE'
            await supabase.from('debts').update({ paid_amount: newPaid, status: newStatus }).eq('id', debt.id)
            const rem = Math.max(0, Number(debt.amount) - newPaid)
            remainingText = newStatus === 'PAID' ? '\n🎉 <i>Ushbu qarz/kredit toʻliq yopildi!</i>' : `\nQoldiq: <b>${rem.toLocaleString()} so'm</b>`
          }

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'EXPENSE',
            description: `Qarz to'landi: ${debt?.person_name || personName}`,
            debt_id: debt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Toʻlov qabul qilindi!</b>\n\n💸 <b>Qarz toʻlovi:</b> ${amount.toLocaleString()} so'm (${debt?.person_name || personName})${remainingText}\n<i>(Hamyondan chiqim qilindi)</i>`,
              parse_mode: 'HTML'
            })
          })
        } else if (debtAction === 'RECEIVE') {
          // Berilgan qarzning qaytishi
          const { data: activeDebts } = await supabase
            .from('debts')
            .select('*')
            .eq('telegram_id', fromId)
            .eq('type', 'LENT')
            .eq('status', 'ACTIVE')
            .ilike('person_name', `%${personName}%`)
            .limit(1)

          let debt = activeDebts?.[0]
          if (!debt) {
            const { data: anyDebts } = await supabase
              .from('debts')
              .select('*')
              .eq('telegram_id', fromId)
              .eq('type', 'LENT')
              .eq('status', 'ACTIVE')
              .order('created_at', { ascending: false })
              .limit(1)
            debt = anyDebts?.[0]
          }

          let remainingText = ''
          if (debt) {
            const newPaid = Math.min(Number(debt.amount), Number(debt.paid_amount) + amount)
            const newStatus = newPaid >= Number(debt.amount) ? 'PAID' : 'ACTIVE'
            await supabase.from('debts').update({ paid_amount: newPaid, status: newStatus }).eq('id', debt.id)
            const rem = Math.max(0, Number(debt.amount) - newPaid)
            remainingText = newStatus === 'PAID' ? '\n🎉 <i>Qarz toʻliq qaytarildi va yopildi!</i>' : `\nQolgan qarz: <b>${rem.toLocaleString()} so'm</b>`
          }

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'INCOME',
            description: `Qarz qaytdi: ${debt?.person_name || personName}`,
            debt_id: debt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Qarz qaytishi saqlandi!</b>\n\n💰 <b>Qaytarildi:</b> ${amount.toLocaleString()} so'm (${debt?.person_name || personName})${remainingText}\n<i>(Hamyonga kirim qilindi)</i>`,
              parse_mode: 'HTML'
            })
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
