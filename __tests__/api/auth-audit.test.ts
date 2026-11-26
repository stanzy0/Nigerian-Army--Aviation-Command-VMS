import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

import { logAuthEvent } from '@/lib/server/auth-audit';

describe('logAuthEvent (JSONB details)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it('stores details as a JSON object with message and role', async () => {
    await logAuthEvent({
      action: 'login_success',
      entity_type: 'auth',
      entity_id: 'user-1',
      performed_by: 'jane',
      details: 'Successful login for jane',
      role: 'Admin',
      ip_address: '1.2.3.4',
      user_agent: 'jest',
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(typeof row.details).toBe('object');
    expect(row.details).toMatchObject({ message: 'Successful login for jane', role: 'Admin' });
    expect(row.user_agent).toBe('jest');
  });

  it('omits role when not provided and still writes an object', async () => {
    await logAuthEvent({
      action: 'logout',
      entity_type: 'auth',
      entity_id: 'user-1',
      performed_by: 'jane',
      details: 'User logged out',
    });

    const row = mockInsert.mock.calls[0][0];
    expect(typeof row.details).toBe('object');
    expect(row.details).toEqual({ message: 'User logged out' });
  });

  it('does not throw when the insert fails (auth must proceed)', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'column user_agent does not exist' } });
    await expect(
      logAuthEvent({
        action: 'login_failed_invalid_credentials',
        entity_type: 'auth',
        entity_id: null,
        performed_by: 'x',
        details: 'nope',
      })
    ).resolves.toBeUndefined();
  });
});