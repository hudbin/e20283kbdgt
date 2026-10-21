-- ==============================================================================
-- MIGRATSIYA V2: Hamyonlar (Accounts), Kreditlar taqvimi va Kredit kartalar (Grace period)
-- ==============================================================================

-- 1. Hamyonlar va Hisoblar jadvali (Naqd pul, Uzcard, Humo, Kredit kartalar)
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

-- 2. Qarzlar va Kreditlar jadvaliga qo'shimcha professional ustunlar
ALTER TABLE debts ADD COLUMN IF NOT EXISTS monthly_payment NUMERIC DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS payment_day INT; -- Har oyning qaysi sanasida (1-31)
ALTER TABLE debts ADD COLUMN IF NOT EXISTS is_credit_card BOOLEAN DEFAULT false;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS grace_due_day INT;

-- 3. Tranzaksiyalar jadvaliga qaysi hisobdan (karta/naqd) qilinganini ulash
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- 4. Indekslar (Tezkor qidiruv va hisobotlar uchun)
CREATE INDEX IF NOT EXISTS idx_accounts_telegram_id ON accounts(telegram_id);
CREATE INDEX IF NOT EXISTS idx_debts_telegram_id ON debts(telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
