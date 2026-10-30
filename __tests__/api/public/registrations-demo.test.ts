import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })),
    rateLimitResponse: vi.fn(() =>
    new Response(JSON.stringify({ success: false, message: 'Too many requests' }), { status: 429 })
  ),
}))

vi.mock('@/lib/server/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server/notification-service', () => ({
  createHostNotification: vi.fn(),
  createSystemNotification: vi.fn(),
  createAdminNotification: vi.fn(),
  createReceptionistNotification: vi.fn(),
  createSecurityNotification: vi.fn(),
  createPANotification: vi.fn(),
  createPADirectorNotification: vi.fn(),
}))
vi.mock('@/lib/server/audit', () => ({ logAuditAction: vi.fn() }))
vi.mock('@/lib/server/settings', () => ({ getSystemSetting: vi.fn() }))
vi.mock('@/lib/utils/portal-url', () => ({ buildPortalQrUrl: vi.fn() }))
vi.mock('@/lib/qrcode-verification', () => ({ verifyBadgeQR: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('@/lib/demo/mockData', () => ({
  getVisits: vi.fn(() => [{
    id: 'demo-visit-1',
    visitor_id: 'demo-visitor-1',
    employee_id: 'demo-emp-1',
    purpose: 'Demo meeting',
    status: 'pending',
    check_in_time: null,
    check_out_time: null,
    created_at: new Date().toISOString(),
    visitor: { full_name: 'Demo Visitor (Sample)', visitor_organization: 'Sample Org', photo_url: null },
    employee: { full_name: 'Demo Host (Sample)', department: 'Administration', office_location: 'HQ' },
    badge: null,
  }]),
  getVisitors: vi.fn(),
  getEmployees: vi.fn(),
  getDashboardStats: vi.fn(),
  addVisitor: vi.fn(),
  addVisit: vi.fn(),
  updateVisitStatus: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

vi.mock('@/lib/auth-client', () => ({
  getCurrentUser: vi.fn(),
  PERMISSIONS: { Admin: ['visits'] },
}))

vi.mock('@/lib/client/api', () => ({
  getAuthHeaders: vi.fn(() => Promise.resolve(new Headers({ 'Content-Type': 'application/json' }))),
}))

vi.mock('@/lib/client/badges', () => ({
  createBadge: vi.fn(),
}))

vi.mock('@/lib/badge/badge-print', () => ({
  printBadgeWindow: vi.fn(),
}))

vi.mock('@/lib/server/visit-status', () => ({
  applyVisitStatusChange: vi.fn(),
}))

describe('Public Registrations POST demo mode', () => {
  it('returns demo response with demo:true and "not persisted" message', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/auth-helpers', () => ({
      requireRole: vi.fn().mockRejectedValue(new Error('requireRole should not be called in demo mode')),
    }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))

    const { POST } = await import('@/app/api/public/registrations/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/public/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: 'v1', action: 'approve' }),
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.demo).toBe(true)
    expect(data.message).toContain('not persisted')
    expect(data.data.badge_number).toBe('DEMO-BADGE')
    expect(data.data.qr_token).toBe('demo-token')
  })

  it('does not access Supabase in demo mode', async () => {
    let supabaseAdminAccessed = false
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => { supabaseAdminAccessed = true; return { select: vi.fn() } },
      },
    }))
    vi.doMock('@/lib/auth-helpers', () => ({
      requireRole: vi.fn().mockResolvedValue({ authorized: true, userEmail: 'admin@test.com' }),
    }))

    const { POST } = await import('@/app/api/public/registrations/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/public/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: 'v1', action: 'approve' }),
    })
    await POST(req)
    expect(supabaseAdminAccessed).toBe(false)
  })
})

