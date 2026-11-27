import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';
const COOKIE = 'sb-test-auth-token';

const { jar, state } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  state: { validCredentials: true },
}));

const mockFrom = vi.hoisted(() => vi.fn());
const mockLogAuthEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

vi.mock('@supabase/ssr', () => {
  const makeClient = (options: {
    cookies: { getAll: () => Array<{ name: string; value: string }>; setAll: (c: Array<{ name: string; value: string; options?: unknown }>) => void };
  }) => ({
    auth: {
      signInWithPassword: async () => {
        if (!state.validCredentials) {
          return { data: { user: null, session: null }, error: { message: 'bad' } };
        }
        options.cookies.setAll([{ name: COOKIE, value: 'session-json', options: { path: '/' } }]);
        return {
          data: { user: { id: 'u1', email: 'user@army.mil.ng', user_metadata: {} }, session: { access_token: 'at' } },
          error: null,
        };
      },
      getUser: async () => {
        const found = options.cookies.getAll().find((c) => c.name === COOKIE);
        if (!found) return { data: { user: null }, error: { message: 'no session' } };
        return { data: { user: { id: 'u1', email: 'user@army.mil.ng' } }, error: null };
      },
      signOut: async () => ({ error: null }),
    },
  });
  return {
    createServerClient: (_url: string, _key: string, opts: never) => makeClient(opts),
    createBrowserClient: () => makeClient({ cookies: { getAll: () => [], setAll: () => undefined } }),
  };
});

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }));

vi.mock('@/lib/server/auth-audit', () => ({
  getClientInfo: () => ({ ip_address: '1.1.1.1', user_agent: 'test-agent' }),
  logAuthEvent: mockLogAuthEvent,
  getUserDisplayName: (u: { email?: string | null }) => u.email || 'unknown',
}));

import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';

function loginRequest(): NextRequest {
  const body = new URLSearchParams({ email: 'user@army.mil.ng', password: 'secret' });
  return new NextRequest(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

function mockRole(role: string | null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null });
  mockFrom.mockReturnValue(chain);
}

describe('login session establishment (SSR cookie) + first /api/auth/me', () => {
  beforeEach(() => {
    jar.clear();
    state.validCredentials = true;
    mockLogAuthEvent.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rbdgjkwmjizptlqucfjv.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    mockRole('Admin');
  });

  it('writes the SSR session cookie and returns a redirect', async () => {
    const res = await login(loginRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectUrl).toBe('/dashboard');
    expect(jar.has(COOKIE)).toBe(true);
  });

  it('first /api/auth/me after login returns 200', async () => {
    await login(loginRequest());
    const res = await me(new NextRequest(new URL('/api/auth/me', BASE_URL)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('Admin');
  });

  it('failed login creates no session and /api/auth/me returns 401', async () => {
    state.validCredentials = false;
    const res = await login(loginRequest());
    expect(res.status).toBe(401);
    expect(jar.size).toBe(0);

    const meRes = await me(new NextRequest(new URL('/api/auth/me', BASE_URL)));
    expect(meRes.status).toBe(401);
  });
});