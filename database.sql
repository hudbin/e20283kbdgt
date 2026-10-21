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

-- Qarzlar va kreditlar jadvali
CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  type TEXT CHECK (type IN ('LENT', 'BORROWED', 'LOAN')) NOT NULL,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0 NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('ACTIVE', 'PAID')) DEFAULT 'ACTIVE' NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tranzaksiyalar jadvaliga qarz id ustunini ulash
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS debt_id UUID REFERENCES debts(id) ON DELETE SET NULL;

-- Hamyonlar va Hisoblar jadvali (Naqd pul, Uzcard, Humo, Kredit kartalar)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_ACCOUNT')) NOT NULL,
  balance NUMERIC DEFAULT 0 NOT NULL,
  credit_limit NUMERIC DEFAULT 0,
  grace_due_day INT, -- Masalan har oyning 20-kuni (kredit kartalar uchun)
  is_default BOOLEAN DEFAULT false,
  color TEXT DEFAULT 'blue',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Qarzlar va kreditlar jadvaliga qo'shimcha professional ustunlar
ALTER TABLE debts ADD COLUMN IF NOT EXISTS monthly_payment NUMERIC DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS payment_day INT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS is_credit_card BOOLEAN DEFAULT false;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS grace_due_day INT;

-- Tranzaksiyalar jadvaliga qaysi hisobdan (karta/naqd) qilinganini ulash
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;


-- RLS (Row Level Security) - Agar so'rovlar bevosita frontend orqali kelsa kerak bo'ladi. 
-- API routes orqali ishlasak (Service Role ishlatib) buni o'chirib qo'yishimiz yoki policy yozishimiz mumkin.
-- Hozircha Mini App o'zining telegram_id sini biladi deb hisoblab oddiy qoldiramiz.
