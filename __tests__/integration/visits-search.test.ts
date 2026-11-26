import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const mockFrom = vi.hoisted(() => vi.fn());
const mockAuthenticateApiKey = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockLogApiAccess = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }));

vi.mock('@/lib/server/integration-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/integration-auth')>();
  return { ...actual, authenticateApiKey: mockAuthenticateApiKey };
});

vi.mock('@/lib/server/integration-rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/server/integration-audit', () => ({ logApiAccess: mockLogApiAccess }));

import { GET as getVisits } from '@/app/api/integration/v1/visits/route';

function makeChain(visitorsMatch: Array<{ id: string }>) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  // Bare-await of the visitors lookup resolves to the matched id set.
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: visitorsMatch, error: null, count: visitorsMatch.length });
  return chain;
}

function req(qs: string) {
  return new NextRequest(new URL(`/api/integration/v1/visits${qs}`, BASE_URL), {
    headers: { Authorization: 'Bearer valid_token' },
  });
}

function authOk(scopes: string[]) {
  mockAuthenticateApiKey.mockResolvedValue({
    authorized: true,
    integrationId: 'k1',
    integrationName: 'Test',
    scopes,
    error: null,
    status: 200,
  });
}

describe('GET /api/integration/v1/visits - search & phone filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 99,
      limit: 100,
      resetTime: Date.now() + 60000,
      currentCount: 1,
    });
  });

  it('searches by visitor name via visitors lookup + .in(visitor_id)', async () => {
    authOk(['visits:read']);
    const chain = makeChain([{ id: 'visitor-1' }]);
    mockFrom.mockReturnValue(chain);

    const res = await getVisits(req('?search=John'));
    expect(res.status).toBe(200);

    expect(chain.ilike).toHaveBeenCalledWith('full_name', '%John%');
    expect(chain.in).toHaveBeenCalledWith('visitor_id', ['visitor-1']);
    // No embedded-resource filter is attempted on the visits query.
    expect(chain.ilike).not.toHaveBeenCalledWith('visitor.full_name', expect.anything());
  });

  it('searches by phone with visitor_phone:read scope', async () => {
    authOk(['visits:read', 'visitor_phone:read']);
    const chain = makeChain([{ id: 'visitor-9' }]);
    mockFrom.mockReturnValue(chain);

    const res = await getVisits(req('?phone=08012345678'));
    expect(res.status).toBe(200);

    expect(chain.ilike).toHaveBeenCalledWith('phone', '%08012345678%');
    expect(chain.in).toHaveBeenCalledWith('visitor_id', ['visitor-9']);
  });

  it('rejects phone filter without visitor_phone:read scope (403) and never queries', async () => {
    authOk(['visits:read']);
    const chain = makeChain([{ id: 'visitor-9' }]);
    mockFrom.mockReturnValue(chain);

    const res = await getVisits(req('?phone=08012345678'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('INSUFFICIENT_SCOPE');
    expect(chain.ilike).not.toHaveBeenCalled();
  });

  it('returns an accurate empty page when no visitor matches (range not called)', async () => {
    authOk(['visits:read']);
    const chain = makeChain([]);
    mockFrom.mockReturnValue(chain);

    const res = await getVisits(req('?search=Nobody'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(chain.range).not.toHaveBeenCalled();
  });

  it('combines name search with status/date filters and keeps pagination', async () => {
    authOk(['visits:read']);
    const chain = makeChain([{ id: 'visitor-1' }]);
    mockFrom.mockReturnValue(chain);

    const res = await getVisits(req('?search=John&status=approved&visit_date=2026-01-15&page=2&limit=10'));
    expect(res.status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith('status', 'approved');
    expect(chain.gte).toHaveBeenCalled();
    expect(chain.lte).toHaveBeenCalled();
    expect(chain.in).toHaveBeenCalledWith('visitor_id', ['visitor-1']);
    expect(chain.range).toHaveBeenCalledWith(10, 19);
  });
});