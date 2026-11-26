-- Migration: Add user_agent column to audit_logs
-- The auth audit logger (lib/server/auth-audit.ts) writes a user_agent value,
-- but the original audit_logs table (20251024_init_naavc.sql) never defined
-- this column. Without it, every authentication audit insert fails.
--
-- This migration is additive and idempotent. It does not drop, rename, or
-- alter existing columns and does not touch existing records.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_agent TEXT;