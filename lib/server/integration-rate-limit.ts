import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Result of a rate-limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetTime: number; // Unix timestamp in milliseconds when the window resets
  currentCount: number; // Current request count in the window
}

/**
 * Increments the rate-limit counter for a given integration key within a
 * fixed-size time window, atomically.
 *
 * Uses a SECURITY DEFINER PostgreSQL function with INSERT ... ON CONFLICT
 * so the update is atomic and race-free across concurrent requests on serverless instances.
 *
 * @param integrationKeyId - The UUID of the integration key
 * @param limit - Maximum requests allowed per window
 * @param windowSeconds - Window size in seconds
 * @returns The result of the rate-limit check
 */
export async function checkRateLimit(
  integrationKeyId: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!supabaseAdmin) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetTime: 0,
      currentCount: 0,
    };
  }

  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000
  );

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'api_integration_rate_limit_increment',
      { p_key_id: integrationKeyId, p_window_start: windowStart.toISOString() }
    );

    if (error) {
      console.error('[Rate Limit] RPC error:', error.message);
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetTime: windowStart.getTime() + windowSeconds * 1000,
        currentCount: limit + 1,
      };
    }

    const currentCount = (data as number) || 0;

    if (currentCount > limit) {
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetTime: windowStart.getTime() + windowSeconds * 1000,
        currentCount,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - currentCount),
      limit,
      resetTime: windowStart.getTime() + windowSeconds * 1000,
      currentCount,
    };
  } catch (err) {
    console.error('[Rate Limit] Unexpected error:', err);
    // Fail closed: if we can't verify the rate limit, reject the request
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetTime: windowStart.getTime() + windowSeconds * 1000,
      currentCount: limit + 1,
    };
  }
}