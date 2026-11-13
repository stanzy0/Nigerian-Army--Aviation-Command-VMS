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