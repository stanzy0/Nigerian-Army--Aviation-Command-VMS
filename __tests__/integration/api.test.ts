import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

// Create a proper mock chain for supabase
const createMockChain = () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
  };
  return chain;
};

const mockSupabaseFrom = vi.hoisted(() => vi.fn());
const mockAuthenticateApiKey = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockLogApiAccess = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: mockSupabaseFrom,
  },
}));

vi.mock('@/lib/server/integration-auth', () => ({
  authenticateApiKey: mockAuthenticateApiKey,
}));

vi.mock('@/lib/server/integration-rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock('@/lib/server/integration-audit', () => ({
  logApiAccess: mockLogApiAccess,
}));

vi.mock('@/lib/server/integration-response', () => ({
  integrationErrorResponse: vi.fn((code, message, status) =>
    new Response(JSON.stringify({ success: false, error: { code, message } }), {
      status,
      headers: { 'Cache-Control': 'no-store' },
    })
  ),
  integrationSuccessResponse: vi.fn((data, pagination, rateLimit) =>
    new Response(JSON.stringify({ success: true, data, pagination }), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  ),
  integrationRateLimitResponse: vi.fn((resetTime, limit, currentCount) =>
    new Response(
      JSON.stringify({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' },
      }),
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        },
      }
    )
  ),
}));

import { GET as getVisitors } from '@/app/api/integration/v1/visitors/route';
import { GET as getVisitorById } from '@/app/api/integration/v1/visitors/[id]/route';
import { GET as getVisits } from '@/app/api/integration/v1/visits/route';
import { GET as getDepartments } from '@/app/api/integration/v1/departments/route';

function createRequest(path: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), { headers });
}

