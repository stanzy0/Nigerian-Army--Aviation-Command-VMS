import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const BASE_URL = 'http://localhost:3000'

const mockSupabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockIsDemoMode = vi.hoisted(() => vi.fn().mockReturnValue(false))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: mockSupabase,
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@/lib/demo', () => ({
  isDemoMode: mockIsDemoMode,
}))

import { GET as getBadges } from '@/app/api/badges/route'

function createRequest(path: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), { headers })
}

function resetMocks() {
  vi.clearAllMocks()

  mockSupabase.rpc.mockReset()
  mockSupabase.from.mockReset()

  mockIsDemoMode.mockReturnValue(false)
  mockRequireAdmin.mockResolvedValue({ authorized: true, error: null, status: 200 })
}

describe('Badge API Search (RPC)', () => {
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
      id: 'visit-123',
      purpose: 'Meeting',
      status: 'approved',
      scheduled_date: new Date().toISOString(),
      check_in_time: null,
      check_out_time: null,
      created_at: new Date().toISOString(),
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

  const createMockRpcResponse = (badges: unknown[], total: number) => ({
    data: badges,
    total,
  })

  it('returns badges without qr_token in response', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toHaveLength(1)
    expect(data.data[0]).not.toHaveProperty('qr_token')
    expect(data.total).toBe(1)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('searches by badge_number', async () => {
    const mockBadge = createMockBadge({ badge_number: 'VMS-2026-000123' })
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=VMS-2026-000123')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'VMS-2026-000123',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('searches by qr_token (server-side only)', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=qr-token-123')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'qr-token-123',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('searches by visitor full_name', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=John%20Doe')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'John Doe',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('searches by visitor organization', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=Acme%20Corp')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'Acme Corp',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('searches by host employee full_name', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=Jane%20Smith')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'Jane Smith',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('filters by status', async () => {
    const mockBadge = createMockBadge({ badge_status: 'Active' })
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=Active')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: 'Active',
      p_page: 1,
      p_limit: 20,
    })
  })

  it('normalizes empty status to null', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('normalizes whitespace-only status to null', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=%20%20%20')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('normalizes status "all" (lowercase) to null', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=all')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('normalizes status "ALL" (uppercase) to null', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=ALL')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('normalizes status "All" (mixed case) to null', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=All')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('passes valid status value unchanged to RPC', async () => {
    const mockBadge = createMockBadge({ badge_status: 'Cancelled' })
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?status=Cancelled')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: 'Cancelled',
      p_page: 1,
      p_limit: 20,
    })
  })

  it('handles special characters in search safely (percent and underscore)', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=test%25_wildcard')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'test%_wildcard',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('handles commas in search safely', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=Acme%2C%20Inc')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'Acme, Inc',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('handles parentheses in search safely', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=John%20Doe%20%28Jr%29')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'John Doe (Jr)',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('handles quotes and backslashes in search safely', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=test%22quote%5Cbackslash')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'test"quote\\backslash',
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('returns empty array when no results', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([], 0),
      error: null,
    })

    const request = createRequest('/api/badges?search=nonexistent')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toHaveLength(0)
    expect(data.total).toBe(0)
  })

  it('returns 401 when not authorized', async () => {
    mockRequireAdmin.mockResolvedValueOnce({
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)

    expect(response.status).toBe(401)
  })

  it('returns 500 when supabaseAdmin not configured (no sensitive detail exposed)', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: null,
    }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn().mockResolvedValue({ authorized: true }) }))
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => false }))

    const { GET } = await import('@/app/api/badges/route')
    const request = createRequest('/api/badges')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
    expect(data.message).not.toContain('Service role')
    expect(data.message).not.toContain('configured')
  })

  it('handles status-only filtering with search', async () => {
    const mockBadge = createMockBadge({ badge_status: 'Active' })
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=John&status=Active')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: 'John',
      p_status: 'Active',
      p_page: 1,
      p_limit: 20,
    })
  })

  it('handles normal pagination', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 50),
      error: null,
    })

    const request = createRequest('/api/badges?page=2&limit=10')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.page).toBe(2)
    expect(data.limit).toBe(10)
    expect(data.totalPages).toBe(5)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 2,
      p_limit: 10,
    })
  })

  it('returns 400 for invalid page parameter (non-integer)', async () => {
    const request = createRequest('/api/badges?page=abc')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid page parameter')
  })

  it('returns 400 for invalid page parameter (zero)', async () => {
    const request = createRequest('/api/badges?page=0')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid page parameter')
  })

  it('returns 400 for invalid page parameter (negative)', async () => {
    const request = createRequest('/api/badges?page=-1')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid page parameter')
  })

  it('returns 400 for invalid limit parameter (non-integer)', async () => {
    const request = createRequest('/api/badges?limit=abc')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid limit parameter')
  })

  it('returns 400 for invalid limit parameter (zero)', async () => {
    const request = createRequest('/api/badges?limit=0')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid limit parameter')
  })

  it('returns 400 for invalid limit parameter (negative)', async () => {
    const request = createRequest('/api/badges?limit=-1')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid limit parameter')
  })

  it('returns 400 for limit exceeding maximum (1000)', async () => {
    const request = createRequest('/api/badges?limit=1001')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid limit parameter')
  })

  it('returns 400 for float page parameter (1.5)', async () => {
    const request = createRequest('/api/badges?page=1.5')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid page parameter')
  })

  it('returns 400 for float limit parameter (1.5)', async () => {
    const request = createRequest('/api/badges?limit=1.5')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid limit parameter')
  })

  it('returns 400 for page parameter with trailing characters (2abc)', async () => {
    const request = createRequest('/api/badges?page=2abc')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid page parameter')
  })

  it('returns 400 for limit parameter with trailing characters (50abc)', async () => {
    const request = createRequest('/api/badges?limit=50abc')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid limit parameter')
  })

  it('accepts maximum page parameter (2147483647)', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest(`/api/badges?page=${2147483647}`)
    const response = await getBadges(request)

    expect(response.status).toBe(200)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 2147483647,
      p_limit: 20,
    })
  })

  it('returns 400 for page parameter exceeding 2147483647', async () => {
    const request = createRequest(`/api/badges?page=${2147483648}`)
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('Invalid page parameter')
  })

  it('accepts maximum limit (1000)', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?limit=1000')
    const response = await getBadges(request)

    expect(response.status).toBe(200)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 1000,
    })
  })

  it('returns correct nested response structure', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data[0]).toHaveProperty('id')
    expect(data.data[0]).toHaveProperty('badge_number')
    expect(data.data[0]).toHaveProperty('badge_status')
    expect(data.data[0]).toHaveProperty('visit')
    expect(data.data[0].visit).toHaveProperty('visitor')
    expect(data.data[0].visit.visitor).toHaveProperty('full_name')
    expect(data.data[0].visit.visitor).toHaveProperty('visitor_organization')
    expect(data.data[0].visit.visitor).toHaveProperty('photo_url')
    expect(data.data[0].visit).toHaveProperty('employee')
    expect(data.data[0].visit.employee).toHaveProperty('full_name')
    expect(data.data[0].visit.employee).toHaveProperty('department')
  })

  it('handles empty search string as no search', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('handles whitespace-only search as no search', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([mockBadge], 1),
      error: null,
    })

    const request = createRequest('/api/badges?search=%20%20%20')
    await getBadges(request)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('search_badges', {
      p_search_text: null,
      p_status: null,
      p_page: 1,
      p_limit: 20,
    })
  })

  it('returns page beyond last record with non-zero total', async () => {
    const mockBadge = createMockBadge()
    mockSupabase.rpc.mockResolvedValueOnce({
      data: createMockRpcResponse([], 50),
      error: null,
    })

    const request = createRequest('/api/badges?page=10&limit=10')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toHaveLength(0)
    expect(data.total).toBe(50)
    expect(data.page).toBe(10)
    expect(data.totalPages).toBe(5)
  })

  it('returns 500 on RPC error', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC function not found', code: 'PGRST202' },
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Failed to fetch badges')
  })

  it('returns 500 on malformed RPC response (missing data)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { total: 1 },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on malformed RPC response (data not array)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { data: 'not-an-array', total: 1 },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on malformed RPC response (null)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on malformed RPC response (non-object)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: 'string-response',
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on invalid RPC total (missing)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { data: [], total: undefined },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on invalid RPC total (string)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { data: [], total: '50' },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on invalid RPC total (negative)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { data: [], total: -1 },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on invalid RPC total (fractional)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { data: [], total: 10.5 },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns 500 on invalid RPC total (unsafe integer)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { data: [], total: Number.MAX_SAFE_INTEGER },
      error: null,
    })

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe('Invalid response from search function')
  })

  it('returns demo mode response when isDemoMode is true', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const request = createRequest('/api/badges')
    const response = await getBadges(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.demo).toBe(true)
    expect(data.data).toEqual([])
    expect(data.total).toBe(0)
  })
})