import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'

export type VisitStatus = 'pending' | 'approved' | 'rejected' | 'checked_in' | 'checked_out'

export const VALID_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['checked_in'],
  checked_in: ['checked_out'],
  checked_out: [],
  rejected: [],
}

export function isValidTransition(from: VisitStatus, to: VisitStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} -> ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

export interface VisitStatusOutcome {
  outcome: 'success' | 'not_found' | 'invalid_transition' | 'authorization'
  visit_id: string | null
  status: VisitStatus | null
  message: string
}

export interface ApplyVisitStatusOptions {
  rejectionReason?: string | null
  paComment?: string | null
  paRole?: 'PA_TO_DIRECTOR' | 'PA_TO_CI' | null
  approvedBy?: string | null
  systemAction?: boolean
  // Legacy fields kept for caller compatibility; the atomic DB function
  // records its own audit entry ('Visit Status Changed').
  auditAction?: string
  auditDetails?: string
}

/**
 * Single source of truth for changing a visit's status.
 *
 * Calls the PostgreSQL function public.update_visit_status_atomic(), which:
 *   - Locks the visit row with SELECT ... FOR UPDATE (concurrency-safe).
 *   - Validates the transition against the actual database status.
 *   - Derives the actor's role from public.user_roles (trusted server data).
 *   - Verifies PA host-membership via public.user_host_assignments.
 *   - Writes the visit update and audit_logs insert in the same transaction.
 *   - Returns explicit outcomes: success, not_found, invalid_transition, authorization.
 *
 * QR generation, approval emails, and notifications are NOT performed here.
 * They are enqueued to the public.outbox table by the caller after a successful
 * outcome, and processed by a separate outbox worker.
 *
 * Authorization is enforced entirely inside the database function. The caller
 * must still authenticate the user (via getCurrentUser) and pass the actor's
 * user id as approvedBy. The function never trusts caller-supplied roles or
 * previous statuses.
 */
export async function applyVisitStatusChange(
  visitId: string,
  newStatus: VisitStatus,
  options: ApplyVisitStatusOptions = {}
): Promise<VisitStatusOutcome> {
  // Demo mode: simulate a successful status change without touching the database.
  // supabaseAdmin is null in demo mode; do not call a null client.
  if (isDemoMode()) {
    return {
      outcome: 'success',
      visit_id: visitId,
      status: newStatus,
      message: 'Demo mode: status change simulated (no database)',
    }
  }

  if (!supabaseAdmin) {
    return {
      outcome: 'authorization',
      visit_id: null,
      status: null,
      message: 'Service role key not configured',
    }
  }

  const { data, error } = await supabaseAdmin.rpc('update_visit_status_atomic', {
    p_visit_id: visitId,
    p_new_status: newStatus,
    p_actor_user_id: options.approvedBy ?? null,
    p_rejection_reason: options.rejectionReason ?? null,
    p_pa_comment: options.paComment ?? null,
    p_pa_role: options.paRole ?? null,
    p_system_action: options.systemAction ?? false,
  })

  if (error) {
    return {
      outcome: 'authorization',
      visit_id: null,
      status: null,
      message: error.message || 'Database error',
    }
  }

  const rows = (data as VisitStatusOutcome[]) ?? []
  const row = rows[0]
  if (!row) {
    return {
      outcome: 'authorization',
      visit_id: null,
      status: null,
      message: 'No outcome returned from database',
    }
  }

  return {
    outcome: row.outcome as VisitStatusOutcome['outcome'],
    visit_id: row.visit_id ?? null,
    status: (row.status ?? null) as VisitStatus | null,
    message: row.message,
  }
}