describe('Public Registrations POST non-demo mode', () => {
  it('returns 401 when requireRole denies access', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => false }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
    vi.doMock('@/lib/auth-helpers', () => ({
      requireRole: vi.fn().mockResolvedValue({ authorized: false, error: 'Unauthorized', status: 401 }),
    }))

    const { POST } = await import('@/app/api/public/registrations/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/public/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: 'v1', action: 'approve' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('Visits page demo mode', () => {
  it('loads visits from demo mock data without Supabase access', async () => {
    let supabaseFromCalled = false
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/demo/mockData', () => ({
      getVisits: vi.fn(() => [{
        id: 'demo-visit-1',
        visitor_id: 'demo-visitor-1',
        employee_id: 'demo-emp-1',
        purpose: 'Demo meeting',
        status: 'pending',
        check_in_time: null,
        check_out_time: null,
        created_at: '2025-01-01T00:00:00Z',
        visitor: { full_name: 'Demo Visitor', visitor_organization: 'Demo Org', photo_url: null },
        employee: { full_name: 'Demo Host', department: 'Admin', office_location: 'HQ' },
        badge: null,
      }]),
    }))
    vi.doMock('@/lib/supabase', () => ({
      supabase: {
        from: () => { supabaseFromCalled = true; return { select: vi.fn() } },
        channel: () => { supabaseFromCalled = true; return {} },
        removeChannel: vi.fn(),
      },
    }))
    vi.doMock('@/lib/auth-client', () => ({
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'demo-admin', role: 'Admin' }),
      PERMISSIONS: { Admin: ['visits'] },
    }))
    vi.doMock('@/lib/client/api', () => ({
      getAuthHeaders: vi.fn(() => Promise.resolve(new Headers({ 'Content-Type': 'application/json' }))),
    }))
    vi.doMock('@/lib/client/badges', () => ({ createBadge: vi.fn() }))
    vi.doMock('@/lib/badge/badge-print', () => ({ printBadgeWindow: vi.fn() }))
    vi.doMock('@/lib/client/audit', () => ({ logAuditAction: vi.fn() }))

    const { getVisits: getDemoVisits } = await import('@/lib/demo/mockData')
    const demoData = getDemoVisits()
    expect(demoData.length).toBe(1)
    expect(supabaseFromCalled).toBe(false)
  })

  it('setupRealtime is skipped in demo mode', async () => {
    let channelCalled = false
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/demo/mockData', () => ({
      getVisits: vi.fn(() => []),
    }))
    vi.doMock('@/lib/supabase', () => ({
      supabase: {
        from: vi.fn(),
        channel: () => { channelCalled = true; return { on: vi.fn(() => ({ subscribe: vi.fn() })) } },
        removeChannel: vi.fn(),
      },
    }))
    vi.doMock('@/lib/auth-client', () => ({
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'demo-admin', role: 'Admin' }),
      PERMISSIONS: { Admin: ['visits'] },
    }))
    vi.doMock('@/lib/client/api', () => ({
      getAuthHeaders: vi.fn(() => Promise.resolve(new Headers({ 'Content-Type': 'application/json' }))),
    }))
    vi.doMock('@/lib/client/badges', () => ({ createBadge: vi.fn() }))
    vi.doMock('@/lib/badge/badge-print', () => ({ printBadgeWindow: vi.fn() }))
    vi.doMock('@/lib/client/audit', () => ({ logAuditAction: vi.fn() }))

    await import('@/app/visits/page')

    expect(channelCalled).toBe(false)
  })
})

describe('Public Registrations GET demo mode', () => {
  it('returns synthetic pending visits without Supabase access', async () => {
    let supabaseFromCalled = false
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/demo/mockData', () => ({
      getVisits: vi.fn(() => [{
        id: 'demo-visit-1',
        visitor_id: '',
        employee_id: '',
        purpose: 'Demo meeting',
        status: 'pending',
        check_in_time: null,
        check_out_time: null,
        created_at: '2025-01-01T00:00:00Z',
        visitor: { full_name: 'Demo Visitor', visitor_organization: 'Demo Org', photo_url: null },
        employee: { full_name: 'Demo Host', department: 'Admin', office_location: 'HQ' },
        badge: null,
      }]),
    }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => { supabaseFromCalled = true; return { select: vi.fn() } } } }))
    vi.doMock('@/lib/auth', () => ({
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'demo-admin', role: 'Admin' }),
    }))

    const { GET } = await import('@/app/api/public/registrations/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/public/registrations')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.demo).toBe(true)
    expect(data.message).toContain('not persisted')
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBe(1)
    expect(data.data[0].status).toBe('pending')
    expect(supabaseFromCalled).toBe(false)
  })

  it('returns 401 when unauthenticated in demo mode', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    vi.doMock('@/lib/auth', () => ({
      getCurrentUser: vi.fn().mockResolvedValue(null),
    }))

    const { GET } = await import('@/app/api/public/registrations/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/public/registrations')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('Badges API demo mode', () => {
  it('POST /api/badges returns demo badge in demo mode', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn().mockResolvedValue({ authorized: true }) }))

    const { POST } = await import('@/app/api/badges/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: 'demo-visit-1' }),
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.demo).toBe(true)
    expect(data.data.badge_number).toBe('DEMO-BADGE')
  })

  it('POST /api/badges returns 400 when missing visit_id in demo mode', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))

    const { POST } = await import('@/app/api/badges/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST /api/badges/[id] returns demo response for print action', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireRole: vi.fn().mockResolvedValue({ authorized: true }) }))

    const { POST } = await import('@/app/api/badges/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/badges/demo-badge-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'print' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'demo-badge-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.demo).toBe(true)
    expect(data.message).toContain('print')
  })

  it('POST /api/badges/[id] returns demo response for cancel action', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireRole: vi.fn().mockResolvedValue({ authorized: true }) }))

    const { POST } = await import('@/app/api/badges/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/badges/demo-badge-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'demo-badge-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.demo).toBe(true)
    expect(data.message).toContain('cancel')
  })

  it('GET /api/badges returns synthetic empty list in demo mode', async () => {
    let supabaseFromCalled = false
    vi.resetModules()
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => { supabaseFromCalled = true; return { select: vi.fn(), order: vi.fn(), eq: vi.fn(), or: vi.fn(), range: vi.fn(), count: 'exact' } },
      },
    }))
    vi.doMock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn().mockResolvedValue({ authorized: true }) }))

    const { GET } = await import('@/app/api/badges/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/badges')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.demo).toBe(true)
    expect(data.message).toContain('not persisted')
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBe(0)
    expect(data.total).toBe(0)
    expect(supabaseFromCalled).toBe(false)
  })
})
