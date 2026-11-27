import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const { state, mockExchangeCode, mockUpdateSelect, mockMaybeSingle, mockAdminUpdate } = vi.hoisted(() => ({
  state: { user: null as null | { id: string; email: string } },
  mockExchangeCode: vi.fn(),
  mockUpdateSelect: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockAdminUpdate: vi.fn(),
}));

const mockLogAuthEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCode,
    },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      update: () => ({ eq: () => ({ select: mockUpdateSelect }) }),
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
    }),
    auth: { admin: { updateUserById: mockAdminUpdate } },
  },
}));

vi.mock('@/lib/server/auth-audit', () => ({
  getClientInfo: () => ({ ip_address: '1.1.1.1', user_agent: 'test' }),
  logAuthEvent: mockLogAuthEvent,
  getUserDisplayName: (u: { email?: string | null }) => u.email || 'unknown',
}));

import { GET as callback } from '@/app/api/auth/callback/route';

function req(code?: string, error?: string) {
  const url = new URL('/api/auth/callback', BASE_URL);
  if (code) url.searchParams.set('code', code);
  if (error) url.searchParams.set('error', error);
  return new NextRequest(url);
}

const VALID_CODE = 'valid-auth-code-123';

describe('GET /api/auth/callback (secure server-side flow)', () => {
  beforeEach(() => {
    state.user = { id: 'u1', email: 'user@army.mil.ng' };

    // Reset all mocks, then set up return values after reset
    mockExchangeCode.mockReset();
    mockExchangeCode.mockResolvedValue({
      data: { session: { user: state.user } },
      error: null,
    });
    mockUpdateSelect.mockReset().mockResolvedValue({ data: [{ user_id: 'u1' }], error: null });
    mockMaybeSingle.mockReset().mockResolvedValue({ data: { role: 'Admin', must_change_password: false }, error: null });
    mockAdminUpdate.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockLogAuthEvent.mockResolvedValue(undefined);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('307 redirects to /reset-password on successful code exchange', async () => {
    const res = await callback(req(VALID_CODE));
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/reset-password');
    expect(mockExchangeCode).toHaveBeenCalledWith(VALID_CODE);
  });

  it('does not modify user_roles.must_change_password', async () => {
    await callback(req(VALID_CODE));
    expect(mockUpdateSelect).not.toHaveBeenCalled();
  });

  it('does not modify auth.users.user_metadata.must_change_password', async () => {
    await callback(req(VALID_CODE));
    expect(mockAdminUpdate).not.toHaveBeenCalled();
  });

  it('307 redirects to /login when no code provided', async () => {
    const res = await callback(req());
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?error=missing_code');
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('307 redirects to /login when Supabase returns an error', async () => {
    const res = await callback(req(undefined, 'access_denied'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?error=access_denied');
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('307 redirects to /login when code exchange fails', async () => {
    mockExchangeCode.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid code' },
    });
    const res = await callback(req(VALID_CODE));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?error=invalid_code');
  });

  it('307 redirects to /login when exchange returns no user', async () => {
    mockExchangeCode.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    const res = await callback(req(VALID_CODE));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?error=invalid_code');
  });
});
