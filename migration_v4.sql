-- ==============================================================================
-- MIGRATSIYA V4: Ko'p valyutalilik (Multi-currency: UZS, USD, EUR, RUB)
-- ==============================================================================

-- 1. Hisoblar jadvaliga valyuta ustunini qo'shish
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UZS';

-- 2. Qarzlar va kreditlar jadvaliga valyuta ustunini qo'shish
ALTER TABLE debts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UZS';

-- 3. Tranzaksiyalar jadvaliga valyuta va kurs ustunlarini qo'shish
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UZS';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;
