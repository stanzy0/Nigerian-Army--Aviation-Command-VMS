import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const mockGetCurrentUser = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockIsDemoMode = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/demo', () => ({
  isDemoMode: mockIsDemoMode,
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

import { GET as getAudit } from '@/app/api/audit/route';

function createRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE_URL));
}

// Query builder that records the filters applied and resolves a page of rows.
function createQueryChain(result: { data: unknown[]; count: number }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return chain;
  };
  ['select', 'order', 'in', 'eq', 'or', 'gte', 'lte'].forEach((m) => {
    chain[m] = record(m);
  });
  chain.range = vi.fn().mockResolvedValue({ data: result.data, error: null, count: result.count });
  return { chain, calls };
}

describe('GET /api/audit authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDemoMode.mockReturnValue(false);
  });

  it('allows Admin to read the complete history without a self-scope filter', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
    const { chain, calls } = createQueryChain({ data: [{ id: 'a1' }], count: 1 });
    mockFrom.mockReturnValue(chain);

    const res = await getAudit(createRequest('/api/audit?userId=receptionist-9'));
    expect(res.status).toBe(200);

    // Admin self-scope must NOT be forced.
    const selfScope = calls.find((c) => c.method === 'eq' && c.args[0] === 'entity_id' && c.args[1] === 'admin-1');
    expect(selfScope).toBeUndefined();
    // Admin may filter by an arbitrary userId.
    const userFilter = calls.find((c) => c.method === 'eq' && c.args[0] === 'entity_id' && c.args[1] === 'receptionist-9');
    expect(userFilter).toBeDefined();
  });

  it('scopes Receptionist to their own id and auth events only', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'receptionist-1', role: 'Receptionist' });
    const { chain, calls } = createQueryChain({ data: [], count: 0 });
    mockFrom.mockReturnValue(chain);

    const res = await getAudit(createRequest('/api/audit'));
    expect(res.status).toBe(200);

    const selfScope = calls.find((c) => c.method === 'eq' && c.args[0] === 'entity_id' && c.args[1] === 'receptionist-1');
    expect(selfScope).toBeDefined();
    const actionScope = calls.find((c) => c.method === 'in' && c.args[0] === 'action');
    expect(actionScope).toBeDefined();
  });

  it('rejects Receptionist supplying another user id (403)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'receptionist-1', role: 'Receptionist' });
    const { chain } = createQueryChain({ data: [], count: 0 });
    mockFrom.mockReturnValue(chain);

    const res = await getAudit(createRequest('/api/audit?userId=admin-1'));
    expect(res.status).toBe(403);
  });

  it('rejects Receptionist requesting a non-auth event type (401)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'receptionist-1', role: 'Receptionist' });
    const { chain } = createQueryChain({ data: [], count: 0 });
    mockFrom.mockReturnValue(chain);

    const res = await getAudit(createRequest('/api/audit?eventType=visitor_created'));
    expect(res.status).toBe(401);
  });

  it('rejects a role without audit permission (401)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'host-1', role: 'Host Employee' });
    const { chain } = createQueryChain({ data: [], count: 0 });
    mockFrom.mockReturnValue(chain);

    const res = await getAudit(createRequest('/api/audit'));
    expect(res.status).toBe(401);
  });
});