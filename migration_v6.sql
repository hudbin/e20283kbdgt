-- ==============================================================================
-- MIGRATION V6: OILAVIY BYUDJET (FAMILY/COLLABORATION SPACES)
-- ==============================================================================

-- 1. Oilaviy / Jamoaviy bo'shliqlar jadvali
CREATE TABLE IF NOT EXISTS spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    invite_code VARCHAR(16) UNIQUE NOT NULL,
    owner_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Bo'shliq a'zolari jadvali (Members)
CREATE TABLE IF NOT EXISTS space_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    role VARCHAR(20) DEFAULT 'MEMBER', -- 'OWNER', 'ADMIN', 'MEMBER'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(space_id, telegram_id)
);

-- 3. Mavjud jadvallarga space_id ustunini qo'shish (ixtiyoriy, agar biriktirilsa umumiy bo'ladi)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_space_members_user ON space_members(telegram_id);
CREATE INDEX IF NOT EXISTS idx_space_members_space ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_spaces_invite_code ON spaces(invite_code);
CREATE INDEX IF NOT EXISTS idx_transactions_space ON transactions(space_id);
