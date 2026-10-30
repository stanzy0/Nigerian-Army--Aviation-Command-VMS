import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'

/**
 * Canonical outbox event types — must match the CHECK constraint in
 * supabase/migrations/20261024_atomic_visit_status.sql.
 */
export type OutboxEventType = 'qr_generate' | 'approval_email' | 'status_notification'

export interface OutboxPayload {
  visitId: string
  status?: string
}

export interface OutboxResult {
  success: boolean
  error?: string
}

/**
 * Validates that an outbox payload conforms to the expected contract.
 */
function validatePayload(eventType: OutboxEventType, payload: Record<string, unknown>): string | null {
  if (!payload || typeof payload !== 'object') {
    return 'Payload must be a non-null object'
  }
  if (typeof payload.visitId !== 'string' || !payload.visitId) {
    return 'Payload must contain a non-empty visitId string'
  }
  if (eventType === 'status_notification' && typeof payload.status !== 'string') {
    return 'status_notification payload must contain a status string'
  }
  return null
}

/**
 * Enqueues a post-commit side-effect event into the public.outbox table.
 *
 * Prefer transactional insertion via the atomic DB function. This helper
 * is for cases where the event must be enqueued outside the status transaction.
 *
 * In demo mode, this is a no-op that returns success.
 *
 * Returns { success, error } so callers can detect failures.
 */
export async function enqueueOutbox(
  eventType: OutboxEventType,
  payload: OutboxPayload
): Promise<OutboxResult> {
  if (isDemoMode()) {
    return { success: true }
  }

  if (!supabaseAdmin) {
    return { success: false, error: 'supabaseAdmin not configured' }
  }

  const validationError = validatePayload(eventType, payload as unknown as Record<string, unknown>)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const eventKey = eventType === 'status_notification'
    ? `${eventType}:${payload.visitId}:${payload.status}`
    : `${eventType}:${payload.visitId}`

  const { error } = await supabaseAdmin
    .from('outbox')
    .insert({
      event_type: eventType,
      event_key: eventKey,
      payload,
      status: 'pending',
      attempts: 0,
      max_attempts: 5,
    })

  if (error) {
    // Unique constraint violation means the event already exists — not an error.
    if (error.code === '23505') {
      return { success: true }
    }
    return { success: false, error: error.message }
  }

  return { success: true }
}
