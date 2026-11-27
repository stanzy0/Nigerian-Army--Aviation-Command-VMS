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

// user_roles lookup chain: .from('user_roles').select('role').eq(...).maybeSingle()
function mockUserRole(role: string | null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: role ? { role } : null, error: null });
  mockFrom.mockReturnValue(chain);
}

function successUser(id: string) {
  return {
    data: {
      user: { id, email: 'nsikak.obot@army.mil.ng', user_metadata: {} },
      session: { access_token: 'token', user: { id } },
    },
    error: null,
  };
}

describe('POST /api/auth/login role resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogAuthEvent.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rbdgjkwmjizptlqucfjv.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('records Admin from the user_roles table', async () => {
    mockSignIn.mockResolvedValue(successUser('admin-1'));
    mockUserRole('Admin');

    const res = await login(makeLoginRequest('nsikak.obot@army.mil.ng'));
    expect(res.status).toBe(200);

    const event = mockLogAuthEvent.mock.calls.find((c) => c[0].action === 'login_success')[0];
    expect(event.role).toBe('Admin');
    expect(event.details).toContain('role Admin');
    expect(event.details).not.toContain('Unknown');
  });

  it('records Receptionist from the user_roles table', async () => {
    mockSignIn.mockResolvedValue(successUser('reception-1'));
    mockUserRole('Receptionist');

    await login(makeLoginRequest('reception@army.mil.ng'));

    const event = mockLogAuthEvent.mock.calls.find((c) => c[0].action === 'login_success')[0];
    expect(event.role).toBe('Receptionist');
    expect(event.details).toContain('role Receptionist');
  });

  it('does not invent a role when user_roles has no record', async () => {
    mockSignIn.mockResolvedValue(successUser('norole-1'));
    mockUserRole(null);

    const res = await login(makeLoginRequest('norole@army.mil.ng'));
    expect(res.status).toBe(403); // secure: no role, no redirect
    const body = await res.json();
    expect(body.error).toContain('assigned role');
    expect(body.redirectUrl).toBeUndefined();

    const event = mockLogAuthEvent.mock.calls.find((c) => c[0].action === 'login_success')[0];
    expect(event.role).toBeNull();
    expect(event.metadata).toEqual({ missingRole: true });
    expect(event.details).toContain('Unknown');
  });

  it('records failed login without a role (unchanged behaviour)', async () => {
    mockSignIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'bad' } });

    const res = await login(makeLoginRequest('bad@army.mil.ng'));
    expect(res.status).toBe(401);

    const event = mockLogAuthEvent.mock.calls.find(
      (c) => c[0].action === 'login_failed_invalid_credentials'
    )[0];
    expect(event.role).toBeUndefined();
  });
});