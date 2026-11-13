# Rate Limit Maintenance Guide

## Overview

The NAAC VMS External API uses a fixed-window rate limiting mechanism backed by a PostgreSQL table (`api_integration_rate_limits`) and an atomic `SECURITY DEFINER` function (`api_integration_rate_limit_increment`). This document describes how to maintain, monitor, and clean up the rate limiting system.

## Architecture

### Database Objects

| Object | Type | Purpose |
|--------|------|---------|
| `api_integration_rate_limits` | Table | Stores request counts per integration key per time window |
| `api_integration_rate_limit_increment` | Function (SECURITY DEFINER) | Atomically increments counter, returns new count |

### Table Schema

```sql
CREATE TABLE api_integration_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key_id UUID NOT NULL REFERENCES api_integration_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_api_integration_rate_limits_unique
  ON api_integration_rate_limits(integration_key_id, window_start);
```

### Rate Limit Function (Fixed Concurrency)

```sql
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
```

The function uses `INSERT ... ON CONFLICT DO UPDATE` to atomically handle concurrent first-requests within a window, eliminating the previous race condition between `UPDATE` and `INSERT`.

## Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Window Size | 60 seconds | Fixed 1-minute windows |
| Limit | 100 requests | Per integration key per window |
| Enforcement | Fail-closed | Database errors reject requests |

## Cleanup Procedures

### Automated Cleanup (Recommended)

Create a scheduled job (pg_cron, cron, or application-level) to remove expired rate limit windows:

```sql
-- Remove windows older than 2 hours (120 minutes)
-- Keeps recent windows for debugging while preventing unbounded growth
DELETE FROM api_integration_rate_limits
WHERE window_start < NOW() - INTERVAL '2 hours';
```

**Suggested Schedule:** Run every 5 minutes via pg_cron:

```sql
SELECT cron.schedule(
  'cleanup-rate-limits',
  '*/5 * * * *',
  $$DELETE FROM api_integration_rate_limits WHERE window_start < NOW() - INTERVAL '2 hours';$$
);
```

### Manual Cleanup

```sql
-- View table size
SELECT pg_size_pretty(pg_total_relation_size('api_integration_rate_limits'));

-- Count rows by age
SELECT
  COUNT(*) FILTER (WHERE window_start < NOW() - INTERVAL '1 hour') AS older_than_1h,
  COUNT(*) FILTER (WHERE window_start < NOW() - INTERVAL '2 hours') AS older_than_2h,
  COUNT(*) FILTER (WHERE window_start < NOW() - INTERVAL '24 hours') AS older_than_24h
FROM api_integration_rate_limits;

-- Delete old windows (adjust interval as needed)
DELETE FROM api_integration_rate_limits
WHERE window_start < NOW() - INTERVAL '2 hours';
```

## Monitoring

### Key Metrics to Watch

| Metric | Query | Alert Threshold |
|--------|-------|-----------------|
| Table row count | `SELECT COUNT(*) FROM api_integration_rate_limits;` | > 100,000 rows |
| Table size | `SELECT pg_size_pretty(pg_total_relation_size('api_integration_rate_limits'));` | > 50 MB |
| Old windows | `SELECT COUNT(*) FROM api_integration_rate_limits WHERE window_start < NOW() - INTERVAL '2 hours';` | > 10,000 rows |
| Rate limit hits | `SELECT COUNT(*) FROM api_integration_audit_logs WHERE outcome = 'rate_limited' AND created_at > NOW() - INTERVAL '1 hour';` | Sudden spike |

### Health Check Query

```sql
-- Verify rate limit function works
SELECT api_integration_rate_limit_increment(
  '00000000-0000-0000-0000-000000000000'::UUID,  -- test key (will fail auth but tests function)
  DATE_TRUNC('minute', NOW())::TIMESTAMPTZ
);
-- Expected: ERROR (key not found) or count returned
```

## Troubleshooting

### Rate Limits Not Resetting

**Symptom:** Clients report rate limits persisting beyond 1 minute.

**Causes:**
1. Clock skew between app and database servers
2. Cleanup job not running

**Resolution:**
1. Verify `NOW()` is consistent across app and DB
2. Check cleanup job status: `SELECT * FROM cron.job WHERE jobname = 'cleanup-rate-limits';`
3. Run manual cleanup (see above)

### Race Condition Errors (Historical)

**Previous Issue:** The original function used `UPDATE` + `INSERT` fallback, causing duplicate key errors under concurrent first-requests.

**Fixed By:** Migration to `INSERT ... ON CONFLICT DO UPDATE` (atomic upsert).

**Verification:** Load test with concurrent requests to same key/window should not produce duplicate key errors.

### Function Permission Errors

**Symptom:** `permission denied for function api_integration_rate_limit_increment`

**Resolution:** Ensure grants are correct:
```sql
REVOKE ALL ON FUNCTION public.api_integration_rate_limit_increment(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.api_integration_rate_limit_increment(UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.api_integration_rate_limit_increment(UUID, TIMESTAMPTZ) TO service_role;
```

## Migration History

| Date | Migration | Change |
|------|-----------|--------|
| 2026-11-12 | 20261112_create_naac_external_api.sql | Initial rate limit table and function (UPDATE + INSERT) |
| 2026-11-12 | 20261112_create_naac_external_api.sql (amended) | Fixed race condition: replaced UPDATE+INSERT with INSERT ON CONFLICT |

## Rollback Procedure

If the atomic upsert function causes issues, revert to the previous version:

```sql
-- WARNING: Reintroduces race condition under high concurrency
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
  UPDATE api_integration_rate_limits
  SET request_count = request_count + 1,
      updated_at = NOW()
  WHERE integration_key_id = p_key_id
    AND window_start = p_window_start
  RETURNING request_count INTO current_count;

  IF NOT FOUND THEN
    INSERT INTO api_integration_rate_limits(integration_key_id, window_start, request_count)
    VALUES (p_key_id, p_window_start, 1)
    RETURNING request_count INTO current_count;
  END IF;

  RETURN current_count;
END;
$$;
```

**Note:** Only use rollback as last resort. The race condition affects only the first concurrent request in a new window.

## Related Documentation

- [NAAC Command Control API Documentation](./naac-command-control-api.md)
- [Migration Verification Report](./migration-verification.md)
- [OpenAPI Specification](./openapi.yaml)