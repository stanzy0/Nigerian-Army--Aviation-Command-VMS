import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => false),
}))

const mockSingle = vi.fn()
const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: mockSingle,
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => mockFrom(),
  },
}))

vi.mock('@/lib/server/audit', () => ({
  logAuditAction: vi.fn(),
}))

vi.mock('@/lib/server/notification-service', () => ({
  createHostNotification: vi.fn(),
  createSystemNotification: vi.fn(),
}))

vi.mock('@/lib/server/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })),
  rateLimitResponse: vi.fn(),
}))

vi.mock('@/lib/server/visit-status', () => ({
  applyVisitStatusChange: vi.fn().mockResolvedValue({ outcome: 'success', visit_id: 'v1', status: 'checked_in', message: 'OK' }),
}))

import { POST } from '@/app/api/public/kiosk-checkin/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/public/kiosk-checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('kiosk-checkin credential validation', () => {
  beforeEach(() => {
    mockSingle.mockReset()
    mockFrom.mockClear()
  })

  it('rejects missing credential', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects short credential', async () => {
    const res = await POST(makeRequest({ qr_token: 'short' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects invalid credential (no matching badge)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const res = await POST(makeRequest({ qr_token: 'a'.repeat(32) }))
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('invalid_credential')
  })

  it('rejects badge with non-active status', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'BADGE-1',
        badge_status: 'Suspended',
        expires_at: null,
        visit_id: 'v1',
        visit: { id: 'v1', status: 'approved', registration_number: 'REG-1', visitor: { full_name: 'Test', visitor_organization: 'Org' }, employee: { full_name: 'Host', user_id: 'u1', office_location: 'Reception' } },
      },
      error: null,
    })
    const res = await POST(makeRequest({ qr_token: 'a'.repeat(32) }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toBe('badge_inactive')
  })

  it('rejects expired badge', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'BADGE-1',
        badge_status: 'Active',
        expires_at: new Date(Date.now() - 86400000).toISOString(),
        visit_id: 'v1',
        visit: { id: 'v1', status: 'approved', registration_number: 'REG-1', visitor: { full_name: 'Test', visitor_organization: 'Org' }, employee: { full_name: 'Host', user_id: 'u1', office_location: 'Reception' } },
      },
      error: null,
    })
    const res = await POST(makeRequest({ qr_token: 'a'.repeat(32) }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toBe('badge_expired')
  })

  it('rejects visit not in approved status', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'BADGE-1',
        badge_status: 'Active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        visit_id: 'v1',
        visit: { id: 'v1', status: 'pending', registration_number: 'REG-1', visitor: { full_name: 'Test', visitor_organization: 'Org' }, employee: { full_name: 'Host', user_id: 'u1', office_location: 'Reception' } },
      },
      error: null,
    })
    const res = await POST(makeRequest({ qr_token: 'a'.repeat(32) }))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('invalid_status')
  })

  it('accepts valid credential for approved visit', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'BADGE-1',
        badge_status: 'Active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        visit_id: 'v1',
        visit: { id: 'v1', status: 'approved', registration_number: 'REG-1', visitor: { full_name: 'Test Visitor', visitor_organization: 'Org' }, employee: { full_name: 'Host', user_id: 'u1', office_location: 'Reception' } },
      },
      error: null,
    })
    const res = await POST(makeRequest({ qr_token: 'a'.repeat(32) }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('ignores client-supplied systemAction flag', async () => {
    // Even if client sends systemAction: true, the route only uses server-side systemAction
    mockSingle.mockResolvedValue({
      data: {
        id: 'b1',
        badge_number: 'BADGE-1',
        badge_status: 'Active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        visit_id: 'v1',
        visit: { id: 'v1', status: 'approved', registration_number: 'REG-1', visitor: { full_name: 'Test Visitor', visitor_organization: 'Org' }, employee: { full_name: 'Host', user_id: 'u1', office_location: 'Reception' } },
      },
      error: null,
    })
    const res = await POST(makeRequest({ qr_token: 'a'.repeat(32), systemAction: true, visit_id: 'other-visit' }))
    expect(res.status).toBe(200)
    // The visit_id from the credential is used, not the client-supplied one
    const data = await res.json()
    expect(data.data.visit_id).toBe('v1')
  })
})

describe('kiosk-checkin demo mode', () => {
  it('returns simulated success without DB writes', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    const { POST: demoPost } = await import('@/app/api/public/kiosk-checkin/route')
    const req = new (await import('next/server')).NextRequest('http://localhost:3000/api/public/kiosk-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await demoPost(req)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
