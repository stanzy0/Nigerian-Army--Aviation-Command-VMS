import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })),
  rateLimitResponse: vi.fn((resetAt: number) => 
    new Response(JSON.stringify({ success: false, message: 'Too many requests' }), { status: 429 })
  ),
}))

vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => mockFrom(),
  },
}))

vi.mock('@/lib/server/visit-status', () => ({
  applyVisitStatusChange: vi.fn(),
}))

vi.mock('@/lib/server/audit', () => ({
  logAuditAction: vi.fn(),
}))

vi.mock('@/lib/server/notification-service', () => ({
  createHostNotification: vi.fn(),
  createSystemNotification: vi.fn(),
}))

vi.mock('@/lib/server/email', () => ({
  sendEmail: vi.fn(),
}))

import { POST } from '@/app/api/public/kiosk-checkin/route'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { applyVisitStatusChange } from '@/lib/server/visit-status'

describe('POST /api/public/kiosk-checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ single: mockSingle })
    vi.mocked(applyVisitStatusChange).mockResolvedValue({
      outcome: 'success',
      visit_id: 'test-visit',
      status: 'checked_in',
      message: 'Status updated successfully',
    })
  })

  const makeRequest = (body: Record<string, unknown>) => {
    return new NextRequest(new URL('http://localhost:3000/api/public/kiosk-checkin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const validToken = 'valid-token-123456'
  const futureExpiry = new Date(Date.now() + 86400000).toISOString()

  const validBadge = {
    id: 'b1',
    badge_number: 'B001',
    badge_status: 'Active',
    expires_at: futureExpiry,
    visit_id: 'v1',
    visit: {
      id: 'v1',
      status: 'approved',
      registration_number: 'REG-001',
      visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
      employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
    },
  }

  it('returns 400 for missing qr_token', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('invalid_credential')
  })

  it('returns 400 for empty qr_token', async () => {
    const req = makeRequest({ qr_token: '' })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('invalid_credential')
  })

  it('returns 400 for whitespace-only qr_token', async () => {
    const req = makeRequest({ qr_token: '   ' })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('invalid_credential')
  })

  it('returns 400 for short qr_token', async () => {
    const req = makeRequest({ qr_token: 'short' })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('invalid_credential')
  })

  it('returns 401 for non-existent badge', async () => {
    const req = makeRequest({ qr_token: 'nonexistenttoken123' })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('invalid_credential')
  })

it('returns 403 for inactive badge statuses', async () => {
    const inactiveStatuses = ['Pending', 'Returned', 'Cancelled', 'Expired']
    for (const status of inactiveStatuses) {
      const token = `token-${status.toLowerCase()}-123456`
      mockSingle.mockResolvedValue({
        data: {
          id: 'b1',
          badge_number: 'B001',
          badge_status: status,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          visit_id: 'v1',
          visit: {
            id: 'v1',
            status: 'approved',
            registration_number: 'REG-001',
            visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
            employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
          },
        },
        error: null,
      })
      const req = makeRequest({ qr_token: token })
      const res = await POST(req)
      const data = await res.json()
      expect(res.status).toBe(403)
      expect(data.error).toBe('badge_inactive')
    }
  })

  it('rejects NULL expiry timestamp (403)', async () => {
    const req = makeRequest({ qr_token: 'token-null-expiry-123456' })
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'B001',
        badge_status: 'Active',
        expires_at: null,
        visit_id: 'v1',
        visit: {
          id: 'v1',
          status: 'approved',
          registration_number: 'REG-001',
          visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
          employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
        },
      },
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.error).toBe('badge_expired')
  })

  it('rejects invalid expiry date format (403)', async () => {
    const req = makeRequest({ qr_token: 'token-invalid-date-123456' })
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'B001',
        badge_status: 'Active',
        expires_at: 'invalid-date',
        visit_id: 'v1',
        visit: {
          id: 'v1',
          status: 'approved',
          registration_number: 'REG-001',
          visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
          employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
        },
      },
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.error).toBe('badge_expired')
  })

  it('rejects badge expiring at current time (403)', async () => {
    const req = makeRequest({ qr_token: 'token-expiring-now-123456' })
    const now = new Date().toISOString()
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'B001',
        badge_status: 'Active',
        expires_at: now,
        visit_id: 'v1',
        visit: {
          id: 'v1',
          status: 'approved',
          registration_number: 'REG-001',
          visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
          employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
        },
      },
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.error).toBe('badge_expired')
  })

  it('rejects expired badges (403)', async () => {
    const req = makeRequest({ qr_token: 'token-expired-123456' })
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'B001',
        badge_status: 'Active',
        expires_at: new Date(Date.now() - 86400000).toISOString(),
        visit_id: 'v1',
        visit: {
          id: 'v1',
          status: 'approved',
          registration_number: 'REG-001',
          visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
          employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
        },
      },
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.error).toBe('badge_expired')
  })

  it('returns 404 when linked visit not found', async () => {
    const req = makeRequest({ qr_token: 'valid-token-123456' })
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'B001',
        badge_status: 'Active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        visit_id: 'v1',
        visit: null,
      },
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.error).toBe('not_found')
  })

  it('returns 409 when visit is not approved', async () => {
    const req = makeRequest({ qr_token: 'valid-token-123456' })
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'B001',
        badge_status: 'Active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        visit_id: 'v1',
        visit: {
          id: 'v1',
          status: 'pending',
          registration_number: 'REG-001',
          visitor: [{ full_name: 'Test Visitor', visitor_organization: 'Test Org' }],
          employee: [{ full_name: 'Test Host', user_id: 'user-1', office_location: 'Reception' }],
        },
      },
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('invalid_status')
  })

  it('returns 200 for valid badge with approved visit', async () => {
    const req = makeRequest({ qr_token: validToken })
    mockSingle.mockResolvedValue({
      data: validBadge,
      error: null,
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toHaveProperty('visit_id')
    expect(data.data).toHaveProperty('status', 'checked_in')
    expect(data.data).toHaveProperty('check_in_time')
    expect(data.data).toHaveProperty('visitor_name')
    expect(data.data).toHaveProperty('host_name')
    expect(data.data).toHaveProperty('office_location')
  })

  it('enforces rate limiting', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 })
    const req = makeRequest({ qr_token: validToken })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  it('ignores systemAction from request body', async () => {
    const req = makeRequest({ qr_token: validToken, systemAction: true })
    mockSingle.mockResolvedValue({
      data: validBadge,
      error: null,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(applyVisitStatusChange).toHaveBeenCalledWith('v1', 'checked_in', {
      approvedBy: null,
      systemAction: true,
    })
  })
})