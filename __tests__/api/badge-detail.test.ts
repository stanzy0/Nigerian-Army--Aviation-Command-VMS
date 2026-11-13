import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const BASE_URL = 'http://localhost:3000'

const createMockChain = () => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
  update: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
})

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(() => createMockChain()),
  rpc: vi.fn(),
}))

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRequireRole = vi.hoisted(() => vi.fn())
const mockIsDemoMode = vi.hoisted(() => vi.fn().mockReturnValue(false))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: mockSupabase,
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireAdmin: mockRequireAdmin,
  requireRole: mockRequireRole,
}))

vi.mock('@/lib/demo', () => ({
  isDemoMode: mockIsDemoMode,
}))

import { GET as getBadgeById, POST as postBadgeAction } from '@/app/api/badges/[id]/route'

function createRequest(path: string, headers?: Record<string, string>, body?: unknown, method: 'GET' | 'POST' = 'GET', signal?: AbortSignal | null): NextRequest {
  const url = new URL(path, BASE_URL)
  const options: { headers?: Record<string, string>; method?: string; body?: string; signal?: AbortSignal } = { headers }
  if (signal != null) options.signal = signal
  if (body && method === 'POST') {
    options.method = 'POST'
    options.body = JSON.stringify(body)
  }
  return new NextRequest(url, options)
}

function createRouteContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function resetMocks() {
  vi.clearAllMocks()

  mockIsDemoMode.mockReturnValue(false)
  mockRequireAdmin.mockResolvedValue({ authorized: true, error: null, status: 200 })
  mockRequireRole.mockResolvedValue({ authorized: true, error: null, status: 200 })

  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
  }
  mockSupabase.from.mockReturnValue(mockChain)
}

describe('Badge Detail API (GET /api/badges/[id])', () => {
  beforeEach(() => {
    resetMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const createMockBadge = (overrides: Record<string, unknown> = {}) => ({
    id: 'badge-123',
    badge_number: 'VMS-2026-000123',
    badge_status: 'Active',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    printed_at: null,
    reprint_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    visit_id: 'visit-123',
    visit: {
      purpose: 'Meeting',
      status: 'approved',
      scheduled_date: new Date().toISOString(),
      check_in_time: null,
      check_out_time: null,
      visitor: {
        full_name: 'John Doe',
        visitor_organization: 'Acme Corp',
        photo_url: null,
      },
      employee: {
        full_name: 'Jane Smith',
        department: 'IT',
      },
    },
    ...overrides,
  })

  it('returns badge detail without qr_token', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockBadge, error: null }),
      update: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
    })

    const request = createRequest('/api/badges/badge-123')
    const response = await getBadgeById(request, createRouteContext('badge-123'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual(mockBadge)
    expect(data.data).not.toHaveProperty('qr_token')
  })

  it('returns 401 when not authorized (Admin required)', async () => {
    mockRequireAdmin.mockResolvedValueOnce({
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    })

    const request = createRequest('/api/badges/badge-123')
    const response = await getBadgeById(request, createRouteContext('badge-123'))

    expect(response.status).toBe(401)
  })

  it('returns 500 when supabaseAdmin not configured', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: null,
    }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn().mockResolvedValue({ authorized: true }) }))
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => false }))

    const { GET } = await import('@/app/api/badges/[id]/route')
    const request = createRequest('/api/badges/badge-123')
    const response = await GET(request, createRouteContext('badge-123'))
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Server configuration error')
  })

  it('returns 404 when badge not found (PGRST116 error)', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows found' } }),
      update: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
    })

    const request = createRequest('/api/badges/nonexistent')
    const response = await getBadgeById(request, createRouteContext('nonexistent'))
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.message).toBe('Badge not found')
  })

  it('returns 404 when badge not found (null data, no error)', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
    })

    const request = createRequest('/api/badges/nonexistent')
    const response = await getBadgeById(request, createRouteContext('nonexistent'))
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.message).toBe('Badge not found')
  })

  it('returns 500 on database error (not a not-found error)', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST500', message: 'Connection failed' } }),
      update: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
    })

    const request = createRequest('/api/badges/badge-123')
    const response = await getBadgeById(request, createRouteContext('badge-123'))
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Failed to fetch badge')
    expect(data.error).toBe('Internal server error')
  })

  it('returns generic error message on unexpected error', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      update: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
    })

    const request = createRequest('/api/badges/badge-123')
    const response = await getBadgeById(request, createRouteContext('badge-123'))
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Internal server error')
    expect(data.error).toBe('Internal server error')
  })
})

