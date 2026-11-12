-- Database Schema for Gather Clone
-- Run this SQL to set up your PostgreSQL database

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    skin VARCHAR(10) DEFAULT '009',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Realms table (replaces Supabase realms table)
CREATE TABLE IF NOT EXISTS realms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    share_id VARCHAR(100) UNIQUE NOT NULL,
    map_data JSONB NOT NULL,
    only_owner BOOLEAN DEFAULT FALSE,
    market_enabled BOOLEAN DEFAULT FALSE,
    market_admin_pubkey VARCHAR(88),
    market_pubkey VARCHAR(88),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration: add market columns to existing realms table (safe to run on an existing DB)
ALTER TABLE realms ADD COLUMN IF NOT EXISTS market_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE realms ADD COLUMN IF NOT EXISTS market_admin_pubkey VARCHAR(88);
ALTER TABLE realms ADD COLUMN IF NOT EXISTS market_pubkey VARCHAR(88);

-- Per-realm prediction markets table (supports multiple markets per realm)
CREATE TABLE IF NOT EXISTS realm_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    realm_id UUID NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
    market_pubkey VARCHAR(88) NOT NULL UNIQUE,
    market_name VARCHAR(50) NOT NULL,
    deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realm_markets_realm_id ON realm_markets(realm_id);

-- Migration: populate realm_markets from existing realms.market_pubkey (safe to run on existing DB)
INSERT INTO realm_markets (realm_id, market_pubkey, market_name)
SELECT id, market_pubkey, name || ' Market'
FROM realms
WHERE market_pubkey IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM realm_markets rm WHERE rm.market_pubkey = realms.market_pubkey
  );

-- Visited realms table (replaces Supabase profiles.visited_realms)
CREATE TABLE IF NOT EXISTS visited_realms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, share_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_realms_owner_id ON realms(owner_id);
CREATE INDEX IF NOT EXISTS idx_realms_share_id ON realms(share_id);
CREATE INDEX IF NOT EXISTS idx_visited_realms_user_id ON visited_realms(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_realms_updated_at BEFORE UPDATE ON realms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
