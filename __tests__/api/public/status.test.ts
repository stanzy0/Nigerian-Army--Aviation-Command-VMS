import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => false),
}))

const mockMaybeSingle = vi.fn()
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

// Mock rate limiting
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })),
  rateLimitResponse: vi.fn((resetAt: number) => 
    new Response(JSON.stringify({ success: false, message: 'Too many requests' }), { status: 429 })
  ),
}))

// Mock supabase admin
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => mockFrom(),
  },
}))

import { GET } from '@/app/api/public/status/route'
import { checkRateLimit } from '@/lib/server/rate-limit'

describe('GET /api/public/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
  })

  const makeRequest = (url: string) => {
    return new NextRequest(new URL(url))
  }

  it('returns 400 for missing credential', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('invalid_credential')
  })

  it('returns 400 for empty credential', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects UUID as credential (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=123e4567-e89b-12d3-a456-426614174000')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects registration number format without valid token (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=REG-2024-001234')
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects badge number without valid token (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=BADGE-ABC123')
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects revoked/suspended/inactive badges (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-123')
    mockMaybeSingle.mockResolvedValueOnce({ 
      data: { id: 'b1', badge_number: 'B001', badge_status: 'Suspended', expires_at: null, visit_id: 'v1', qr_token: 'valid-token-123' }, 
      error: null 
    })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects expired badges (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-456')
    mockMaybeSingle.mockResolvedValueOnce({ 
      data: { id: 'b2', badge_number: 'B002', badge_status: 'Active', expires_at: '2020-01-01T00:00:00Z', visit_id: 'v2', qr_token: 'valid-token-456' }, 
      error: null 
    })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects when badge has no visit_id (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-789')
    mockMaybeSingle.mockResolvedValueOnce({ 
      data: { id: 'b3', badge_number: 'B003', badge_status: 'Active', expires_at: null, visit_id: null, qr_token: 'valid-token-789' }, 
      error: null 
    })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects NULL expiry timestamp (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-null-expiry')
    mockMaybeSingle.mockResolvedValueOnce({ 
      data: { id: 'b7', badge_number: 'B007', badge_status: 'Active', expires_at: null, visit_id: 'v7', qr_token: 'valid-token-null-expiry' }, 
      error: null 
    })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects invalid expiry date format (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-invalid-date')
    mockMaybeSingle.mockResolvedValueOnce({ 
      data: { id: 'b8', badge_number: 'B008', badge_status: 'Active', expires_at: 'invalid-date', visit_id: 'v8', qr_token: 'valid-token-invalid-date' }, 
      error: null 
    })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects badge expiring at current time (401)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-expiring-now')
    const now = new Date().toISOString()
    mockMaybeSingle.mockResolvedValueOnce({ 
      data: { id: 'b9', badge_number: 'B009', badge_status: 'Active', expires_at: now, visit_id: 'v9', qr_token: 'valid-token-expiring-now' }, 
      error: null 
    })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects inactive badge statuses (401)', async () => {
    const inactiveStatuses = ['Pending', 'Returned', 'Cancelled', 'Expired']
    for (const status of inactiveStatuses) {
      const req = makeRequest(`http://localhost:3000/api/public/status?q=token-${status.toLowerCase()}`)
      mockMaybeSingle.mockResolvedValueOnce({ 
        data: { id: 'bx', badge_number: 'BX', badge_status: status, expires_at: new Date(Date.now() + 86400000).toISOString(), visit_id: 'vx', qr_token: `token-${status.toLowerCase()}` }, 
        error: null 
      })
      const res = await GET(req)
      const data = await res.json()
      expect(res.status).toBe(401)
      expect(data.error).toBe('invalid_credential')
    }
  })

  it('returns minimal data for valid token with correct visit (no PII)', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-abc')
    mockMaybeSingle
      .mockResolvedValueOnce({ 
        data: { id: 'b4', badge_number: 'B004', badge_status: 'Active', expires_at: '2099-12-31T00:00:00Z', visit_id: 'v3', qr_token: 'valid-token-abc' }, 
        error: null 
      })
      .mockResolvedValueOnce({ 
        data: { 
          registration_number: 'REG-2024-999', 
          status: 'approved', 
          created_at: '2024-10-26T10:00:00Z', 
          check_in_time: null, 
          check_out_time: null 
        }, 
        error: null 
      })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.data).toHaveProperty('registration_number')
    expect(data.data).toHaveProperty('status')
    expect(data.data).toHaveProperty('visit_date')
    expect(data.data).toHaveProperty('check_in_time')
    expect(data.data).toHaveProperty('check_out_time')
    expect(data.data).not.toHaveProperty('visitor_name')
    expect(data.data).not.toHaveProperty('visitor')
    expect(data.data).not.toHaveProperty('email')
    expect(data.data).not.toHaveProperty('phone')
    expect(data.data).not.toHaveProperty('host_name')
    expect(data.data).not.toHaveProperty('badge_number')
  })

  it('returns 401 if visit not found for valid badge', async () => {
    const req = makeRequest('http://localhost:3000/api/public/status?q=valid-token-xyz')
    mockMaybeSingle
      .mockResolvedValueOnce({ 
        data: { id: 'b5', badge_number: 'B005', badge_status: 'Active', expires_at: null, visit_id: 'v_missing', qr_token: 'valid-token-xyz' }, 
        error: null 
      })
      .mockResolvedValueOnce({ data: null, error: null })
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

  it('enforces rate limiting', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 })
    const req = makeRequest('http://localhost:3000/api/public/status?q=token')
    const res = await GET(req)
    expect(res.status).toBe(429)
  })
})

describe('GET /api/public/status - demo mode', () => {
  it('returns 401 for QR lookup in demo mode (no demo badges exist)', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    const { GET: demoGet } = await import('@/app/api/public/status/route')
    const req = new NextRequest(new URL('http://localhost:3000/api/public/status?q=any-token-123'))
    const res = await demoGet(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing credential in demo mode', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    const { GET: demoGet } = await import('@/app/api/public/status/route')
    const req = new NextRequest(new URL('http://localhost:3000/api/public/status'))
    const res = await demoGet(req)
    expect(res.status).toBe(400)
  })
})
