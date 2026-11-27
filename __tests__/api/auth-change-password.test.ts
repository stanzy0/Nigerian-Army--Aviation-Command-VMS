import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const { state, mockUpdateSelect, mockMaybeSingle, mockAdminUpdate, mockSignIn } = vi.hoisted(() => ({
  state: { user: null as null | { id: string; email: string }, currentPasswordValid: true },
  mockUpdateSelect: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockAdminUpdate: vi.fn(),
  mockSignIn: vi.fn(),
}));

const mockLogAuthEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword: mockSignIn } }),
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

const VALID = { current_password: 'OldPass1!', new_password: 'NewPass1!' };

describe('POST /api/auth/change-password (secure server-side flow)', () => {
  beforeEach(() => {
    state.user = { id: 'u1', email: 'user@army.mil.ng' };
    state.currentPasswordValid = true;
    mockUpdateSelect.mockReset().mockResolvedValue({ data: [{ user_id: 'u1' }], error: null });
    mockMaybeSingle.mockReset().mockResolvedValue({ data: { role: 'Admin', must_change_password: false }, error: null });
    mockAdminUpdate.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockSignIn.mockReset().mockImplementation(async () =>
      state.currentPasswordValid ? { error: null } : { error: { message: 'bad' } }
    );
    mockLogAuthEvent.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('401 when unauthenticated', async () => {
    state.user = null;
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(401);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateSelect).not.toHaveBeenCalled();
  });

  it('400 and NO flag clear when the current password is wrong (no bypass)', async () => {
    state.currentPasswordValid = false;
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Current password');
    expect(mockAdminUpdate).not.toHaveBeenCalled();
    expect(mockUpdateSelect).not.toHaveBeenCalled();
  });

  it('400 on weak new password without clearing flags', async () => {
    const res = await changePassword(req({ current_password: 'OldPass1!', new_password: 'weak' }));
    expect(res.status).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateSelect).not.toHaveBeenCalled();
  });

  it('changes password, clears both flags, audits and redirects', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { role: 'Security', must_change_password: false }, error: null });
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(200);
    expect((await res.json()).redirectUrl).toBe('/security');
    expect(mockSignIn).toHaveBeenCalled(); // current password verified
    expect(mockAdminUpdate).toHaveBeenCalledWith('u1', { password: 'NewPass1!' });
    expect(mockUpdateSelect).toHaveBeenCalled(); // user_roles cleared
    expect(mockLogAuthEvent).toHaveBeenCalled();
  });

  it('500 when the DB flag is still true after update (no redirect)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { role: 'Admin', must_change_password: true }, error: null });
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(500);
    expect((await res.json()).redirectUrl).toBeUndefined();
  });

  it('500 when the update matches zero rows (no user_roles record) — no silent success', async () => {
    mockUpdateSelect.mockResolvedValue({ data: [], error: null });
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(500);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('500 when the update matches multiple rows (unexpected) — no silent success', async () => {
    mockUpdateSelect.mockResolvedValue({ data: [{ user_id: 'u1' }, { user_id: 'u1' }], error: null });
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(500);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('500 when verification finds no row (missing record) — no silent success', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await changePassword(req(VALID));
    expect(res.status).toBe(500);
    expect((await res.json()).redirectUrl).toBeUndefined();
  });

  it('succeeds even if the metadata mirror clear fails (DB flag authoritative)', async () => {
    // Password update (has password) succeeds; metadata clear (user_metadata) fails.
    mockAdminUpdate.mockImplementation(async (_id: string, opts: Record<string, unknown>) =>
      opts.password ? { data: { user: { id: 'u1' } }, error: null } : { error: { message: 'meta write failed' } }
    );
    mockMaybeSingle.mockResolvedValue({ data: { role: 'Admin', must_change_password: false }, error: null });

    const res = await changePassword(req(VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectUrl).toBe('/dashboard');
    expect(mockUpdateSelect).toHaveBeenCalled(); // DB flag cleared
    expect(mockLogAuthEvent).toHaveBeenCalled();
  });
});
