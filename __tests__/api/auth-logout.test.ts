import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', email: 'user@army.mil.ng' } } }),
      signOut: async () => ({ error: null }),
    },
  }),
}));

vi.mock('@/lib/server/auth-audit', () => ({
  getClientInfo: () => ({ ip_address: '1.1.1.1', user_agent: 'test-agent' }),
  logAuthEvent: vi.fn().mockResolvedValue(undefined),
  getUserDisplayName: (u: { email?: string | null }) => u.email || 'unknown',
  getUserRole: () => null,
}));

import { POST as logout } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout clears auth cookie chunks', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('clears every sb-...-auth-token chunk and preserves unrelated cookies', async () => {
    const cookieHeader =
      'sb-abc-auth-token.0=chunk0; sb-abc-auth-token.1=chunk1; sb-abc-auth-token=legacy; other_cookie=keep';
    const req = new NextRequest(new URL('/api/auth/logout', BASE_URL), {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });

    const res = await logout(req);
    expect(res.status).toBe(307); // NextResponse.redirect default

    const setCookies = res.headers.getSetCookie();
    const cleared = setCookies.filter((c) => c.startsWith('sb-abc-auth-token'));
    // base chunk + two numbered chunks all cleared
    expect(cleared.length).toBe(3);
    for (const c of cleared) {
      expect(c).toMatch(/Max-Age=0/i);
    }
    // unrelated cookie is not touched
    expect(setCookies.some((c) => c.startsWith('other_cookie'))).toBe(false);
  });
});