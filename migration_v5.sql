-- ==============================================================================
-- MIGRATSIYA V5: Moliyaviy Jamg'arma Maqsadlari (Goals) va Obunalar (Subscriptions)
-- ==============================================================================

-- 1. Jamg'arma maqsadlari jadvali (Goals / Piggy bank)
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC NOT NULL,
  current_amount NUMERIC DEFAULT 0 NOT NULL,
  currency TEXT DEFAULT 'UZS',
  deadline TIMESTAMP WITH TIME ZONE,
  color TEXT DEFAULT 'amber',
  status TEXT CHECK (status IN ('ACTIVE', 'COMPLETED')) DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_telegram_id ON goals(telegram_id);

-- 2. Obunalar va Takrorlanuvchi to'lovlar jadvali (Subscriptions / Recurring)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'UZS',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  billing_day INT NOT NULL, -- oyning 1-31 kuni
  period TEXT CHECK (period IN ('MONTHLY', 'YEARLY')) DEFAULT 'MONTHLY',
  status TEXT CHECK (status IN ('ACTIVE', 'PAUSED')) DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_id ON subscriptions(telegram_id);
