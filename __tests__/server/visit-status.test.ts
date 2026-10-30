import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock demo mode (must be false for RPC path)
vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => false),
}))

// Mock supabase-admin
const mockRpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import { applyVisitStatusChange } from '@/lib/server/visit-status'

describe('applyVisitStatusChange (atomic RPC)', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  it('returns success outcome from RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'success', visit_id: 'v1', status: 'approved', message: 'OK' }],
      error: null,
    })
    const result = await applyVisitStatusChange('v1', 'approved', { approvedBy: 'user-1' })
    expect(result.outcome).toBe('success')
    expect(result.visit_id).toBe('v1')
    expect(result.status).toBe('approved')
  })

  it('returns not_found outcome', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'not_found', visit_id: null, status: null, message: 'Visit not found' }],
      error: null,
    })
    const result = await applyVisitStatusChange('missing', 'approved', { approvedBy: 'user-1' })
    expect(result.outcome).toBe('not_found')
  })

  it('returns invalid_transition outcome', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'invalid_transition', visit_id: 'v1', status: 'checked_out', message: 'Terminal' }],
      error: null,
    })
    const result = await applyVisitStatusChange('v1', 'approved', { approvedBy: 'user-1' })
    expect(result.outcome).toBe('invalid_transition')
  })

  it('returns authorization outcome for unauthorized actor', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'authorization', visit_id: 'v1', status: 'pending', message: 'Forbidden' }],
      error: null,
    })
    const result = await applyVisitStatusChange('v1', 'approved', { approvedBy: 'user-2' })
    expect(result.outcome).toBe('authorization')
  })

  it('handles RPC error gracefully', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Database connection failed' },
    })
    const result = await applyVisitStatusChange('v1', 'approved', { approvedBy: 'user-1' })
    expect(result.outcome).toBe('authorization')
    expect(result.message).toBe('Database connection failed')
  })

  it('passes approvedBy as p_actor_user_id', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'success', visit_id: 'v1', status: 'approved', message: 'OK' }],
      error: null,
    })
    await applyVisitStatusChange('v1', 'approved', { approvedBy: 'actor-123', paRole: 'PA_TO_DIRECTOR', paComment: 'comment' })
    expect(mockRpc).toHaveBeenCalledWith('update_visit_status_atomic', {
      p_visit_id: 'v1',
      p_new_status: 'approved',
      p_actor_user_id: 'actor-123',
      p_rejection_reason: null,
      p_pa_comment: 'comment',
      p_pa_role: 'PA_TO_DIRECTOR',
      p_system_action: false,
    })
  })

  it('passes systemAction flag to RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'success', visit_id: 'v1', status: 'checked_in', message: 'OK' }],
      error: null,
    })
    await applyVisitStatusChange('v1', 'checked_in', { approvedBy: null, systemAction: true })
    expect(mockRpc).toHaveBeenCalledWith('update_visit_status_atomic', expect.objectContaining({
      p_actor_user_id: null,
      p_system_action: true,
    }))
  })

  it('passes systemAction=false by default', async () => {
    mockRpc.mockResolvedValue({
      data: [{ outcome: 'success', visit_id: 'v1', status: 'approved', message: 'OK' }],
      error: null,
    })
    await applyVisitStatusChange('v1', 'approved', { approvedBy: 'actor-1' })
    expect(mockRpc).toHaveBeenCalledWith('update_visit_status_atomic', expect.objectContaining({
      p_system_action: false,
    }))
  })
})

describe('applyVisitStatusChange (demo mode)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns simulated success without calling RPC', async () => {
    vi.doMock('@/lib/demo', () => ({ isDemoMode: () => true }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: null }))
    const { applyVisitStatusChange: fn } = await import('@/lib/server/visit-status')
    const result = await fn('v1', 'approved')
    expect(result.outcome).toBe('success')
    expect(result.message).toContain('Demo mode')
  })
})
