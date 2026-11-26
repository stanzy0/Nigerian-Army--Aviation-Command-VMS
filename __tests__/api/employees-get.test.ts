import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUser = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ getCurrentUser: mockGetCurrentUser, PERMISSIONS: { Admin: ['employees'] } }));
vi.mock('@/lib/demo', () => ({ isDemoMode: () => false }));
vi.mock('@/lib/demo/mockData', () => ({ getEmployees: () => [] }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }));

import { GET as getEmployees } from '@/app/api/employees/route';

function chain(result: { data: unknown[]; error: unknown }) {
  const c: Record<string, unknown> = {};
  c.select = mockSelect.mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c);
  c.or = vi.fn().mockReturnValue(c);
  (c as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (resolve) => resolve(result);
  return c;
}

describe('GET /api/employees field selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'a1', role: 'Admin' });
  });

  it('selects email, phone, date_of_birth and photo_url for the edit form', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));

    const res = await getEmployees(new NextRequest(new URL('/api/employees', 'http://localhost:3000')));
    expect(res.status).toBe(200);

    const selectArg = String(mockSelect.mock.calls[0][0]);
    expect(selectArg).toContain('email');
    expect(selectArg).toContain('phone');
    expect(selectArg).toContain('date_of_birth');
    expect(selectArg).toContain('photo_url');
  });
});