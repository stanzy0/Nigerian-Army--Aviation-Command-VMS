#!/usr/bin/env npx tsx
/**
 * NAAC VMS - API Token Revocation Script
 *
 * Revokes an existing API integration token by setting is_active = false and revoked_at = NOW().
 * Does not physically delete the record.
 *
 * Usage:
 *   npx tsx scripts/revoke-api-token.mts --id <uuid>
 *   npx tsx scripts/revoke-api-token.mts --name "NAAC Command Control"
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 */

import { createClient } from '@supabase/supabase-js';

interface RevokeTokenOptions {
  id?: string;
  name?: string;
}

function parseArgs(): RevokeTokenOptions | null {
  const args = process.argv.slice(2);
  const options: RevokeTokenOptions = {
    id: undefined,
    name: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--id' || arg === '-i') {
      if (!nextArg || nextArg.startsWith('-')) {
        console.error('Error: --id requires a value');
        return null;
      }
      options.id = nextArg;
      i++;
    } else if (arg === '--name' || arg === '-n') {
      if (!nextArg || nextArg.startsWith('-')) {
        console.error('Error: --name requires a value');
        return null;
      }
      options.name = nextArg;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('-')) {
      console.error(`Error: Unknown option ${arg}`);
      return null;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
NAAC VMS - API Token Revocation Script

Usage:
  npx tsx scripts/revoke-api-token.mts --id <uuid>
  npx tsx scripts/revoke-api-token.mts --name "Integration Name"

Options:
  -i, --id <uuid>       Integration key UUID
  -n, --name <name>     Integration name (case-insensitive)
  -h, --help            Show this help message

Note: Provide either --id OR --name, not both.

Example:
  npx tsx scripts/revoke-api-token.mts --id "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  npx tsx scripts/revoke-api-token.mts --name "NAAC Command Control"

Environment Variables Required:
  SUPABASE_SERVICE_ROLE_KEY   Service role key for database access
  NEXT_PUBLIC_SUPABASE_URL    Supabase project URL (or SUPABASE_URL)

Revocation sets is_active = false and revoked_at = NOW().
The record is NOT deleted - audit history is preserved.
`);
}

function validateUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

async function revokeToken(options: RevokeTokenOptions): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be set');
    process.exit(1);
  }

  if (!options.id && !options.name) {
    console.error('Error: Either --id or --name must be provided');
    printHelp();
    process.exit(1);
  }

  if (options.id && options.name) {
    console.error('Error: Provide either --id OR --name, not both');
    process.exit(1);
  }

  if (options.id && !validateUuid(options.id)) {
    console.error('Error: Invalid UUID format for --id');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // First, find the integration key
  let query = supabase
    .from('api_integration_keys')
    .select('id, name, key_hash, scopes, is_active, expires_at, created_at, revoked_at')
    .eq('is_active', true);

  if (options.id) {
    query = query.eq('id', options.id);
  } else {
    query = query.ilike('name', options.name!);
  }

  const { data: keys, error: findError } = await query;

  if (findError) {
    console.error('Error finding integration key:', findError.message);
    process.exit(1);
  }

  if (!keys || keys.length === 0) {
    console.error('Error: No active integration key found with the given criteria');
    process.exit(1);
  }

  if (keys.length > 1) {
    console.error('Error: Multiple integration keys match the given name. Use --id to specify exactly one.');
    console.error('Matching keys:');
    for (const key of keys) {
      console.error(`  ${key.id} - ${key.name} (scopes: ${key.scopes.join(', ')})`);
    }
    process.exit(1);
  }

  const key = keys[0];

  if (!key.is_active) {
    console.error('Error: Integration key is already inactive');
    process.exit(1);
  }

  if (key.revoked_at) {
    console.error('Error: Integration key is already revoked');
    process.exit(1);
  }

  console.log('Found integration key:');
  console.log(`  ID: ${key.id}`);
  console.log(`  Name: ${key.name}`);
  console.log(`  Scopes: ${key.scopes.join(', ')}`);
  console.log(`  Created: ${key.created_at}`);
  console.log(`  Expires: ${key.expires_at || 'Never'}`);
  console.log('');

  console.log('Revoking this key will:');
  console.log('  - Set is_active = false');
  console.log('  - Set revoked_at = NOW()');
  console.log('  - Immediately block all API access using this token');
  console.log('');

  // Perform revocation
  const { error: updateError } = await supabase
    .from('api_integration_keys')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', key.id);

  if (updateError) {
    console.error('Error revoking token:', updateError.message);
    process.exit(1);
  }

  console.log('=== TOKEN REVOKED ===');
  console.log(`Integration key ${key.id} (${key.name}) has been successfully revoked.`);
  console.log('All API access using this token is now blocked.');
  console.log('=====================\n');
}

const options = parseArgs();
if (!options) {
  printHelp();
  process.exit(1);
}

await revokeToken(options);