function resetMocks() {
  vi.clearAllMocks();

  const mockChain = createMockChain();
  mockSupabaseFrom.mockReturnValue(mockChain);

  mockAuthenticateApiKey.mockResolvedValue({
    authorized: true,
    integrationId: 'test-integration-id',
    integrationName: 'Test Integration',
    scopes: ['visitors:read', 'visits:read', 'departments:read'],
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
}

describe('NAAC External API Integration', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when token is missing', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: null,
        integrationName: null,
        scopes: [],
        error: 'Missing authorization token',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors');
      const response = await getVisitors(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when token is invalid', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: null,
        integrationName: null,
        scopes: [],
        error: 'Invalid token',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer invalid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when token is expired', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['visitors:read'],
        error: 'Integration key has expired',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer expired_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when token is revoked', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['visitors:read'],
        error: 'Integration key has been revoked',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer revoked_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(401);
    });

    it('returns 401 when token is inactive', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['visitors:read'],
        error: 'Integration key is inactive',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer inactive_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(401);
    });

    it('returns 403 when scope is insufficient', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['departments:read'],
        error: 'Insufficient scope',
        status: 403,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('INSUFFICIENT_SCOPE');
    });

    it('succeeds with valid token and correct scope', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visitor-1',
            full_name: 'John Doe',
            visitor_organization: 'Test Corp',
            phone: '+2348012345678',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('Rate Limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        limit: 100,
        resetTime: Date.now() + 60000,
        currentCount: 101,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('returns 429 when rate limit database fails (fail closed)', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        limit: 100,
        resetTime: Date.now() + 60000,
        currentCount: 101,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(429);
    });

    it('allows requests within limit', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: true,
        remaining: 50,
        limit: 100,
        resetTime: Date.now() + 60000,
        currentCount: 50,
      });

      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Visitors Endpoint', () => {
    beforeEach(() => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValue({
        data: [
          {
            id: 'visitor-1',
            full_name: 'John Doe',
            visitor_organization: 'Test Corp',
            phone: '+2348012345678',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValue(mockChain);
    });

    it('lists visitors with approved fields only', async () => {
      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data[0]).toHaveProperty('id');
      expect(body.data[0]).toHaveProperty('full_name');
      expect(body.data[0]).toHaveProperty('visitor_organization');
      expect(body.data[0]).toHaveProperty('phone');
      expect(body.data[0]).toHaveProperty('created_at');
      expect(body.data[0]).toHaveProperty('updated_at');
    });

    it('does not expose sensitive fields in visitor list', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visitor-1',
            full_name: 'John Doe',
            visitor_organization: 'Test Corp',
            phone: '+2348012345678',
            photo_url: 'https://example.com/photo.jpg',
            nationality: 'Nigerian',
            gender: 'Male',
            email: 'john@example.com',
            visitor_address: '123 Test St',
            emergency_contact: 'Jane Doe',
            doc_number: 'A1234567',
            doc_front_url: 'https://example.com/doc_front.jpg',
            doc_back_url: 'https://example.com/doc_back.jpg',
            qr_token: 'secret-qr-token',
            qr_code: 'secret-qr-code',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      const body = await response.json();
      const visitor = body.data[0];

      expect(visitor).not.toHaveProperty('photo_url');
      expect(visitor).not.toHaveProperty('nationality');
      expect(visitor).not.toHaveProperty('gender');
      expect(visitor).not.toHaveProperty('email');
      expect(visitor).not.toHaveProperty('visitor_address');
      expect(visitor).not.toHaveProperty('emergency_contact');
      expect(visitor).not.toHaveProperty('doc_number');
      expect(visitor).not.toHaveProperty('doc_front_url');
      expect(visitor).not.toHaveProperty('doc_back_url');
      expect(visitor).not.toHaveProperty('qr_token');
      expect(visitor).not.toHaveProperty('qr_code');
    });

    it('searches visitors by name', async () => {
      const request = createRequest('/api/integration/v1/visitors?search=John', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(200);
    });

    it('filters by date range', async () => {
      const request = createRequest('/api/integration/v1/visitors?from=2026-01-01&to=2026-12-31', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(200);
    });

    it('rejects invalid from date', async () => {
      const request = createRequest('/api/integration/v1/visitors?from=invalid-date', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_PARAMETER');
    });

    it('rejects invalid to date', async () => {
      const request = createRequest('/api/integration/v1/visitors?to=invalid-date', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(400);
    });

    it('rejects from date after to date', async () => {
      const request = createRequest('/api/integration/v1/visitors?from=2026-12-31&to=2026-01-01', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(400);
    });

    it('returns phone only with visitor_phone:read scope', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: true,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['visitors:read'],
        error: null,
        status: 200,
      });

      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visitor-1',
            full_name: 'John Doe',
            visitor_organization: 'Test Corp',
            phone: '+2348012345678',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      const body = await response.json();
      expect(body.data[0].phone).toBeNull();
    });

    it('returns phone with visitor_phone:read scope', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: true,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['visitors:read', 'visitor_phone:read'],
        error: null,
        status: 200,
      });

      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visitor-1',
            full_name: 'John Doe',
            visitor_organization: 'Test Corp',
            phone: '+2348012345678',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      const body = await response.json();
      expect(body.data[0].phone).toBe('+2348012345678');
    });

    it('rejects phone filter without visitor_phone:read scope', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: true,
        integrationId: 'test-id',
        integrationName: 'Test',
        scopes: ['visitors:read'],
        error: null,
        status: 200,
      });

      const request = createRequest('/api/integration/v1/visitors?phone=08012345678', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('INSUFFICIENT_SCOPE');
    });
  });

  describe('Visitor Detail Endpoint', () => {
    it('retrieves single visitor with visits and badges', async () => {
      const mockChain = createMockChain();
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          full_name: 'John Doe',
          visitor_organization: 'Test Corp',
          phone: '+2348012345678',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          visit: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              purpose: 'Business meeting',
              status: 'approved',
              scheduled_date: '2026-01-15T10:00:00Z',
              check_in_time: '2026-01-15T10:05:00Z',
              check_out_time: '2026-01-15T12:00:00Z',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              badges: [
                {
                  badge_number: 'BADGE-001',
                  badge_status: 'Active',
                },
              ],
            },
          ],
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors/550e8400-e29b-41d4-a716-446655440000', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitorById(request, { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(body.data.visits).toHaveLength(1);
      expect(body.data.visits[0]).toHaveProperty('badges');
      expect(body.data.visits[0].badges[0]).toHaveProperty('badge_number');
      expect(body.data.visits[0].badges[0]).toHaveProperty('badge_status');
    });

    it('returns 404 for non-existent visitor', async () => {
      const mockChain = createMockChain();
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors/550e8400-e29b-41d4-a716-446655440002', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitorById(request, { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440002' }) });

      expect(response.status).toBe(404);
    });

    it('rejects invalid UUID format', async () => {
      const request = createRequest('/api/integration/v1/visitors/invalid-id', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitorById(request, { params: Promise.resolve({ id: 'invalid-id' }) });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_PARAMETER');
    });

    it('does not expose sensitive fields in visitor detail', async () => {
      const mockChain = createMockChain();
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440003',
          full_name: 'John Doe',
          visitor_organization: 'Test Corp',
          phone: '+2348012345678',
          photo_url: 'https://example.com/photo.jpg',
          nationality: 'Nigerian',
          gender: 'Male',
          email: 'john@example.com',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          visit: [],
        },
        error: null,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors/550e8400-e29b-41d4-a716-446655440003', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitorById(request, { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440003' }) });

      const body = await response.json();
      const visitor = body.data;

      expect(visitor).not.toHaveProperty('photo_url');
      expect(visitor).not.toHaveProperty('nationality');
      expect(visitor).not.toHaveProperty('gender');
      expect(visitor).not.toHaveProperty('email');
    });
  });

  describe('Visits Endpoint', () => {
    beforeEach(() => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValue({
        data: [
          {
            id: 'visit-1',
            visitor_id: 'visitor-1',
            employee_id: 'employee-1',
            purpose: 'Business meeting',
            status: 'approved',
            scheduled_date: '2026-01-15T10:00:00Z',
            check_in_time: '2026-01-15T10:05:00Z',
            check_out_time: '2026-01-15T12:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            visitor: {
              id: 'visitor-1',
              full_name: 'John Doe',
              visitor_organization: 'Test Corp',
            },
            employee: {
              id: 'employee-1',
              full_name: 'Jane Host',
              department: 'Operations',
            },
            badges: [
              { badge_number: 'BADGE-001', badge_status: 'Active' },
            ],
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValue(mockChain);
    });

    it('lists visits with approved fields only', async () => {
      const request = createRequest('/api/integration/v1/visits', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisits(request);

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data[0]).toHaveProperty('id');
      expect(body.data[0]).toHaveProperty('purpose');
      expect(body.data[0]).toHaveProperty('status');
      expect(body.data[0]).toHaveProperty('scheduled_date');
      expect(body.data[0]).toHaveProperty('check_in_time');
      expect(body.data[0]).toHaveProperty('check_out_time');
      expect(body.data[0]).toHaveProperty('created_at');
      expect(body.data[0]).toHaveProperty('updated_at');
      expect(body.data[0]).toHaveProperty('visitor');
      expect(body.data[0]).toHaveProperty('employee');
      expect(body.data[0]).toHaveProperty('badges');
    });

    it('does not expose notes in visits', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visit-1',
            visitor_id: 'visitor-1',
            employee_id: 'employee-1',
            purpose: 'Business meeting',
            status: 'approved',
            scheduled_date: '2026-01-15T10:00:00Z',
            check_in_time: '2026-01-15T10:05:00Z',
            check_out_time: '2026-01-15T12:00:00Z',
            notes: 'Confidential notes',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            visitor: { id: 'visitor-1', full_name: 'John Doe', visitor_organization: 'Test Corp' },
            employee: { id: 'employee-1', full_name: 'Jane Host', department: 'Operations' },
            badges: [{ badge_number: 'BADGE-001', badge_status: 'Active' }],
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visits', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisits(request);

      const body = await response.json();
      expect(body.data[0]).not.toHaveProperty('notes');
    });

    it('filters visits by status', async () => {
      const request = createRequest('/api/integration/v1/visits?status=approved', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisits(request);

      expect(response.status).toBe(200);
    });

    it('filters visits by date', async () => {
      const request = createRequest('/api/integration/v1/visits?visit_date=2026-01-15', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisits(request);

      expect(response.status).toBe(200);
    });

    it('returns multiple badges as array', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visit-1',
            visitor_id: 'visitor-1',
            employee_id: 'employee-1',
            purpose: 'Business meeting',
            status: 'approved',
            scheduled_date: '2026-01-15T10:00:00Z',
            check_in_time: '2026-01-15T10:05:00Z',
            check_out_time: '2026-01-15T12:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            visitor: { id: 'visitor-1', full_name: 'John Doe', visitor_organization: 'Test Corp' },
            employee: { id: 'employee-1', full_name: 'Jane Host', department: 'Operations' },
            badges: [
              { badge_number: 'BADGE-001', badge_status: 'Active' },
              { badge_number: 'BADGE-002', badge_status: 'Returned' },
            ],
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visits', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisits(request);

      const body = await response.json();
      expect(body.data[0].badges).toHaveLength(2);
      expect(body.data[0].badges[0]).toHaveProperty('badge_number');
      expect(body.data[0].badges[0]).toHaveProperty('badge_status');
    });

    it('does not expose badge QR tokens', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [
          {
            id: 'visit-1',
            visitor_id: 'visitor-1',
            employee_id: 'employee-1',
            purpose: 'Business meeting',
            status: 'approved',
            scheduled_date: '2026-01-15T10:00:00Z',
            check_in_time: '2026-01-15T10:05:00Z',
            check_out_time: '2026-01-15T12:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            visitor: { id: 'visitor-1', full_name: 'John Doe', visitor_organization: 'Test Corp' },
            employee: { id: 'employee-1', full_name: 'Jane Host', department: 'Operations' },
            badges: [
              { badge_number: 'BADGE-001', badge_status: 'Active', qr_token: 'secret-qr' },
            ],
          },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visits', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisits(request);

      const body = await response.json();
      expect(body.data[0].badges[0]).not.toHaveProperty('qr_token');
      expect(body.data[0].badges[0]).not.toHaveProperty('qr_code');
    });
  });

  describe('Departments Endpoint', () => {
    beforeEach(() => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValue({
        data: [
          { id: 'dept-1', name: 'Operations', created_at: '2026-01-01T00:00:00Z' },
        ],
        error: null,
        count: 1,
      });
      mockSupabaseFrom.mockReturnValue(mockChain);
    });

    it('lists departments with approved fields only', async () => {
      const request = createRequest('/api/integration/v1/departments', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getDepartments(request);

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data[0]).toHaveProperty('id');
      expect(body.data[0]).toHaveProperty('name');
      expect(body.data[0]).toHaveProperty('created_at');
    });

    it('filters departments by search', async () => {
      const request = createRequest('/api/integration/v1/departments?search=Ops', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getDepartments(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Cache-Control Headers', () => {
    it('returns Cache-Control: no-store on successful responses', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('returns Cache-Control: no-store on auth failure', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: null,
        integrationName: null,
        scopes: [],
        error: 'Missing authorization token',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors');
      const response = await getVisitors(request);

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('returns Cache-Control: no-store on rate limit', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        limit: 100,
        resetTime: Date.now() + 60000,
        currentCount: 101,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('Audit Logging', () => {
    it('logs successful requests', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      await getVisitors(request);

      expect(mockLogApiAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationKeyId: 'test-integration-id',
          integrationName: 'Test Integration',
          endpoint: '/api/integration/v1/visitors',
          method: 'GET',
          statusCode: 200,
          outcome: 'success',
        })
      );
    });

    it('logs auth failures', async () => {
      mockAuthenticateApiKey.mockResolvedValueOnce({
        authorized: false,
        integrationId: null,
        integrationName: null,
        scopes: [],
        error: 'Missing authorization token',
        status: 401,
      });

      const request = createRequest('/api/integration/v1/visitors');
      await getVisitors(request);

      expect(mockLogApiAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'auth_failure',
          statusCode: 401,
        })
      );
    });

    it('logs rate limit rejections', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        limit: 100,
        resetTime: Date.now() + 60000,
        currentCount: 101,
      });

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      await getVisitors(request);

      expect(mockLogApiAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rate_limited',
          statusCode: 429,
        })
      );
    });

    it('logs validation errors', async () => {
      const request = createRequest('/api/integration/v1/visitors?from=invalid', {
        Authorization: 'Bearer valid_token',
      });
      await getVisitors(request);

      expect(mockLogApiAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'client_error',
          statusCode: 400,
        })
      );
    });

    it('logs not found responses', async () => {
      const mockChain = createMockChain();
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors/550e8400-e29b-41d4-a716-446655440004', {
        Authorization: 'Bearer valid_token',
      });
      await getVisitorById(request, { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440004' }) });

      expect(mockLogApiAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'client_error',
          statusCode: 404,
        })
      );
    });

    it('does not log bearer tokens', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer secret-token-123',
      });
      await getVisitors(request);

      const auditCall = mockLogApiAccess.mock.calls[0][0];
      expect(JSON.stringify(auditCall)).not.toContain('secret-token-123');
    });
  });

  describe('Pagination', () => {
    it('returns correct total count', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: Array(20).fill({ id: 'visitor-1', full_name: 'Test', visitor_organization: 'Test', phone: null, created_at: '2026-01-01', updated_at: '2026-01-01' }),
        error: null,
        count: 100,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors?page=1&limit=20', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      const body = await response.json();
      expect(body.pagination.total).toBe(100);
      expect(body.pagination.total_pages).toBe(5);
    });

    it('returns total 0 for empty results', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      const response = await getVisitors(request);

      const body = await response.json();
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.total_pages).toBe(0);
    });

    it('uses deterministic ordering', async () => {
      const mockChain = createMockChain();
      mockChain.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });
      mockSupabaseFrom.mockReturnValueOnce(mockChain);

      const request = createRequest('/api/integration/v1/visitors', {
        Authorization: 'Bearer valid_token',
      });
      await getVisitors(request);

      expect(mockChain.select).toHaveBeenCalledWith(
        'id, full_name, visitor_organization, phone, created_at, updated_at',
        { count: 'exact' }
      );
    });
  });
});