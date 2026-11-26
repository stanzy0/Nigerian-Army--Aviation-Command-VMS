import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

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

import { GET as getVisitors } from '@/app/api/integration/v1/visitors/route';
import { GET as getVisitorById } from '@/app/api/integration/v1/visitors/[id]/route';
import { GET as getVisits } from '@/app/api/integration/v1/visits/route';
import { GET as getDepartments } from '@/app/api/integration/v1/departments/route';

function makeChain() {
  return {
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
}

function req(path: string) {
  return new NextRequest(new URL(path, BASE_URL), {
    headers: { Authorization: 'Bearer valid_token' },
  });
}

const endpoints: Array<{ name: string; path: (qs: string) => string; run: (r: NextRequest) => Promise<Response> }> = [
  { name: 'visitors', path: (qs) => `/api/integration/v1/visitors${qs}`, run: getVisitors },
  { name: 'visits', path: (qs) => `/api/integration/v1/visits${qs}`, run: getVisits },
  { name: 'departments', path: (qs) => `/api/integration/v1/departments${qs}`, run: getDepartments },
  { name: 'visitor detail', path: (qs) => `/api/integration/v1/visitors/${VALID_UUID}${qs}`, run: (r) => getVisitorById(r, { params: Promise.resolve({ id: VALID_UUID }) }) },
];

describe('Integration API pagination validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateApiKey.mockResolvedValue({
      authorized: true,
      integrationId: 'k1',
      integrationName: 'Test',
      scopes: ['visitors:read', 'visits:read', 'departments:read', 'visitor_phone:read'],
      error: null,
      status: 200,
    });
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 99,
      limit: 100,
      resetTime: Date.now() + 60000,
      currentCount: 1,
    });
  });

  for (const ep of endpoints) {
    describe(ep.name, () => {
      it('rejects non-numeric page with 400 and never calls range', async () => {
        const chain = makeChain();
        mockFrom.mockReturnValue(chain);
        const res = await ep.run(req(ep.path('?page=abc')));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('INVALID_PARAMETER');
        expect(chain.range).not.toHaveBeenCalled();
      });

      it('rejects zero page with 400', async () => {
        mockFrom.mockReturnValue(makeChain());
        const res = await ep.run(req(ep.path('?page=0')));
        expect(res.status).toBe(400);
      });

      it('rejects negative page with 400', async () => {
        mockFrom.mockReturnValue(makeChain());
        const res = await ep.run(req(ep.path('?page=-3')));
        expect(res.status).toBe(400);
      });

      it('rejects non-numeric limit with 400', async () => {
        mockFrom.mockReturnValue(makeChain());
        const res = await ep.run(req(ep.path('?limit=xyz')));
        expect(res.status).toBe(400);
      });

      it('rejects zero/negative limit with 400', async () => {
        mockFrom.mockReturnValue(makeChain());
        expect((await ep.run(req(ep.path('?limit=0')))).status).toBe(400);
        expect((await ep.run(req(ep.path('?limit=-5')))).status).toBe(400);
      });

      it('rejects Infinity/NaN-style values with 400', async () => {
        mockFrom.mockReturnValue(makeChain());
        expect((await ep.run(req(ep.path('?limit=Infinity')))).status).toBe(400);
        expect((await ep.run(req(ep.path('?page=NaN')))).status).toBe(400);
      });

      it('accepts omitted params and applies defaults without NaN reaching range', async () => {
        const chain = makeChain();
        mockFrom.mockReturnValue(chain);
        const res = await ep.run(req(ep.path('')));
        if (ep.name !== 'visitor detail') {
          expect(res.status).toBe(200);
          expect(chain.range).toHaveBeenCalledWith(0, 19);
        } else {
          // Single-resource endpoint: valid params must not produce a 400.
          expect(res.status).not.toBe(400);
        }
      });

      it('clamps limit above 100 to 100', async () => {
        const chain = makeChain();
        mockFrom.mockReturnValue(chain);
        const res = await ep.run(req(ep.path('?limit=1000')));
        if (ep.name !== 'visitor detail') {
          expect(res.status).toBe(200);
          expect(chain.range).toHaveBeenCalledWith(0, 99);
        } else {
          expect(res.status).not.toBe(400);
        }
      });
    });
  }
});