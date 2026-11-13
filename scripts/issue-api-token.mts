#!/usr/bin/env npx tsx
/**
 * NAAC VMS - API Token Issuance Script
 *
 * Generates a cryptographically secure API token for external integration.
 * The plaintext token is displayed ONLY ONCE. Only the SHA-256 hash is stored.
 *
 * Usage:
 *   npx tsx scripts/issue-api-token.mts --name "NAAC Command Control" --scopes "visitors:read,visits:read" --expires-days 365
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 *   - Node.js 18+ with crypto.randomBytes
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

interface IssueTokenOptions {
  name: string;
  scopes: string[];
  expiresDays?: number;
}

function parseArgs(): IssueTokenOptions | null {
  const args = process.argv.slice(2);
  const options: IssueTokenOptions = {
    name: '',
    scopes: [],
    expiresDays: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--name' || arg === '-n') {
      if (!nextArg || nextArg.startsWith('-')) {
        console.error('Error: --name requires a value');
        return null;
      }
      options.name = nextArg;
      i++;
    } else if (arg === '--scopes' || arg === '-s') {
      if (!nextArg || nextArg.startsWith('-')) {
        console.error('Error: --scopes requires a value');
        return null;
      }
      options.scopes = nextArg.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      i++;
    } else if (arg === '--expires-days' || arg === '-e') {
      if (!nextArg || nextArg.startsWith('-')) {
        console.error('Error: --expires-days requires a value');
        return null;
      }
      const days = parseInt(nextArg, 10);
      if (isNaN(days)) {
        console.error('Error: --expires-days must be a number');
        return null;
      }
      options.expiresDays = days;
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
NAAC VMS - API Token Issuance Script

Usage:
  npx tsx scripts/issue-api-token.mts --name "Integration Name" --scopes "scope1,scope2" [--expires-days 365]

Options:
  -n, --name <name>           Integration name (required)
  -s, --scopes <scopes>       Comma-separated scopes (required)
                               Valid scopes: visitors:read, visitor_phone:read, visits:read, departments:read
  -e, --expires-days <days>   Token expiry in days (1-3650, default: no expiry)
  -h, --help                  Show this help message

Example:
  npx tsx scripts/issue-api-token.mts --name "NAAC Command Control" --scopes "visitors:read,visits:read" --expires-days 365

Environment Variables Required:
  SUPABASE_SERVICE_ROLE_KEY   Service role key for database access
  NEXT_PUBLIC_SUPABASE_URL    Supabase project URL (or SUPABASE_URL)

The plaintext token is displayed ONLY ONCE. Store it securely.
`);
}

function validateScopes(scopes: string[]): void {
  const validScopes = [
    'visitors:read',
    'visitor_phone:read',
    'visits:read',
    'departments:read',
  ];

  for (const scope of scopes) {
    if (!validScopes.includes(scope)) {
      console.error(`Error: Invalid scope '${scope}'`);
      console.error(`Valid scopes: ${validScopes.join(', ')}`);
      process.exit(1);
    }
  }

  if (scopes.length === 0) {
    console.error('Error: At least one scope is required');
    process.exit(1);
  }
}

function validateExpiryDays(days: number | undefined): void {
  if (days !== undefined) {
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      console.error('Error: Expiry days must be an integer between 1 and 3650 (10 years)');
      process.exit(1);
    }
  }
}

function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    console.error('Error: Integration name is required and cannot be empty');
    process.exit(1);
  }
  if (name.length > 100) {
    console.error('Error: Integration name must be 100 characters or fewer');
    process.exit(1);
  }
}

async function issueToken(options: IssueTokenOptions): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be set');
    process.exit(1);
  }

  validateName(options.name);
  validateScopes(options.scopes);
  validateExpiryDays(options.expiresDays);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Generate 32 bytes (256 bits) of cryptographically secure random data
  const tokenBytes = randomBytes(32);
  const tokenSuffix = tokenBytes.toString('hex');
  const plaintextToken = `naac_live_${tokenSuffix}`;

  // Calculate SHA-256 hash for storage
  const tokenHash = createHash('sha256').update(plaintextToken).digest('hex');

  // Calculate expiry date if provided
  let expiresAt: string | null = null;
  if (options.expiresDays) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + options.expiresDays);
    expiresAt = expiryDate.toISOString();
  }

  // Insert into database
  const { data, error } = await supabase
    .from('api_integration_keys')
    .insert({
      name: options.name.trim(),
      key_hash: tokenHash,
      scopes: options.scopes,
      is_active: true,
      expires_at: expiresAt,
    })
    .select('id, name, scopes, is_active, expires_at, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      console.error('Error: A token with this hash already exists (extremely unlikely collision). Please try again.');
    } else {
      console.error('Error inserting token:', error.message);
    }
    process.exit(1);
  }

  // Display the token ONLY ONCE
  console.log('\n=== API TOKEN ISSUED ===');
  console.log('IMPORTANT: This token will NOT be shown again. Store it securely.');
  console.log('');
  console.log(`Token: ${plaintextToken}`);
  console.log('');
  console.log('Integration Details:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Name: ${data.name}`);
  console.log(`  Scopes: ${data.scopes.join(', ')}`);
  console.log(`  Active: ${data.is_active}`);
  console.log(`  Expires: ${data.expires_at || 'Never'}`);
  console.log(`  Created: ${data.created_at}`);
  console.log('');
  console.log('Usage: Include in Authorization header as:');
  console.log(`  Authorization: Bearer ${plaintextToken}`);
  console.log('========================\n');
}

const options = parseArgs();
if (!options) {
  printHelp();
  process.exit(1);
}

if (!options.name || options.scopes.length === 0) {
  console.error('Error: --name and --scopes are required');
  printHelp();
  process.exit(1);
}

await issueToken(options);