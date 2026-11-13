-- Nigerian Army Aviation Command Visitor Management System
-- External API integration tables
-- Migration: 20261112_create_naac_external_api.sql
--
-- Creates tables for external API integration:
--   - api_integration_keys: API key management for external integrations
--   - api_integration_audit_logs: Audit logging for API access
--   - api_integration_rate_limits: Persistent rate limiting per API key
--
-- Read-only migration: Does not modify existing tables or data.
-- RLS is enabled on all tables; access is restricted to service_role only.

-- API integration keys
-- Stores hashed API tokens for external integrations (e.g., NAAC Command Control System).
-- Only service-role operations should access this table.
CREATE TABLE IF NOT EXISTS api_integration_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_integration_keys_hash ON api_integration_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_integration_keys_active ON api_integration_keys(is_active);

ALTER TABLE api_integration_keys ENABLE ROW LEVEL SECURITY;

-- API integration audit logs
-- Records all external API access for audit and troubleshooting.
-- Does NOT store bearer tokens, visitor personal information, or sensitive query parameters.
CREATE TABLE IF NOT EXISTS api_integration_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key_id UUID REFERENCES api_integration_keys(id) ON DELETE SET NULL,
  integration_name TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  request_id TEXT,
  response_time_ms INTEGER,
  result_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_integration_audit_logs_key_id ON api_integration_audit_logs(integration_key_id);
CREATE INDEX IF NOT EXISTS idx_api_integration_audit_logs_created_at ON api_integration_audit_logs(created_at);

ALTER TABLE api_integration_audit_logs ENABLE ROW LEVEL SECURITY;

-- API integration rate limits
-- Persistent per-key rate limiting across serverless invocations.
-- Uses atomic increment via api_integration_rate_limit_increment() function.
CREATE TABLE IF NOT EXISTS api_integration_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key_id UUID NOT NULL REFERENCES api_integration_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_integration_rate_limits_unique ON api_integration_rate_limits(integration_key_id, window_start);
CREATE INDEX IF NOT EXISTS idx_api_integration_rate_limits_key_id ON api_integration_rate_limits(integration_key_id);
CREATE INDEX IF NOT EXISTS idx_api_integration_rate_limits_window ON api_integration_rate_limits(window_start);

ALTER TABLE api_integration_rate_limits ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER function for atomic rate-limit increment.
-- Runs as service role so it can update the rate_limits table regardless of caller RLS.
-- Returns the new request count after increment.
-- Uses INSERT ... ON CONFLICT DO UPDATE to avoid race conditions on concurrent first requests.
CREATE OR REPLACE FUNCTION api_integration_rate_limit_increment(
  p_key_id UUID,
  p_window_start TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  INSERT INTO api_integration_rate_limits (integration_key_id, window_start, request_count)
  VALUES (p_key_id, p_window_start, 1)
  ON CONFLICT (integration_key_id, window_start) DO UPDATE
    SET request_count = api_integration_rate_limits.request_count + 1,
        updated_at = NOW()
  RETURNING request_count INTO current_count;

  RETURN current_count;
END;
$$;

-- Restrict function execution to service role only
REVOKE ALL ON FUNCTION public.api_integration_rate_limit_increment(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.api_integration_rate_limit_increment(UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.api_integration_rate_limit_increment(UUID, TIMESTAMPTZ) TO service_role;
