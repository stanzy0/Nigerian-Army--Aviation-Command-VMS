import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { generateVisitQRCode } from '@/lib/qrcode'
import { sendEmail } from '@/lib/server/email'
import { createVisitStatusNotification } from '@/lib/server/notifications'

// ---------------------------------------------------------------------------
// Outbox processor — safe processing core for qr_generate, approval_email,
// status_notification events.
//
// Deployment: This module provides the processing functions. A scheduler
// (cron, Vercel cron, or Supabase pg_cron) must call processOutboxBatch()
// periodically. Until a scheduler is configured, events are queued but not
// processed — do not claim events are processed.
// ---------------------------------------------------------------------------

const MAX_BACKOFF_MS = 5 * 60 * 1000 // 5 minutes
const BASE_BACKOFF_MS = 1000 // 1 second

export interface OutboxEvent {
  id: string
  event_type: string
  event_key: string
  payload: { visitId: string; status?: string }
  status: string
  attempts: number
  max_attempts: number
  created_at: string
  scheduled_at: string
  claimed_at: string | null
  claimed_by: string | null
  processed_at: string | null
  error_message: string | null
}

export interface ProcessResult {
  processed: number
  failed: number
  skipped: number
}

/**
 * Claims a batch of pending outbox events using the database-side
 * claim_outbox_events() function which uses FOR UPDATE SKIP LOCKED.
 * This prevents concurrent workers from claiming the same event.
 */
async function claimPendingEvents(batchSize: number = 10): Promise<OutboxEvent[]> {
  if (!supabaseAdmin) return []

  const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const { data, error } = await supabaseAdmin.rpc('claim_outbox_events', {
    p_batch_size: batchSize,
    p_lease_timeout_minutes: 5,
    p_worker_id: workerId,
  })

  if (error) {
    console.error('Failed to claim outbox events:', error.message)
    return []
  }

  return (data as OutboxEvent[]) ?? []
}

/**
 * Marks an event as done.
 */
async function markDone(eventId: string): Promise<void> {
  if (!supabaseAdmin) return
  await supabaseAdmin
    .from('outbox')
    .update({ status: 'done', processed_at: new Date().toISOString(), error_message: null, claimed_at: null, claimed_by: null })
    .eq('id', eventId)
    .eq('status', 'processing')
}

/**
 * Marks an event as failed with retry scheduling or dead-letter.
 */
async function markFailed(event: OutboxEvent, errorMessage: string): Promise<void> {
  if (!supabaseAdmin) return

  const newAttempts = event.attempts + 1
  const isDeadLetter = newAttempts >= event.max_attempts

  let scheduledAt: string | null = null
  if (!isDeadLetter) {
    const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, newAttempts), MAX_BACKOFF_MS)
    scheduledAt = new Date(Date.now() + backoffMs).toISOString()
  }

  // Conditional update: only if still in 'processing' state (expected).
  await supabaseAdmin
    .from('outbox')
    .update({
      status: isDeadLetter ? 'dead_letter' : 'pending',
      attempts: newAttempts,
      scheduled_at: scheduledAt || event.scheduled_at,
      claimed_at: isDeadLetter ? event.claimed_at : null,
      claimed_by: isDeadLetter ? event.claimed_by : null,
      error_message: errorMessage.slice(0, 1000),
    })
    .eq('id', event.id)
    .eq('status', 'processing')
}

/**
 * Processes a single outbox event. Returns true on success.
 */
async function processEvent(event: OutboxEvent): Promise<boolean> {
  if (!supabaseAdmin) return false

  const { visitId, status } = event.payload || {}

  if (!visitId) {
    await markFailed(event, 'Missing visitId in payload')
    return false
  }

  // Fetch the visit to ensure it still exists.
  const { data: visit, error: visitError } = await supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(full_name, email, visitor_organization), employee:employees(full_name, user_id, office_location)')
    .eq('id', visitId)
    .single()

  if (visitError || !visit) {
    await markFailed(event, `Visit not found: ${visitId}`)
    return false
  }

  const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
  const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee

  try {
    switch (event.event_type) {
      case 'qr_generate': {
        // Idempotent: check if qr_code already exists.
        if (visit.qr_code) {
          await markDone(event.id)
          return true
        }
        const qrCodeDataUrl = await generateVisitQRCode(visitId)
        await supabaseAdmin
          .from('visits')
          .update({ qr_code: qrCodeDataUrl })
          .eq('id', visitId)
        await markDone(event.id)
        return true
      }

      case 'approval_email': {
        const visitorEmail = visitor?.email || ''
        if (!visitorEmail) {
          await markDone(event.id) // No email to send; mark done to avoid retries.
          return true
        }
        // Idempotency: check if email already sent (via email_logs).
        const { data: existingLog } = await supabaseAdmin
          .from('email_logs')
          .select('id')
          .eq('related_type', 'visit')
          .eq('related_id', visitId)
          .eq('template', 'registration_approved')
          .limit(1)
          .maybeSingle()

        if (existingLog) {
          await markDone(event.id)
          return true
        }

        const visitorName = visitor?.full_name || 'Visitor'
        const hostName = employee?.full_name || 'Host'
        const visitDate = visit.scheduled_date
          ? new Date(visit.scheduled_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]

        const result = await sendEmail({
          to: visitorEmail,
          recipientName: visitorName,
          subject: `Registration Approved - ${visit.registration_number || visitId}`,
          template: 'registration_approved',
          data: {
            visitorName,
            registrationNumber: visit.registration_number || '',
            date: visitDate,
            arrivalTime: 'TBD',
            hostName,
            location: employee?.office_location || 'Reception',
            badgeNumber: 'N/A',
            qrCodeUrl: visit.qr_code || '',
          },
          relatedType: 'visit',
          relatedId: visitId,
        })

        if (!result.success) {
          await markFailed(event, result.error || 'Email send failed')
          return false
        }
        await markDone(event.id)
        return true
      }

      case 'status_notification': {
        const visitorName = visitor?.full_name || 'Visitor'
        const hostName = employee?.full_name || 'Host'
        const hostUserId = employee?.user_id || null
        const hostEmployeeId = visit.employee_id || null
        const displayTime = status === 'checked_in'
          ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null

        await createVisitStatusNotification(
          status || visit.status,
          visitorName,
          hostName,
          visitId,
          hostUserId,
          displayTime,
          hostEmployeeId
        )
        await markDone(event.id)
        return true
      }

      default:
        await markFailed(event, `Unknown event type: ${event.event_type}`)
        return false
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markFailed(event, message)
    return false
  }
}

/**
 * Processes a batch of pending outbox events.
 * Safe to call from a scheduler or cron job.
 *
 * Returns counts of processed, failed, and skipped events.
 */
export async function processOutboxBatch(batchSize: number = 10): Promise<ProcessResult> {
  if (isDemoMode()) {
    return { processed: 0, failed: 0, skipped: 0 }
  }

  if (!supabaseAdmin) {
    return { processed: 0, failed: 0, skipped: 0 }
  }

  const claimed = await claimPendingEvents(batchSize)
  let processed = 0
  let failed = 0

  for (const event of claimed) {
    const success = await processEvent(event)
    if (success) {
      processed++
    } else {
      failed++
    }
  }

  return { processed, failed, skipped: batchSize - claimed.length }
}
