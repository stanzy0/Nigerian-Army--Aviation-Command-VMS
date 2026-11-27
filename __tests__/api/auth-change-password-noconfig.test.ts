import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const { state, mockAdminUpdate, mockSignIn } = vi.hoisted(() => ({
  state: { user: null as null | { id: string; email: string } },
  mockAdminUpdate: vi.fn(),
  mockSignIn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword: mockSignIn } }),
}));

// Service-role client is not configured.
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }));

vi.mock('@/lib/server/auth-audit', () => ({
  getClientInfo: () => ({ ip_address: '1.1.1.1', user_agent: 'test' }),
  logAuthEvent: vi.fn().mockResolvedValue(undefined),
  getUserDisplayName: (u: { email?: string | null }) => u.email || 'unknown',
  getUserRole: () => null,
}));

import { POST as changePassword } from '@/app/api/auth/change-password/route';

function req(body: unknown) {
  return new NextRequest(new URL('/api/auth/change-password', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/change-password — missing service-role config', () => {
  beforeEach(() => {
    state.user = { id: 'u1', email: 'user@army.mil.ng' };
    mockSignIn.mockReset().mockResolvedValue({ error: null });
    mockAdminUpdate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('500s safely and does not change the password or clear flags', async () => {
    const res = await changePassword(req({ current_password: 'OldPass1!', new_password: 'NewPass1!' }));
    expect(res.status).toBe(500);
    expect(mockAdminUpdate).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});