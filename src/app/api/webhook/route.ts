import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { analyzeTextMessage, analyzeAudioMessage, analyzeMediaReceipt, answerFinancialQuery } from '@/lib/gemini'
import { extractText } from 'unpdf'
import { generatePdfBuffer, generateExcelBuffer } from '@/lib/reports/generator'
import { getExchangeRates, convertToUZS, formatCurrency } from '@/lib/currency'

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

export const maxDuration = 60 // Vercel funksiyasi uchun maksimal 60 soniya vaqt berish

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (body.message) {
      const { chat, text, from, voice, photo, document, caption } = body.message

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
          `🔹 <b>Xarajat/Kirim kiritish:</b> <i>"2 ta flesh 30 ming"</i>, ovozli xabar yoki <b>to'lov cheki/kvitansiya rasmi (PDF)</b> yuboring.\n` +
          `🔹 <b>Hisobot fayllarini so'rash:</b> <i>"O'tgan oy hisobotini ber pdf va excel fayllarda"</i> deb yozing yoki ayting.\n` +
          `🔹 <b>Tahliliy savollar:</b> <i>"Ichimliklar uchun qancha sarfladim?"</i>, <i>"Menda qancha balans qoldi?"</i> deb so'rang.\n` +
          `🔹 <b>Oilaviy byudjet:</b> <i>/family</i> deb yozing.\n` +
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

      // Agar buyruq /family yoki "oila" bo'lsa
      if (lowerText === '/family' || lowerText === 'oila' || lowerText === "oilaviy byudjet") {
        try {
          const { data: userSpaces } = await supabase
            .from('space_members')
            .select('space_id, role, spaces(id, name, invite_code)')
            .eq('telegram_id', from.id)

          if (!userSpaces || userSpaces.length === 0) {
            await sendMessage(
              chat.id,
              `👨‍👩‍👧‍👦 <b>Oilaviy Byudjet:</b>\n\n` +
              `Siz hali hech qanday oilaviy guruhga a'zo emassiz.\n\n` +
              `Mini App orqali oilaviy guruh yaratishingiz yoki taklif kodi orqali oila a'zolaringizga qo'shilishingiz mumkin!`
            )
            return NextResponse.json({ ok: true })
          }

          let spaceListText = `👨‍👩‍👧‍👦 <b>Siz a'zo bo'lgan Oilaviy Guruhlar:</b>\n\n`
          for (const s of userSpaces) {
            const spaceInfo = s.spaces as any
            if (spaceInfo) {
              const { data: memberCount } = await supabase
                .from('space_members')
                .select('id')
                .eq('space_id', spaceInfo.id)

              spaceListText += `🔹 <b>${spaceInfo.name}</b>\n`
              spaceListText += `🔑 Taklif kodi: <code>${spaceInfo.invite_code}</code>\n`
              spaceListText += `👥 A'zolar soni: ${memberCount?.length || 1} kishi\n`
              spaceListText += `👑 Sizning rolingiz: <i>${s.role}</i>\n\n`
            }
          }
          spaceListText += `<i>A'zolarni qo'shish uchun yuqoridagi taklif kodini oila a'zolaringizga yuboring!</i>`

          await sendMessage(chat.id, spaceListText)
          return NextResponse.json({ ok: true })
        } catch (fErr: any) {
          console.error("Family fetch error:", fErr)
        }
      }

      let parsedData: any = null
      let originalPromptText = text || caption || ""

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

      // Bazadan foydalanuvchining mavjud hisoblarini olamiz
      let existingAccounts: any[] = []
      try {
        const { data: accData } = await supabase
          .from('accounts')
          .select('id, name, type, is_default, balance')
          .eq('telegram_id', from.id)

        if (accData && accData.length > 0) {
          existingAccounts = accData
        }
      } catch (accErr) {
        console.error("Hisoblarni yuklashda xatolik:", accErr)
      }

      if (text) {
        await sendTypingAction(chat.id, 'typing')
        try {
          const responseText = await analyzeTextMessage(text, existingCategories, existingAccounts)
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

            const responseText = await analyzeAudioMessage(audioBase64, voice.mime_type || 'audio/ogg', existingCategories, existingAccounts)
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
      } else if (photo && Array.isArray(photo) && photo.length > 0) {
        // Rasm (Photo) / Kvitansiya skrinshoti kelgan holat
        await sendTypingAction(chat.id, 'typing')
        await sendMessage(chat.id, "🔍 To'lov cheki qabul qilindi, tahlil qilinmoqda...")
        try {
          // Eng yuqori sifatli rasmni olamiz (oxirgi element)
          const largestPhoto = photo[photo.length - 1]
          const fileRes = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${largestPhoto.file_id}`)
          const fileData = await fileRes.json()

          if (fileData.ok && fileData.result?.file_path) {
            const fileDownloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
            const imgRes = await fetch(fileDownloadUrl)
            const imgBuffer = await imgRes.arrayBuffer()
            const imgBase64 = Buffer.from(imgBuffer).toString('base64')

            const responseText = await analyzeMediaReceipt(imgBase64, 'image/jpeg', caption || '', existingCategories, existingAccounts)
            parsedData = JSON.parse(responseText)
            originalPromptText = parsedData?.description || caption || "Kvitansiya rasmi"
          } else {
            await sendMessage(chat.id, "Rasmni Telegram'dan yuklab olishda muammo yuz berdi. Iltimos qayta yuboring.")
            return NextResponse.json({ ok: true })
          }
        } catch (e: any) {
          console.error("AI Photo Error:", e)
          await sendMessage(chat.id, `To'lov chekini tahlil qilishda xatolik yuz berdi: ${e?.message || 'Noma\'lum xatolik'}`)
          return NextResponse.json({ ok: true })
        }
      } else if (document) {
        // PDF yoki boshqa hujjat kelgan holat
        await sendTypingAction(chat.id, 'typing')
        await sendMessage(chat.id, "📄 Kvitansiya hujjati qabul qilindi, tahlil qilinmoqda...")
        try {
          const mime = document.mime_type || ''
          const isPdf = mime.includes('pdf') || (document.file_name && document.file_name.toLowerCase().endsWith('.pdf'))
          const isImageDoc = mime.startsWith('image/')

          if (isPdf || isImageDoc) {
            const fileRes = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${document.file_id}`)
            const fileData = await fileRes.json()

            if (fileData.ok && fileData.result?.file_path) {
              const fileDownloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
              const docRes = await fetch(fileDownloadUrl)
              const docBuffer = await docRes.arrayBuffer()
              const nodeBuffer = Buffer.from(docBuffer)

              if (isPdf) {
                // PDF matnini ajratib olamiz (Payme, Click, Bank cheklarining matni to'g'ridan-to'g'ri olinadi)
                let extractedText = ''
                try {
                  const pdfRes = await extractText(new Uint8Array(nodeBuffer))
                  extractedText = Array.isArray(pdfRes.text) ? pdfRes.text.join('\n') : (pdfRes.text || '')
                  extractedText = extractedText.trim()
                } catch (pdfErr) {
                  console.warn("extractText failed, fallbacking:", pdfErr)
                }

                if (extractedText && extractedText.length > 10) {
                  const combinedText = `To'lov kvitansiyasi PDF hujjati:\n${extractedText}\n${caption ? `Izoh: ${caption}` : ''}`
                  const responseText = await analyzeTextMessage(combinedText, existingCategories, existingAccounts)
                  parsedData = JSON.parse(responseText)
                  originalPromptText = parsedData?.description || caption || "PDF kvitansiya"
                } else {
                  // Matnsiz (skanerlangan rasm ko'rinishidagi) PDF bo'lsa
                  await sendMessage(chat.id, "Ushbu PDF fayldan matn ajratib bo'lmadi. Iltimos, chekning skrinshotini (rasm qilib) yuboring.")
                  return NextResponse.json({ ok: true })
                }
              } else {
                // Hujjat sifatida yuborilgan rasm
                const docBase64 = nodeBuffer.toString('base64')
                const responseText = await analyzeMediaReceipt(docBase64, mime || 'image/jpeg', caption || '', existingCategories, existingAccounts)
                parsedData = JSON.parse(responseText)
                originalPromptText = parsedData?.description || caption || "Kvitansiya hujjati"
              }
            } else {
              await sendMessage(chat.id, "Faylni Telegram'dan yuklab olishda muammo yuz berdi.")
              return NextResponse.json({ ok: true })
            }
          } else {
            await sendMessage(chat.id, "Iltimos, to'lov kvitansiyasini rasm (JPEG/PNG) yoki PDF shaklida yuboring.")
            return NextResponse.json({ ok: true })
          }
        } catch (e: any) {
          console.error("AI Document Error:", e)
          await sendMessage(chat.id, `Kvitansiya faylini tahlil qilishda xatolik yuz berdi: ${e?.message || 'Noma\'lum xatolik'}`)
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

        const { data: userAccounts } = await supabase
          .from('accounts')
          .select('*')
          .eq('telegram_id', from.id)

        const aiAnswer = await answerFinancialQuery(originalPromptText, simplifiedData, simplifiedDebts, userAccounts || [])
        await sendMessage(chat.id, aiAnswer)
        return NextResponse.json({ ok: true })
      }

      // 3. Agar QARZ yoki KREDIT amaliyoti bo'lsa (DEBT):
      if (parsedData?.action === 'DEBT' && parsedData?.amount) {
        const debtAction = parsedData.debt_action || 'LEND'
        const personName = (parsedData.person_name || 'Nomaʼlum').trim()
        const amountNum = Number(parsedData.amount)
        const currency = (parsedData.currency || 'UZS').toUpperCase()
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

        const confirmMessage = `<b>Qarz amaliyoti tahlil qilindi:</b>\n\n📌 <b>Amal:</b> ${actionTitle}\n💰 <b>Summa:</b> ${formatCurrency(amountNum, currency)}\n${actionDesc}${dueText}${descText}\n\nMa'lumotlarni tasdiqlaysizmi?`

        const safePerson = encodeURIComponent(personName.slice(0, 25))
        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `d_${debtAction}_${amountNum}_${safePerson}_${currency}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
        return NextResponse.json({ ok: true })
      }

      // 4. Agar HISOB-LARARO O'TKAZMA bo'lsa (TRANSFER):
      if (parsedData?.action === 'TRANSFER' && parsedData?.amount) {
        const amountNum = Number(parsedData.amount)
        const descText = parsedData.description ? `\n📝 <b>Izoh:</b> ${parsedData.description}` : ''

        // Chiqim hisobini topish (from)
        let fromAccount: any = null
        if (parsedData.from_account_name && existingAccounts.length > 0) {
          fromAccount = existingAccounts.find(a =>
            a.name.toLowerCase().includes(parsedData.from_account_name.toLowerCase()) ||
            parsedData.from_account_name.toLowerCase().includes(a.name.toLowerCase())
          )
        }
        if (!fromAccount && existingAccounts.length > 0) {
          fromAccount = existingAccounts[0]
        }

        // Kirim hisobini topish (to)
        let toAccount: any = null
        if (parsedData.to_account_name && existingAccounts.length > 0) {
          toAccount = existingAccounts.find(a =>
            a.id !== fromAccount?.id && (
              a.name.toLowerCase().includes(parsedData.to_account_name.toLowerCase()) ||
              parsedData.to_account_name.toLowerCase().includes(a.name.toLowerCase())
            )
          )
        }
        if (!toAccount && existingAccounts.length > 1) {
          toAccount = existingAccounts.find(a => a.id !== fromAccount?.id)
        }

        if (!fromAccount || !toAccount || fromAccount.id === toAccount.id) {
          await sendMessage(chat.id, `Hisoblararo o'tkazish uchun kamida 2 ta turli hisob (masalan Uzcard va Naqd pul) bo'lishi kerak. Iltimos, Mini App orqali hisoblaringizni tekshiring.`)
          return NextResponse.json({ ok: true })
        }

        const confirmMessage = `<b>Hisoblararo o'tkazma:</b>\n\n🔄 <b>Amal:</b> Pul o'tkazish\n📤 <b>Chiqim hisobi:</b> ${fromAccount.name}\n📥 <b>Kirim hisobi:</b> ${toAccount.name}\n💰 <b>Summa:</b> ${amountNum.toLocaleString()} so'm${descText}\n\nMa'lumotlarni tasdiqlaysizmi?`

        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `tr_${amountNum}_${fromAccount.id}_${toAccount.id}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
        return NextResponse.json({ ok: true })
      }

      // 5. Agar JAMG'ARMA MAQSADIGA (GOAL) pul qo'shish bo'lsa:
      if (parsedData?.action === 'GOAL' && parsedData?.amount) {
        const amountNum = Number(parsedData.amount)
        const currency = (parsedData.currency || 'UZS').toUpperCase()
        const goalQuery = (parsedData.goal_name || '').toLowerCase().trim()

        const { data: userGoals } = await supabase
          .from('goals')
          .select('*')
          .eq('telegram_id', from.id)
          .eq('status', 'ACTIVE')

        let targetGoal: any = null
        if (userGoals && userGoals.length > 0) {
          if (goalQuery) {
            targetGoal = userGoals.find(g => g.name.toLowerCase().includes(goalQuery) || goalQuery.includes(g.name.toLowerCase()))
          }
          if (!targetGoal) {
            targetGoal = userGoals[0]
          }
        }

        if (!targetGoal) {
          await sendMessage(chat.id, `Sizda hali faol jamg'arma maqsadi ochilmagan. Iltimos, Mini App orqali yangi maqsad (masalan: "Umra", "Mashina") yarating.`)
          return NextResponse.json({ ok: true })
        }

        const confirmMessage = `🎯 <b>Jamg'arma maqsadi:</b>\n\n📌 <b>Maqsad:</b> ${targetGoal.name}\n💰 <b>Qoʻshiladigan summa:</b> ${formatCurrency(amountNum, currency)}\n📊 <b>Joriy holat:</b> ${formatCurrency(targetGoal.current_amount, targetGoal.currency)} / ${formatCurrency(targetGoal.target_amount, targetGoal.currency)}\n\nMa'lumotlarni tasdiqlaysizmi?`

        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `g_DEP_${amountNum}_${targetGoal.id}_${currency}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
        return NextResponse.json({ ok: true })
      }

      // 6. Agar yangi TRANZAKSIYA bo'lsa:
      if (parsedData?.type && parsedData?.amount) {
        const typeLabel = parsedData.type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'
        const categoryLabel = parsedData.category || (parsedData.type === 'EXPENSE' ? 'Xarajat' : 'Daromad')
        const amountNum = Number(parsedData.amount)
        const currency = (parsedData.currency || 'UZS').toUpperCase()
        const descText = parsedData.description ? `\n📝 <b>Izoh:</b> ${parsedData.description}` : ''
        const categoryBadge = parsedData.is_new_category ? ' <i>(Yangi taklif 🆕)</i>' : ''

        // Hisobni aniqlash
        let chosenAccount: any = null
        if (parsedData.account_name && existingAccounts.length > 0) {
          chosenAccount = existingAccounts.find(a => 
            a.name.toLowerCase().includes(parsedData.account_name.toLowerCase()) ||
            parsedData.account_name.toLowerCase().includes(a.name.toLowerCase())
          )
        }
        if (!chosenAccount && existingAccounts.length > 0) {
          chosenAccount = existingAccounts.find(a => a.is_default) || existingAccounts[0]
        }

        const accountText = chosenAccount ? `\n💳 <b>Hisob:</b> ${chosenAccount.name}` : ''
        const accountIdParam = chosenAccount ? chosenAccount.id : 'none'

        const confirmMessage = `<b>Tahlil qilindi:</b>\n\n📌 <b>Tur:</b> ${typeLabel}\n💰 <b>Summa:</b> ${formatCurrency(amountNum, currency)}\n📂 <b>Kategoriya:</b> ${categoryLabel}${categoryBadge}${accountText}${descText}\n\nMa'lumotlarni tasdiqlaysizmi?`

        const safeCat = encodeURIComponent(categoryLabel.slice(0, 25))
        await sendMessage(chat.id, confirmMessage, {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `c_${parsedData.type[0]}_${amountNum}_${safeCat}_${accountIdParam}_${currency}` },
              { text: "❌ Bekor qilish", callback_data: "cancel" }
            ]
          ]
        })
      } else if (text || voice || photo || document) {
        await sendMessage(chat.id, "Kechirasiz, xabaringiz yoki fayldagi ma'lumotlarni to'liq tushunmadim. Iltimos, chek ravshan ekanligiga ishonch hosil qiling yoki: <i>\"30 mingga go'sht oldim\"</i> deb yozing.")
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
        const accountId = parts[4] && parts[4] !== 'none' ? parts[4] : null
        const currency = (parts[5] || 'UZS').toUpperCase()

        let exchangeRate = 1
        if (currency !== 'UZS') {
          try {
            const rates = await getExchangeRates()
            exchangeRate = (rates as any)[currency] || 1
          } catch (_) {}
        }

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
          account_id: accountId,
          amount,
          type,
          currency,
          exchange_rate: exchangeRate,
          description: "Telegram orqali kiritildi"
        }).select('id').single()

        let accountLabel = ''
        if (accountId) {
          const { data: acc } = await supabase
            .from('accounts')
            .select('name, balance, currency')
            .eq('id', accountId)
            .single()

          if (acc) {
            accountLabel = `\n💳 <b>Hisob:</b> ${acc.name}`
            const curBal = Number(acc.balance) || 0
            const accCur = (acc.currency || 'UZS').toUpperCase()
            // Agar hisob valyutasi bilan tranzaksiya valyutasi bir xil bo'lsa o'z summasi, aks holda kursga ko'paytiriladi
            const finalDeductAmount = accCur === currency ? amount : amount * exchangeRate
            const newBal = type === 'EXPENSE' ? curBal - finalDeductAmount : curBal + finalDeductAmount
            await supabase.from('accounts').update({ balance: newBal }).eq('id', accountId)
          }
        }

        let budgetAlert = ''
        if (type === 'EXPENSE' && categoryId) {
          try {
            const { data: budgetData } = await supabase
              .from('budgets')
              .select('amount')
              .eq('telegram_id', fromId)
              .eq('category_id', categoryId)
              .maybeSingle()

            if (budgetData && Number(budgetData.amount) > 0) {
              const budgetLimit = Number(budgetData.amount)
              const now = new Date()
              const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
              const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

              const { data: monthCatExpenses } = await supabase
                .from('transactions')
                .select('amount, currency, exchange_rate')
                .eq('telegram_id', fromId)
                .eq('category_id', categoryId)
                .eq('type', 'EXPENSE')
                .gte('date', startOfMonth)
                .lte('date', endOfMonth)

              const totalSpent = (monthCatExpenses || []).reduce((sum, e) => {
                const eAmount = Number(e.amount) || 0
                const eRate = Number(e.exchange_rate) || 1
                return sum + (e.currency && e.currency !== 'UZS' ? eAmount * eRate : eAmount)
              }, 0)
              const percent = Math.round((totalSpent / budgetLimit) * 100)

              if (percent >= 100) {
                budgetAlert = `\n\n🚨 <b>DIQQAT: Byudjet oshib ketdi!</b>\n"${categoryName}" uchun oylik byudjetingiz (${budgetLimit.toLocaleString()} so'm) 100% dan oshdi (sarflandi: ${totalSpent.toLocaleString()} so'm)!`
              } else if (percent >= 80) {
                budgetAlert = `\n\n⚠️ <b>Ogohlantirish:</b> "${categoryName}" oylik byudjetingizning ${percent}% qismi sarflandi (${totalSpent.toLocaleString()} / ${budgetLimit.toLocaleString()} so'm).`
              }
            }
          } catch (_) {}
        }

        const convertedNote = currency !== 'UZS' ? ` <i>(~${Math.round(amount * exchangeRate).toLocaleString()} so'm)</i>` : ''

        await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n${type === 'EXPENSE' ? '📉 Chiqim' : '📈 Kirim'}: ${formatCurrency(amount, currency)}${convertedNote} (${categoryName})${accountLabel}${budgetAlert}`,
            parse_mode: 'HTML'
          })
        })
      } else if (data.startsWith('tr_')) {
        const parts = data.split('_')
        const amount = parseFloat(parts[1])
        const fromAccountId = parts[2]
        const toAccountId = parts[3]

        const { data: fromAcc } = await supabase.from('accounts').select('name, balance').eq('id', fromAccountId).single()
        const { data: toAcc } = await supabase.from('accounts').select('name, balance').eq('id', toAccountId).single()

        if (fromAcc && toAcc) {
          const fromBal = Number(fromAcc.balance) || 0
          const toBal = Number(toAcc.balance) || 0

          await supabase.from('accounts').update({ balance: fromBal - amount }).eq('id', fromAccountId)
          await supabase.from('accounts').update({ balance: toBal + amount }).eq('id', toAccountId)

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            category_id: null,
            account_id: fromAccountId,
            to_account_id: toAccountId,
            amount,
            type: 'TRANSFER',
            description: `O'tkazma: ${fromAcc.name} ➡️ ${toAcc.name}`
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>O'tkazma muvaffaqiyatli bajarildi!</b>\n\n🔄 <b>${fromAcc.name}</b> ➡️ <b>${toAcc.name}</b>: ${amount.toLocaleString()} so'm`,
              parse_mode: 'HTML'
            })
          })
        }
      } else if (data.startsWith('g_DEP_')) {
        const parts = data.split('_')
        const amount = parseFloat(parts[2])
        const goalId = parts[3]
        const currency = parts[4] || 'UZS'

        const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
        if (goal) {
          const curVal = Number(goal.current_amount) || 0
          const newVal = curVal + amount
          const isCompleted = newVal >= Number(goal.target_amount)

          await supabase.from('goals').update({
            current_amount: newVal,
            status: isCompleted ? 'COMPLETED' : 'ACTIVE'
          }).eq('id', goalId)

          const percent = Math.min(100, Math.round((newVal / Number(goal.target_amount)) * 100))

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `🎯 <b>Maqsadga pul muvaffaqiyatli qo'shildi!</b>\n\n📌 <b>${goal.name}</b>\n💰 Qo'shildi: +${formatCurrency(amount, currency)}\n📊 Yig'ildi: ${formatCurrency(newVal, goal.currency)} (${percent}%)${isCompleted ? '\n🎉 <i>Tabriklaymiz, maqsad 100% bajarildi!</i>' : ''}`,
              parse_mode: 'HTML'
            })
          })
        }
      } else if (data.startsWith('del_tx_')) {
        const txId = data.replace('del_tx_', '')
        
        // O'chirishdan oldin hisob balansini tiklash uchun ma'lumot olamiz
        const { data: txToDel } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', txId)
          .eq('telegram_id', fromId)
          .maybeSingle()

        const { error } = await supabase
          .from('transactions')
          .delete()
          .eq('id', txId)
          .eq('telegram_id', fromId)

        if (error) {
          await sendMessage(chatId, "❌ Tranzaksiyani o'chirishda xatolik yuz berdi.")
        } else {
          if (txToDel && txToDel.account_id) {
            const { data: acc } = await supabase
              .from('accounts')
              .select('balance')
              .eq('id', txToDel.account_id)
              .single()

            if (acc) {
              const curBal = Number(acc.balance) || 0
              const txAmount = Number(txToDel.amount) || 0
              const restoredBal = txToDel.type === 'INCOME' ? curBal - txAmount : curBal + txAmount
              await supabase.from('accounts').update({ balance: restoredBal }).eq('id', txToDel.account_id)
            }
          }

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
        const currency = (parts[4] || 'UZS').toUpperCase()

        let exchangeRate = 1
        if (currency !== 'UZS') {
          try {
            const rates = await getExchangeRates()
            exchangeRate = (rates as any)[currency] || 1
          } catch (_) {}
        }

        if (debtAction === 'LEND') {
          const { data: newDebt } = await supabase
            .from('debts')
            .insert({
              telegram_id: fromId,
              person_name: personName,
              type: 'LENT',
              amount,
              paid_amount: 0,
              status: 'ACTIVE',
              currency
            })
            .select('id')
            .single()

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'EXPENSE',
            currency,
            exchange_rate: exchangeRate,
            description: `Qarz berildi: ${personName}`,
            debt_id: newDebt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n🤝 <b>Qarz berildi:</b> ${formatCurrency(amount, currency)} (${personName})\n<i>(Hamyondan yechildi va qarzlar daftaringizga kiritildi)</i>`,
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
              status: 'ACTIVE',
              currency
            })
            .select('id')
            .single()

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'INCOME',
            currency,
            exchange_rate: exchangeRate,
            description: debtAction === 'LOAN' ? `Kredit olindi: ${personName}` : `Qarz olindi: ${personName}`,
            debt_id: newDebt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n📥 <b>${debtAction === 'LOAN' ? 'Kredit' : 'Qarz'} olindi:</b> ${formatCurrency(amount, currency)} (${personName})\n<i>(Hamyonga qo'shildi va majburiyat ochildi)</i>`,
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
            remainingText = newStatus === 'PAID' ? '\n🎉 <i>Ushbu qarz/kredit toʻliq yopildi!</i>' : `\nQoldiq: <b>${formatCurrency(rem, currency)}</b>`
          }

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'EXPENSE',
            currency,
            exchange_rate: exchangeRate,
            description: `Qarz to'landi: ${debt?.person_name || personName}`,
            debt_id: debt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Toʻlov qabul qilindi!</b>\n\n💸 <b>Qarz toʻlovi:</b> ${formatCurrency(amount, currency)} (${debt?.person_name || personName})${remainingText}\n<i>(Hamyondan chiqim qilindi)</i>`,
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
            remainingText = newStatus === 'PAID' ? '\n🎉 <i>Qarz toʻliq qaytarildi va yopildi!</i>' : `\nQolgan qarz: <b>${formatCurrency(rem, currency)}</b>`
          }

          await supabase.from('transactions').insert({
            telegram_id: fromId,
            amount,
            type: 'INCOME',
            currency,
            exchange_rate: exchangeRate,
            description: `Qarz qaytdi: ${debt?.person_name || personName}`,
            debt_id: debt?.id || null
          })

          await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ <b>Qarz qaytishi saqlandi!</b>\n\n💰 <b>Qaytarildi:</b> ${formatCurrency(amount, currency)} (${debt?.person_name || personName})${remainingText}\n<i>(Hamyonga kirim qilindi)</i>`,
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
