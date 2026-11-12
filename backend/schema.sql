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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Cleanup: remove columns/tables left over from the old on-chain prediction-market flow (idempotent)
ALTER TABLE realms DROP COLUMN IF EXISTS market_enabled;
ALTER TABLE realms DROP COLUMN IF EXISTS market_admin_pubkey;
ALTER TABLE realms DROP COLUMN IF EXISTS market_pubkey;
DROP INDEX IF EXISTS idx_realm_markets_realm_id;
DROP TABLE IF EXISTS realm_markets;
