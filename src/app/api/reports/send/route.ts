import { NextResponse } from 'next/server'

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const telegramId = formData.get('telegram_id') as string
    const file = formData.get('file') as File
    const caption = formData.get('caption') as string || '📊 Siz soʻragan budjet hisoboti'

    if (!telegramId || !file) {
      return NextResponse.json({ error: 'telegram_id and file are required' }, { status: 400 })
    }

    // Telegram sendDocument API uchun form tayyorlaymiz
    const tgFormData = new FormData()
    tgFormData.append('chat_id', telegramId)
    tgFormData.append('document', file, file.name)
    tgFormData.append('caption', caption)

    const res = await fetch(`${TELEGRAM_API_URL}/sendDocument`, {
      method: 'POST',
      body: tgFormData
    })

    const data = await res.json()

    if (!data.ok) {
      console.error('Telegram sendDocument error:', data)
      return NextResponse.json({ error: data.description }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Fayl bot chatiga muvaffaqiyatli yuborildi!' })
  } catch (error: any) {
    console.error('Send report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
