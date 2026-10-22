// Telegram WebApp initData HMAC-SHA256 tekshiruvi
// Havola: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app

import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidatedInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  raw: Record<string, string>;
}

/**
 * Telegram Mini App dan kelgan initData qatorini tekshiradi va foydalanuvchini qaytaradi.
 * Bot token maxfiy kalit sifatida ishlatiladi.
 */
export function validateTelegramInitData(initDataString: string, botToken?: string): ValidatedInitData | null {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initDataString) {
    return null;
  }

  try {
    const urlParams = new URLSearchParams(initDataString);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    // hash maydonini tekshirish ma'lumotlaridan olib tashlaymiz
    const dataCheckArr: string[] = [];
    const raw: Record<string, string> = {};

    urlParams.forEach((val, key) => {
      if (key !== 'hash') {
        dataCheckArr.push(`${key}=${val}`);
      }
      raw[key] = val;
    });

    // Telegram talabi bo'yicha alifbo tartibida saralash kerak
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // 1. Secret key hosil qilish: HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(token)
      .digest();

    // 2. Hash hosil qilish: HMAC-SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return null;
    }

    // auth_date ning eskirib qolmaganini tekshirish mumkin (ixtiyoriy: 24 soat)
    const authDate = Number(raw['auth_date'] || 0);
    const userStr = raw['user'];
    if (!userStr) return null;

    const user: TelegramUser = JSON.parse(userStr);

    return {
      user,
      auth_date: authDate,
      hash,
      raw
    };
  } catch (err) {
    console.error('Telegram initData tekshirishda xatolik:', err);
    return null;
  }
}

/**
 * Request'dan Telegram foydalanuvchisini xavfsiz aniqlash.
 * Agar `x-telegram-init-data` headeri bo'lsa uni tekshiradi,
 * bo'lmasa fallback parametr (telegram_id) orqali ishlaydi (development yoki bot webhooklar uchun).
 */
export function getAuthenticatedTelegramUser(req: Request): { telegramId: number; isValidated: boolean; user?: TelegramUser } | null {
  const initDataHeader = req.headers.get('x-telegram-init-data');

  if (initDataHeader) {
    const validated = validateTelegramInitData(initDataHeader);
    if (validated && validated.user) {
      return {
        telegramId: validated.user.id,
        isValidated: true,
        user: validated.user
      };
    }
  }

  // Fallback: searchParams yoki bot so'rovlari
  const url = new URL(req.url);
  const paramId = url.searchParams.get('telegram_id');
  if (paramId) {
    const num = Number(paramId);
    if (!isNaN(num) && num > 0) {
      return {
        telegramId: num,
        isValidated: false
      };
    }
  }

  return null;
}
