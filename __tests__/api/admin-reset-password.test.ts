import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockUpdateUserById = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockGenerate = vi.hoisted(() => vi.fn(() => 'VMS-Abcd3-efgh4-Ijkl5-mnop6'));
const mockLogAuthEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom, auth: { admin: { updateUserById: mockUpdateUserById } } },
}));
vi.mock('@/lib/server/admin', () => ({ generateTemporaryPassword: mockGenerate }));
vi.mock('@/lib/server/auth-audit', () => ({
  logAuthEvent: mockLogAuthEvent,
  getClientInfo: () => ({ ip_address: '1.1.1.1', user_agent: 'test' }),
}));

import { POST as resetPassword } from '@/app/api/admin/users/reset-password/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('/api/admin/users/reset-password', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// user_roles chain: select().eq().maybeSingle() -> target; update().eq() -> {error}
function mockUserRoles(target: { user_id: string; email: string; full_name: string } | null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: target, error: null });
  (chain as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (resolve) =>
    resolve({ error: null });
  mockFrom.mockReturnValue(chain);
  return chain;
}

const admin = { authorized: true, userId: 'admin-1', userEmail: 'admin@army.mil.ng' };
const receptionistTarget = { user_id: 'reception-1', email: 'reception@army.mil.ng', full_name: 'Rec One' };

describe('POST /api/admin/users/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUserById.mockResolvedValue({ error: null });
    mockGenerate.mockReturnValue('VMS-Abcd3-efgh4-Ijkl5-mnop6');
    mockLogAuthEvent.mockResolvedValue(undefined);
  });

  it('Admin resets a Receptionist and generates a temp password (must_change_password)', async () => {
    mockRequireAdmin.mockResolvedValue(admin);
    mockUserRoles(receptionistTarget);

    const res = await resetPassword(makeRequest({ user_id: 'reception-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.temporary_password).toBe('VMS-Abcd3-efgh4-Ijkl5-mnop6');
    expect(json.must_change_password).toBe(true);

    expect(mockUpdateUserById).toHaveBeenCalledWith(
      'reception-1',
      expect.objectContaining({ password: 'VMS-Abcd3-efgh4-Ijkl5-mnop6', user_metadata: { must_change_password: true } })
    );
  });

  it('Admin resets another staff account with a manual password (no temp returned)', async () => {
    mockRequireAdmin.mockResolvedValue(admin);
    mockUserRoles({ user_id: 'staff-2', email: 'staff2@army.mil.ng', full_name: 'Staff Two' });

    const res = await resetPassword(makeRequest({ user_id: 'staff-2', new_password: 'Str0ngPass!' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.temporary_password).toBeUndefined();
    expect(mockUpdateUserById).toHaveBeenCalledWith('staff-2', expect.objectContaining({ password: 'Str0ngPass!' }));
  });

  it('Receptionist is forbidden (403)', async () => {
    mockRequireAdmin.mockResolvedValue({ authorized: false, error: 'Access denied', status: 403 });
    const res = await resetPassword(makeRequest({ user_id: 'reception-1' }));
    expect(res.status).toBe(403);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('Ordinary staff is forbidden (403)', async () => {
    mockRequireAdmin.mockResolvedValue({ authorized: false, error: 'Access denied', status: 403 });
    const res = await resetPassword(makeRequest({ user_id: 'x' }));
    expect(res.status).toBe(403);
  });

  it('Unauthenticated caller is rejected (401)', async () => {
    mockRequireAdmin.mockResolvedValue({ authorized: false, error: 'Unauthorized', status: 401 });
    const res = await resetPassword(makeRequest({ user_id: 'reception-1' }));
    expect(res.status).toBe(401);
  });

  it('Admin cannot reset their own password (403)', async () => {
    mockRequireAdmin.mockResolvedValue(admin);
    const res = await resetPassword(makeRequest({ user_id: 'admin-1' }));
    expect(res.status).toBe(403);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('Invalid target user is handled safely (404)', async () => {
    mockRequireAdmin.mockResolvedValue(admin);
    mockUserRoles(null);
    const res = await resetPassword(makeRequest({ user_id: 'ghost' }));
    expect(res.status).toBe(404);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('Weak manual password is rejected (400)', async () => {
    mockRequireAdmin.mockResolvedValue(admin);
    mockUserRoles(receptionistTarget);
    const res = await resetPassword(makeRequest({ user_id: 'reception-1', new_password: 'weak' }));
    expect(res.status).toBe(400);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('audit identifies admin + target and never contains the password', async () => {
    mockRequireAdmin.mockResolvedValue(admin);
    mockUserRoles(receptionistTarget);

    await resetPassword(makeRequest({ user_id: 'reception-1' }));

    expect(mockLogAuthEvent).toHaveBeenCalledTimes(1);
    const entry = mockLogAuthEvent.mock.calls[0][0];
    expect(entry.action).toBe('password_reset_by_admin');
    expect(entry.metadata).toMatchObject({ admin_id: 'admin-1', target_id: 'reception-1', target_email: 'reception@army.mil.ng' });
    // Password must not appear anywhere in the audit entry.
    expect(JSON.stringify(entry)).not.toContain('VMS-Abcd3-efgh4-Ijkl5-mnop6');
  });
});