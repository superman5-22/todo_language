-- =============================================================================
-- Supabase / PostgreSQL Setup for Multi-Language TODO App
-- Run this SQL in the Supabase SQL Editor to initialize the database.
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- todos table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS todos (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    title      TEXT        NOT NULL,
    completed  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatically update updated_at on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER todos_set_updated_at
    BEFORE UPDATE ON todos
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Index for ordering by creation time (common query pattern)
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at DESC);

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Disable for server-side API access; enable and configure if using Supabase
-- client directly from the browser with user authentication.
-- -----------------------------------------------------------------------------
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Allow full access for service_role (used by server-side backends)
CREATE POLICY "service_role_all" ON todos
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- (Optional) Allow anonymous read/write for demo purposes – remove in production
CREATE POLICY "anon_all" ON todos
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Seed data (optional – comment out if not needed)
-- -----------------------------------------------------------------------------
INSERT INTO todos (title, completed) VALUES
    ('Supabase のテーブルを作成する', TRUE),
    ('フロントエンドを実装する', TRUE),
    ('Node.js バックエンドを実装する', FALSE),
    ('Python バックエンドを実装する', FALSE),
    ('Go バックエンドを実装する', FALSE);