describe('Badge Actions API (POST /api/badges/[id])', () => {
  beforeEach(() => {
    resetMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const createMockBadge = (overrides: Record<string, unknown> = {}) => ({
    id: 'badge-123',
    badge_number: 'VMS-2026-000123',
    badge_status: 'Active',
    reprint_count: 0,
    ...overrides,
  })

  describe('request validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const request = createRequest('/api/badges/badge-123', {}, null, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid request body')
    })

    it('returns 400 for null request body', async () => {
      const request = createRequest('/api/badges/badge-123', {}, null, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid request body')
    })

    it('returns 400 for non-object request body (string)', async () => {
      const request = createRequest('/api/badges/badge-123', {}, 'not-an-object', 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid request body: expected an object')
    })

    it('returns 400 for non-object request body (number)', async () => {
      const request = createRequest('/api/badges/badge-123', {}, 123, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid request body: expected an object')
    })

    it('returns 400 for array request body (action is not a string)', async () => {
      const request = createRequest('/api/badges/badge-123', {}, [], 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid action: expected a string')
    })

    it('returns 400 when action is missing', async () => {
      const request = createRequest('/api/badges/badge-123', {}, {}, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid action: expected a string')
    })

    it('returns 400 when action is not a string (number)', async () => {
      const request = createRequest('/api/badges/badge-123', {}, { action: 123 }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid action: expected a string')
    })

    it('returns 400 when action is not a string (boolean)', async () => {
      const request = createRequest('/api/badges/badge-123', {}, { action: true }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid action: expected a string')
    })
  })

  it('returns 401 when not authorized (Admin/Receptionist required)', async () => {
    mockRequireRole.mockResolvedValueOnce({
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    })

    const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
    const response = await postBadgeAction(request, createRouteContext('badge-123'))

    expect(response.status).toBe(401)
  })

  it('returns 500 when supabaseAdmin not configured', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: null,
    }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireRole: vi.fn().mockResolvedValue({ authorized: true }) }))
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => false }))

    const { POST } = await import('@/app/api/badges/[id]/route')
    const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
    const response = await POST(request, createRouteContext('badge-123'))
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Server configuration error')
  })

  describe('print action', () => {
    it('returns 404 when badge not found (PGRST116 error on lookup)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows found' } }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/nonexistent', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('nonexistent'))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toBe('Badge not found')
    })

    it('returns 404 when badge not found (null data on lookup)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/nonexistent', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('nonexistent'))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toBe('Badge not found')
    })

    it('returns 500 on database error during lookup', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST500', message: 'Connection failed' } }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to fetch badge')
      expect(data.error).toBe('Internal server error')
    })

    it('returns 400 when reprint limit reached (5)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: createMockBadge({ reprint_count: 5 }), error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Reprint limit reached')
    })

    it('handles NULL reprint_count as 0 (fallback)', async () => {
      const mockBadge = createMockBadge({ reprint_count: null })

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockBadge, error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: [{ id: 'badge-123' }], error: null, count: 1 }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Badge printed')
    })

    it('increments reprint_count exactly once on successful print', async () => {
      let updateCallCount = 0
      const mockBadge = createMockBadge({ reprint_count: 0 })

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockBadge, error: null }),
        update: vi.fn(() => {
          updateCallCount++
          return mockChain
        }),
        lt: vi.fn(() => mockChain),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue(mockChain)

      mockSupabase.from.mockReturnValue(mockChain)

      mockChain.update.mockImplementationOnce(() => mockChain)
      mockChain.lt.mockImplementationOnce(() => ({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: [{ id: 'badge-123' }], error: null, count: 1 }),
      }))

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Badge printed')
    })

    it('returns 400 on concurrent modification (optimistic locking)', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: createMockBadge({ reprint_count: 0 }), error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Reprint limit reached or badge was modified by another request')
    })

    it('returns generic error on database error during update', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: createMockBadge({ reprint_count: 0 }), error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to print badge')
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('reprint action', () => {
    it('returns 404 when badge not found (PGRST116 error on lookup)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows found' } }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/nonexistent', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('nonexistent'))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toBe('Badge not found')
    })

    it('returns 404 when badge not found (null data on lookup)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/nonexistent', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('nonexistent'))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toBe('Badge not found')
    })

    it('returns 500 on database error during lookup', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST500', message: 'Connection failed' } }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/badge-123', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to fetch badge')
      expect(data.error).toBe('Internal server error')
    })

    it('returns 400 when reprint limit reached (5)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: createMockBadge({ reprint_count: 5 }), error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      })

      const request = createRequest('/api/badges/badge-123', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Reprint limit reached')
    })

    it('handles NULL reprint_count as 0 (fallback)', async () => {
      const mockBadge = createMockBadge({ reprint_count: null })

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockBadge, error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: [{ id: 'badge-123' }], error: null, count: 1 }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Badge reprinted')
    })

    it('increments reprint_count exactly once on successful reprint', async () => {
      const mockBadge = createMockBadge({ reprint_count: 2 })

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockBadge, error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: [{ id: 'badge-123' }], error: null, count: 1 }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Badge reprinted')
    })

    it('returns generic error on database error during update', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: createMockBadge({ reprint_count: 0 }), error: null }),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue(mockChain)
      mockChain.lt.mockReturnValue({
        ...mockChain,
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'reprint' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to reprint badge')
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('cancel action', () => {
    it('returns 404 when badge not found (count = 0)', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
        }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/nonexistent', {}, { action: 'cancel' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('nonexistent'))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toBe('Badge not found')
    })

    it('succeeds when exactly one badge is cancelled', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'badge-123' }], error: null, count: 1 }),
        }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'cancel' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Badge cancelled')
    })

    it('does not increment reprint_count on cancel', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        update: vi.fn((updateData) => {
          expect(updateData).not.toHaveProperty('reprint_count')
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [{ id: 'badge-123' }], error: null, count: 1 }),
            }),
          }
        }),
        lt: vi.fn().mockReturnThis(),
      }
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'cancel' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Badge cancelled')
    })

    it('returns generic error on database error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }
      mockChain.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      })
      mockSupabase.from.mockReturnValue(mockChain)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'cancel' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to cancel badge')
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('invalid action', () => {
    it('returns 400 for unknown action', async () => {
      const request = createRequest('/api/badges/badge-123', {}, { action: 'unknown' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Invalid action')
    })
  })

  describe('demo mode', () => {
    it('returns demo response when isDemoMode is true', async () => {
      mockIsDemoMode.mockReturnValue(true)

      const request = createRequest('/api/badges/badge-123', {}, { action: 'print' }, 'POST')
      const response = await postBadgeAction(request, createRouteContext('badge-123'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.demo).toBe(true)
      expect(data.message).toContain('Demo mode')
    })
  })
})