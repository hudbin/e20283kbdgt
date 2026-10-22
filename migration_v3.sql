-- ==============================================================================
-- MIGRATSIYA V3: Byudjet limitlari (Budgets) va Hisoblararo O'tkazmalar (Transfers)
-- ==============================================================================

-- 1. Byudjetlar jadvali (Budgets)
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE, -- NULL bo'lsa butun oylik byudjet
  amount NUMERIC NOT NULL,
  period TEXT CHECK (period IN ('MONTHLY', 'WEEKLY')) DEFAULT 'MONTHLY',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budgets_telegram_id ON budgets(telegram_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id);

-- 2. Tranzaksiyalar jadvaliga o'tkazma (TRANSFER) imkoniyatini qo'shish
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
  ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
