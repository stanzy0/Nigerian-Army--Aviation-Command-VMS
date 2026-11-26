import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Result of authenticating an API integration request.
 */
export interface IntegrationAuthResult {
  authorized: boolean;
  integrationId: string | null;
  integrationName: string | null;
  scopes: string[];
  error: string | null;
  status: number;
}

/**
 * Result of validating an API token.
 */
interface TokenValidationResult {
  authorized: boolean;
  integrationId: string | null;
  integrationName: string | null;
  scopes: string[];
  error: string | null;
  status: number;
}

/**
 * Extracts the raw token from an Authorization header value.
 *
 * The Bearer scheme is matched case-insensitively (per RFC 7235) and tolerates
 * arbitrary leading/trailing whitespace between the scheme and the token.
 * Returns null when the header is absent or does not use the Bearer scheme.
 *
 * This does NOT validate the token; it only performs scheme parsing.
 *
 * @param header - The raw `Authorization` header value (or null).
 */
export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Authenticates an API integration request by validating the Bearer token
 * against the api_integration_keys table.
 *
 * The token is never stored in plaintext; only its SHA-256 hash is compared
 * against the stored key_hash.
 *
 * @param bearerToken - The raw bearer token from the Authorization header
 * @param requiredScope - Optional required scope (e.g., 'visitors:read')
 */
export async function authenticateApiKey(
  bearerToken: string | null,
  requiredScope?: string
): Promise<TokenValidationResult> {
  if (!bearerToken) {
    return {
      authorized: false,
      integrationId: null,
      integrationName: null,
      scopes: [],
      error: 'Missing authorization token',
      status: 401,
    };
  }

  // Hash the provided token using SHA-256
  const tokenHash = createHash('sha256').update(bearerToken).digest('hex');

  if (!supabaseAdmin) {
    return {
      authorized: false,
      integrationId: null,
      integrationName: null,
      scopes: [],
      error: 'Service role key not configured',
      status: 500,
    };
  }

  // Look up the token hash in the api_integration_keys table
  const { data: keyRow, error } = await supabaseAdmin
    .from('api_integration_keys')
    .select('id, name, key_hash, scopes, is_active, expires_at, revoked_at')
    .eq('key_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('[API Auth] Key lookup error:', error.message);
    return {
      authorized: false,
      integrationId: null,
      integrationName: null,
      scopes: [],
      error: 'Authentication failed',
      status: 500,
    };
  }

  if (!keyRow) {
    return {
      authorized: false,
      integrationId: null,
      integrationName: null,
      scopes: [],
      error: 'Invalid token',
      status: 401,
    };
  }

  // Check if the key is active
  if (!keyRow.is_active) {
    return {
      authorized: false,
      integrationId: keyRow.id,
      integrationName: keyRow.name,
      scopes: keyRow.scopes || [],
      error: 'Integration key is inactive',
      status: 401,
    };
  }

  // Check expiration
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return {
      authorized: false,
      integrationId: keyRow.id,
      integrationName: keyRow.name,
      scopes: keyRow.scopes || [],
      error: 'Integration key has expired',
      status: 401,
    };
  }

  // Check revocation
  if (keyRow.revoked_at) {
    return {
      authorized: false,
      integrationId: keyRow.id,
      integrationName: keyRow.name,
      scopes: keyRow.scopes || [],
      error: 'Integration key has been revoked',
      status: 401,
    };
  }

  // Check required scope
  if (requiredScope && (!keyRow.scopes || !keyRow.scopes.includes(requiredScope))) {
    return {
      authorized: false,
      integrationId: keyRow.id,
      integrationName: keyRow.name,
      scopes: keyRow.scopes || [],
      error: 'Insufficient scope',
      status: 403,
    };
  }

  // Best-effort telemetry: record last successful use. This is fire-and-forget
  // and must never block the request or turn a valid request into a failure if
  // the update fails. Only the key id is used; the plaintext token is never stored.
  void supabaseAdmin
    .from('api_integration_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)
    .then(
      () => undefined,
      () => undefined
    );

  return {
    authorized: true,
    integrationId: keyRow.id,
    integrationName: keyRow.name,
    scopes: keyRow.scopes || [],
    error: null,
    status: 200,
  };
}

export type { TokenValidationResult };