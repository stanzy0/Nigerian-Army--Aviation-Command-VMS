-- ============================================================================
-- DRAFT SQL PROPOSAL - NOT APPROVED FOR EXECUTION
-- File: supabase/migrations/drafts/20261026_visitor_badges_visits_atomic_reconciliation.sql
-- Status: REVIEW ONLY - DO NOT APPLY
-- Created: 2026-10-26
-- Purpose: Reconcile schema gaps identified in read-only review
-- Rules: Additive only, preserve data, no appointments restore, no auto-credential generation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CHANGE-BY-CHANGE EXPLANATION
-- ----------------------------------------------------------------------------
-- This is a proposal for human review only. It does NOT modify existing files.
-- Based on:
--   - Existing migrations: 20251024_init_naavc.sql, 20260701_email_logs.sql, 
--     20260703_visitor_badges.sql, 20260726_public_registration.sql, 20260828_pa_approval_comments.sql
--   - Draft: 20261024_atomic_visit_status.sql
--   - App code: app/api/public/status/route.ts, app/api/public/kiosk-checkin/route.ts,
--     lib/server/visit-status.ts, lib/server/outbox-processor.ts, app/api/pa/visits/*
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- PREREQUISITE CHECKS (READ-ONLY - DO NOT EXECUTE)
-- ----------------------------------------------------------------------------
-- Before applying, human must verify via queries (section E):
-- 1. visitor_badges exists with badge_status enum values (Pending,Active,Returned,Expired,Cancelled)
-- 2. visits exists with core columns
-- 3. user_roles, employees, audit_logs exist
-- 4. No appointments table exists (must not be restored)
-- 5. Check current row counts (reported 0 for visits/badges, but code must be safe)
-- 6. Verify no functions with conflicting signatures exist
-- 7. Check if email_logs/outbox already exist

-- ----------------------------------------------------------------------------
-- DEPENDENCIES
-- ----------------------------------------------------------------------------
-- Must run in order: (1) visitor_badges, (2) visits, (3) email_logs, (4) outbox + functions
-- Depends on: badge_status enum (exists), visit_status enum (exists), auth.users, user_roles, employees
-- Does NOT depend on appointments

-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECONCILE VISITOR_BADGES (ADDITIVE, DATA-PRESERVING)
-- ----------------------------------------------------------------------------
-- GOAL: Add qr_token and expires_at as NULLABLE initially. Preserve badge_status enum.
-- DO NOT generate credentials or activate badges automatically.
-- DO NOT change existing badge_status values.
-- App requires qr_token and expires_at for lookups; code checks status=='Active' and expiry.
-- If expires_at IS NULL, endpoints skip expiry check (see routes) - but must not activate badges with missing expiry.

-- Add columns if missing (nullable)
ALTER TABLE public.visitor_badges
  ADD COLUMN IF NOT EXISTS qr_token TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS printed_by UUID REFERENCES public.user_roles(user_id),
  ADD COLUMN IF NOT EXISTS reprint_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- NOTE: Do NOT add UNIQUE/NOT NULL constraints yet. Must backfill first with human approval.
-- NOTE: Do NOT set default values that generate credentials.
-- NOTE: If qr_token already exists, do nothing.
-- NOTE: Preserve existing badge_status enum type usage.

-- Indexes (add if helpful, non-destructive)
CREATE INDEX IF NOT EXISTS idx_visitor_badges_qr_token ON public.visitor_badges(qr_token);
CREATE INDEX IF NOT EXISTS idx_visitor_badges_expires_at ON public.visitor_badges(expires_at);

-- BLOCKED FOR REVIEW: Credential backfill strategy
-- - Human must decide how to generate secure unique qr_token for existing rows (if needed)
-- - Human must decide expiry policy for existing rows (do not guess)
-- - Rows with qr_token NULL will not be found by current hardened endpoints
-- - Must not auto-activate badges with missing expires_at

-- ----------------------------------------------------------------------------
-- 2. RECONCILE VISITS (ADDITIVE, DATA-PRESERVING)
-- ----------------------------------------------------------------------------
-- Add required columns. Permit existing NULL registration_number.
-- OMIT appointment_id (appointments removed). OMIT is_overdue unless verified dependency found.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS registration_number TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS pa_director_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pa_director_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pa_director_comment TEXT,
  ADD COLUMN IF NOT EXISTS pa_ci_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pa_ci_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pa_ci_comment TEXT;

-- Indexes for lookups used by function
CREATE INDEX IF NOT EXISTS idx_visits_registration_number ON public.visits(registration_number);
CREATE INDEX IF NOT EXISTS idx_visits_rejection_reason ON public.visits(rejection_reason);
CREATE INDEX IF NOT EXISTS idx_visits_pa_director_approved_at ON public.visits(pa_director_approved_at);
CREATE INDEX IF NOT EXISTS idx_visits_pa_ci_approved_at ON public.visits(pa_ci_approved_at);

-- NOTE: No UNIQUE constraint added to registration_number without human approval
-- NOTE: Existing NULL registration numbers remain unchanged
-- NOTE: No appointment_id added (module removed)
-- NOTE: is_overdue NOT added (not found in app code)

-- ----------------------------------------------------------------------------
-- 3. RECONCILE EMAIL_LOGS
-- ----------------------------------------------------------------------------
-- Create if missing, matching 20260701_email_logs.sql structure
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  template TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  related_type TEXT,
  related_id UUID,
  sent_by UUID REFERENCES public.user_roles(user_id),
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_email ON public.email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON public.email_logs(template);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_related_type ON public.email_logs(related_type);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies (match existing migration pattern)
DO $$ BEGIN
  CREATE POLICY "Admin can manage email logs"
    ON public.email_logs
    FOR ALL
    TO authenticated
    USING (
      (SELECT role FROM public.user_roles WHERE user_id = (SELECT auth.uid())) = 'Admin'
    )
    WITH CHECK (
      (SELECT role FROM public.user_roles WHERE user_id = (SELECT auth.uid())) = 'Admin'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Security can view email logs"
    ON public.email_logs
    FOR SELECT
    TO authenticated
    USING (
      (SELECT role FROM public.user_roles WHERE user_id = (SELECT auth.uid())) = 'Security'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.email_logs REPLICA IDENTITY FULL;
-- Note: ALTER PUBLICATION supabase_realtime ADD TABLE requires publication to exist

-- ----------------------------------------------------------------------------
-- 4. RECONCILE OUTBOX TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT outbox_event_type_check CHECK (
    event_type IN ('qr_generate', 'approval_email', 'status_notification')
  )
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_scheduled ON public.outbox(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_outbox_event_key ON public.outbox(event_key);

ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages outbox"
    ON public.outbox
    FOR ALL
    USING (false)
    WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 5. FUNCTIONS (BASED ON DRAFT + APP EXPECTATIONS - REVIEW CAREFULLY)
-- ----------------------------------------------------------------------------
-- BLOCKED FOR REVIEW: Function bodies copied from draft for review only.
-- Must verify against live schema and exact app expectations before any execution.
-- Signatures must match lib/server/visit-status.ts and lib/server/outbox-processor.ts exactly.

-- claim_outbox_events
CREATE OR REPLACE FUNCTION public.claim_outbox_events(
  p_batch_size integer DEFAULT 10,
  p_lease_timeout_minutes integer DEFAULT 5,
  p_worker_id text DEFAULT 'worker'
)
RETURNS SETOF public.outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := NOW();
  v_batch_size integer;
  v_lease_minutes integer;
  v_lease_cutoff timestamptz;
BEGIN
  v_batch_size := GREATEST(1, LEAST(COALESCE(p_batch_size, 10), 100));
  v_lease_minutes := GREATEST(1, LEAST(COALESCE(p_lease_timeout_minutes, 5), 60));
  v_lease_cutoff := v_now - (v_lease_minutes || ' minutes')::interval;

  UPDATE public.outbox
  SET status = CASE
        WHEN attempts >= max_attempts THEN 'dead_letter'
        ELSE 'pending'
      END,
      claimed_at = CASE
        WHEN attempts >= max_attempts THEN claimed_at
        ELSE NULL
      END,
      claimed_by = CASE
        WHEN attempts >= max_attempts THEN claimed_by
        ELSE NULL
      END,
      error_message = CASE
        WHEN attempts >= max_attempts THEN
          COALESCE(error_message, '') || ' [lease expired, max attempts reached]'
        ELSE error_message
      END
  WHERE status = 'processing'
    AND (claimed_at IS NULL OR claimed_at < v_lease_cutoff);

  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.outbox o
    WHERE o.status = 'pending'
      AND o.scheduled_at <= v_now
    ORDER BY o.scheduled_at ASC
    LIMIT v_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox o
  SET status = 'processing',
      claimed_at = v_now,
      claimed_by = COALESCE(NULLIF(TRIM(p_worker_id), ''), 'worker'),
      attempts = o.attempts + 1
  FROM claimed c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox_events(integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_outbox_events(integer, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_outbox_events(integer, integer, text) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.claim_outbox_events(integer, integer, text) TO service_role; -- BLOCKED FOR REVIEW

-- update_visit_status_atomic
CREATE OR REPLACE FUNCTION public.update_visit_status_atomic(
  p_visit_id uuid,
  p_new_status visit_status,
  p_actor_user_id uuid DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL,
  p_pa_comment text DEFAULT NULL,
  p_pa_role text DEFAULT NULL,
  p_system_action boolean DEFAULT false
)
RETURNS TABLE (
  outcome text,
  visit_id uuid,
  status visit_status,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status visit_status;
  v_visit_employee_id uuid;
  v_actor_role text;
  v_actor_employee_id uuid;
  v_actor_label text;
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    SELECT role INTO v_actor_role FROM public.user_roles WHERE user_id = p_actor_user_id;
    IF v_actor_role IS NULL THEN
      RETURN QUERY SELECT 'authorization', NULL::uuid, NULL::visit_status, 'Actor not found or has no role';
      RETURN;
    END IF;
    v_actor_label := p_actor_user_id::text;
  ELSIF p_system_action = true THEN
    v_actor_role := 'SYSTEM';
    v_actor_label := 'system:kiosk';
  ELSE
    RETURN QUERY SELECT 'authorization', NULL::uuid, NULL::visit_status, 'Missing actor: null actor requires p_system_action = true';
    RETURN;
  END IF;

  SELECT status, employee_id INTO v_current_status, v_visit_employee_id
  FROM public.visits WHERE id = p_visit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::uuid, NULL::visit_status, 'Visit not found';
    RETURN;
  END IF;

  IF v_actor_role IN ('PA_TO_DIRECTOR', 'PA_TO_CI') THEN
    SELECT e.id INTO v_actor_employee_id FROM public.employees e WHERE e.user_id = p_actor_user_id;
    IF v_actor_employee_id IS NULL OR v_actor_employee_id <> v_visit_employee_id THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Not authorized to manage this visitor';
      RETURN;
    END IF;
  END IF;

  IF p_pa_role IS NOT NULL THEN
    IF v_actor_role = 'Admin' THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Admin cannot set PA approval fields';
      RETURN;
    END IF;
    IF p_pa_role <> v_actor_role THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'p_pa_role does not match verified actor role';
      RETURN;
    END IF;
    IF p_pa_role NOT IN ('PA_TO_DIRECTOR', 'PA_TO_CI') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Invalid p_pa_role value';
      RETURN;
    END IF;
  END IF;

  IF v_current_status = 'pending' THEN
    IF p_new_status NOT IN ('approved', 'rejected') THEN
      RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status, 'Invalid transition from pending';
      RETURN;
    END IF;
    IF v_actor_role NOT IN ('Admin', 'PA_TO_DIRECTOR', 'PA_TO_CI') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Role not authorized to approve or reject';
      RETURN;
    END IF;
  ELSIF v_current_status = 'approved' THEN
    IF p_new_status <> 'checked_in' THEN
      RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status, 'Invalid transition from approved';
      RETURN;
    END IF;
    IF v_actor_role = 'SYSTEM' AND p_system_action = true THEN
      NULL;
    ELSIF v_actor_role NOT IN ('Admin', 'Receptionist', 'Security') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Role not authorized to check in';
      RETURN;
    END IF;
  ELSIF v_current_status = 'checked_in' THEN
    IF p_new_status <> 'checked_out' THEN
      RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status, 'Invalid transition from checked_in';
      RETURN;
    END IF;
    IF v_actor_role NOT IN ('Admin', 'Receptionist', 'Security') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Role not authorized to check out';
      RETURN;
    END IF;
  ELSIF v_current_status IN ('rejected', 'checked_out') THEN
    RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status, 'No further transitions allowed from terminal status';
    RETURN;
  ELSE
    RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status, 'Unexpected current status';
    RETURN;
  END IF;

  UPDATE public.visits SET status = p_new_status, updated_at = NOW() WHERE id = p_visit_id;

  IF p_new_status = 'checked_in' THEN
    UPDATE public.visits SET check_in_time = NOW() WHERE id = p_visit_id;
  ELSIF p_new_status = 'checked_out' THEN
    UPDATE public.visits SET check_out_time = NOW() WHERE id = p_visit_id;
  ELSIF p_new_status = 'rejected' THEN
    UPDATE public.visits SET rejection_reason = p_rejection_reason WHERE id = p_visit_id;
  ELSIF p_new_status = 'approved' THEN
    IF p_pa_role = 'PA_TO_DIRECTOR' THEN
      UPDATE public.visits SET pa_director_approved_at = NOW(), pa_director_approved_by = p_actor_user_id, pa_director_comment = p_pa_comment WHERE id = p_visit_id;
    ELSIF p_pa_role = 'PA_TO_CI' THEN
      UPDATE public.visits SET pa_ci_approved_at = NOW(), pa_ci_approved_by = p_actor_user_id, pa_ci_comment = p_pa_comment WHERE id = p_visit_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details, ip_address, created_at)
  VALUES ('Visit Status Changed', 'visit', p_visit_id::text, v_actor_label,
    jsonb_build_object('from_status', v_current_status, 'to_status', p_new_status, 'actor_role', v_actor_role, 'pa_role', p_pa_role, 'system_action', p_system_action),
    NULL, NOW());

  IF p_new_status = 'approved' THEN
    INSERT INTO public.outbox (event_type, event_key, payload, status)
    VALUES ('qr_generate', 'qr_generate:' || p_visit_id::text, jsonb_build_object('visitId', p_visit_id::text), 'pending')
    ON CONFLICT (event_key) DO NOTHING;
    INSERT INTO public.outbox (event_type, event_key, payload, status)
    VALUES ('approval_email', 'approval_email:' || p_visit_id::text, jsonb_build_object('visitId', p_visit_id::text), 'pending')
    ON CONFLICT (event_key) DO NOTHING;
  END IF;

  INSERT INTO public.outbox (event_type, event_key, payload, status)
  VALUES ('status_notification', 'status_notification:' || p_visit_id::text || ':' || p_new_status::text, jsonb_build_object('visitId', p_visit_id::text, 'status', p_new_status::text), 'pending')
  ON CONFLICT (event_key) DO NOTHING;

  RETURN QUERY SELECT 'success', p_visit_id, p_new_status, 'Status updated successfully';
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.update_visit_status_atomic(uuid, visit_status, uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_visit_status_atomic(uuid, visit_status, uuid, text, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.update_visit_status_atomic(uuid, visit_status, uuid, text, text, text, boolean) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.update_visit_status_atomic(uuid, visit_status, uuid, text, text, text, boolean) TO service_role; -- BLOCKED FOR REVIEW
-- ALTER FUNCTION ... OWNER TO postgres; -- BLOCKED FOR REVIEW

-- ============================================================================
-- END OF DRAFT PROPOSAL - NOT APPROVED FOR EXECUTION
-- ============================================================================
