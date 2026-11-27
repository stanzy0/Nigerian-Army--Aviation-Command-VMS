import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const mockSignIn = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockLogAuthEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithPassword: mockSignIn } }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('@/lib/server/auth-audit', () => ({
  getClientInfo: () => ({ ip_address: '1.1.1.1', user_agent: 'test-agent' }),
  logAuthEvent: mockLogAuthEvent,
  getUserDisplayName: (u: { email?: string | null; full_name?: string | null }) =>
    u.full_name || u.email || 'unknown',
}));

import { POST as login } from '@/app/api/auth/login/route';

function makeLoginRequest(email: string): NextRequest {
  const body = new URLSearchParams({ email, password: 'secret' });
  return new NextRequest(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

function mockUserRole(role: string | null, mustChangePassword = false) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: role ? { role, must_change_password: mustChangePassword } : null, error: null });
  mockFrom.mockReturnValue(chain);
}

function successUser(id: string, mustChangePassword = false) {
  return {
    data: {
      user: {
        id,
        email: 'user@army.mil.ng',
        user_metadata: mustChangePassword ? { must_change_password: true } : {},
      },
      session: { access_token: 'token', user: { id } },
    },
    error: null,
  };
}

async function redirectFor(role: string | null, opts: { mustChangePassword?: boolean; roleMustChange?: boolean } = {}) {
  mockSignIn.mockResolvedValue(successUser('u1', opts.mustChangePassword));
  mockUserRole(role, opts.roleMustChange);
  const res = await login(makeLoginRequest('user@army.mil.ng'));
  const body = await res.json();
  return { status: res.status, body };
}

describe('POST /api/auth/login role-based redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogAuthEvent.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rbdgjkwmjizptlqucfjv.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('Admin -> /dashboard', async () => {
    expect((await redirectFor('Admin')).body.redirectUrl).toBe('/dashboard');
  });

  it('Receptionist -> /dashboard', async () => {
    expect((await redirectFor('Receptionist')).body.redirectUrl).toBe('/dashboard');
  });

  it('PA_TO_CI -> /pa-ci', async () => {
    expect((await redirectFor('PA_TO_CI')).body.redirectUrl).toBe('/pa-ci');
  });

  it('PA_TO_DIRECTOR -> /pa-director', async () => {
    expect((await redirectFor('PA_TO_DIRECTOR')).body.redirectUrl).toBe('/pa-director');
  });

  it('Security -> /security', async () => {
    expect((await redirectFor('Security')).body.redirectUrl).toBe('/security');
  });

  it('Host Employee -> /host', async () => {
    expect((await redirectFor('Host Employee')).body.redirectUrl).toBe('/host');
  });

  it('unlisted role (Commandant) defaults to /dashboard', async () => {
    expect((await redirectFor('Commandant')).body.redirectUrl).toBe('/dashboard');
  });

  it('metadata=true is ignored when a DB row exists (DB authoritative)', async () => {
    const { status, body } = await redirectFor('Admin', { mustChangePassword: true, roleMustChange: false });
    expect(status).toBe(200);
    expect(body.redirectUrl).toBe('/dashboard');
  });

  it('must_change_password (user_roles) -> /change-password', async () => {
    const { body } = await redirectFor('Security', { roleMustChange: true });
    expect(body.redirectUrl).toBe('/change-password');
  });

  it('stale metadata=true with DB=false does NOT force change (DB authoritative)', async () => {
    // Metadata flag true, but user_roles.must_change_password false.
    const { status, body } = await redirectFor('Admin', { mustChangePassword: true, roleMustChange: false });
    expect(status).toBe(200);
    expect(body.redirectUrl).toBe('/dashboard');
  });

  it('missing role -> 403 with no redirect', async () => {
    const { status, body } = await redirectFor(null);
    expect(status).toBe(403);
    expect(body.redirectUrl).toBeUndefined();
    expect(body.error).toContain('assigned role');
  });

  it('failed login -> 401 and no session/redirect', async () => {
    mockSignIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'bad' } });
    const res = await login(makeLoginRequest('bad@army.mil.ng'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.redirectUrl).toBeUndefined();
    const failed = mockLogAuthEvent.mock.calls.find((c) => c[0].action === 'login_failed_invalid_credentials');
    expect(failed).toBeTruthy();
  });
});