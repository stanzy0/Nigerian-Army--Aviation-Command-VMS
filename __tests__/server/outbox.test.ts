import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => false),
}))

let capturedPayload: unknown = null
const mockInsert = vi.fn((payload: unknown) => {
  capturedPayload = payload
  return { error: null }
})
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (payload: unknown) => mockInsert(payload),
    }),
  },
}))

import { enqueueOutbox } from '@/lib/server/outbox'

describe('enqueueOutbox', () => {
  beforeEach(() => {
    mockInsert.mockReset()
    mockInsert.mockImplementation((payload: unknown) => {
      capturedPayload = payload
      return { error: null }
    })
    capturedPayload = null
  })

  it('inserts with correct event_key for qr_generate', async () => {
    const result = await enqueueOutbox('qr_generate', { visitId: 'v1' })
    expect(result.success).toBe(true)
    expect(capturedPayload).toMatchObject({
      event_type: 'qr_generate',
      event_key: 'qr_generate:v1',
      status: 'pending',
    })
  })

  it('inserts with correct event_key for status_notification', async () => {
    const result = await enqueueOutbox('status_notification', { visitId: 'v1', status: 'approved' })
    expect(result.success).toBe(true)
    expect(capturedPayload).toMatchObject({
      event_key: 'status_notification:v1:approved',
    })
  })

  it('validates payload — rejects missing visitId', async () => {
    const result = await enqueueOutbox('qr_generate', { visitId: '' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('visitId')
  })

  it('validates status_notification requires status', async () => {
    const result = await enqueueOutbox('status_notification', { visitId: 'v1' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('status')
  })

  it('handles unique constraint violation as success', async () => {
    mockInsert.mockImplementation((() => {
      capturedPayload = null
      return { error: { code: '23505', message: 'duplicate' } }
    }) as any)
    const result = await enqueueOutbox('qr_generate', { visitId: 'v1' })
    expect(result.success).toBe(true)
  })

  it('returns error on insert failure', async () => {
    mockInsert.mockImplementation((() => {
      capturedPayload = null
      return { error: { code: '42P01', message: 'table not found' } }
    }) as any)
    const result = await enqueueOutbox('qr_generate', { visitId: 'v1' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('table not found')
  })
})
