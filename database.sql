-- Foydalanuvchilar jadvali
CREATE TABLE users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  language_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Kategoriyalar jadvali
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('INCOME', 'EXPENSE')) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tranzaksiyalar jadvali
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  type TEXT CHECK (type IN ('INCOME', 'EXPENSE')) NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Chat tarixi jadvali (AI konteksti uchun)
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security) - Agar so'rovlar bevosita frontend orqali kelsa kerak bo'ladi. 
-- API routes orqali ishlasak (Service Role ishlatib) buni o'chirib qo'yishimiz yoki policy yozishimiz mumkin.
-- Hozircha Mini App o'zining telegram_id sini biladi deb hisoblab oddiy qoldiramiz.
