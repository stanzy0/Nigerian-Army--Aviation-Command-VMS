-- ============================================================================
-- DRAFT SQL PROPOSAL v2 - NOT APPROVED FOR EXECUTION
-- File: supabase/migrations/drafts/20261027_visitor_badges_visits_atomic_reconciliation_v2.sql
-- Status: REVIEW ONLY - DO NOT APPLY
-- Created: 2026-10-27
-- Purpose: Reconcile schema gaps for NA Avn Comd Visitor Management System
-- Based on: existing migrations, app code (lib/server/outbox-processor.ts,
--   lib/server/visit-status.ts, app/api/public/*, app/api/pa/visits/*),
--   and live schema findings (zero rows in visits/visitor_badges)
-- Rules: Additive only, preserve data, no appointments restore,
--   no auto-credential generation, no is_overdue, no registration format
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CHANGE-BY-CHANGE EXPLANATION
-- ----------------------------------------------------------------------------
-- 1. visitor_badges: Add nullable qr_token, expires_at (required by public
--    status and kiosk-checkin endpoints). Preserve badge_status enum.
--    Do NOT generate tokens or set expiry - requires human policy decision.
-- 2. visits: Add registration_number, rejection_reason, PA approval columns.
--    Omit appointment_id (appointments removed by 20260823_remove_appointments_module.sql).
--    Omit is_overdue (no app dependency found).
-- 3. email_logs: Create if missing, matching 20260701_email_logs.sql exactly.
--    Required by outbox processor for approval_email idempotency.
-- 4. outbox: Create if missing, matching lib/server/outbox-processor.ts
--    interface exactly. RLS deny-all (service role only).
-- 5. claim_outbox_events: RPC for processor lease/claim with SKIP LOCKED.
--    Signature: (batch_size, lease_timeout_minutes, worker_id) -> SETOF outbox.
-- 5. update_visit_status_atomic: RPC for status transitions with
--    row locking, PA host verification, audit logging, outbox enqueueing.
--    Signature: (visit_id, new_status, actor_user_id, rejection_reason,
--    pa_comment, pa_role, system_action) -> TABLE(outcome, visit_id, status, message).
-- Grants/ownership: Marked BLOCKED FOR REVIEW - requires DBA verification
-- of service_role existence and permissions before uncommenting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PREREQUISITE CHECKS (READ-ONLY - DO NOT EXECUTE)
-- ----------------------------------------------------------------------------
-- Before applying, human must verify via queries:
-- 1. visitor_badges exists with badge_status enum (Pending,Active,Returned,Expired,Cancelled)
-- 2. visits exists with core columns
-- 3. user_roles, employees, audit_logs exist with expected columns
-- 4. No appointments table exists (20260823_remove_appointments_module.sql dropped it)
-- 5. visit_status enum exists (pending,approved,rejected,checked_in,checked_out)
-- 6. auth.users table exists (FK target for PA approvers)
-- 7. Current row counts (reported 0 for visits/visitor_badges, but migration must be safe for future rows)
-- 8. No conflicting functions/columns already exist
-- 9. service_role exists and has BYPASSRLS (Supabase default)

-- ----------------------------------------------------------------------------
-- DEPENDENCIES
-- ----------------------------------------------------------------------------
-- Order: (1) visitor_badges, (2) visits, (3) email_logs, (4) outbox + functions
-- Depends on: badge_status enum, visit_status enum, auth.users, user_roles, employees, audit_logs
-- Does NOT depend on: appointments, is_overdue, registration_number generation logic

-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECONCILE VISITOR_BADGES (ADDITIVE, DATA-PRESERVING)
-- ----------------------------------------------------------------------------
-- GOAL: Add qr_token and expires_at as NULLABLE. Preserve badge_status enum.
-- DO NOT generate credentials or activate badges automatically.
-- DO NOT change existing badge_status values.
-- App (status/route.ts:53-57, kiosk-checkin/route.ts:57-60) requires
-- qr_token and expires_at for lookup/validation. NULL expires_at is rejected.
-- Status must be exactly 'Active' (string comparison against enum).

ALTER TABLE public.visitor_badges
  ADD COLUMN IF NOT EXISTS qr_token TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS printed_by UUID REFERENCES public.user_roles(user_id),
  ADD COLUMN IF NOT EXISTS reprint_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- NOTE: Do NOT add UNIQUE/NOT NULL constraints yet. Must backfill first with human approval.
-- NOTE: Do NOT set default values that generate credentials.
-- NOTE: If qr_token already exists, do nothing.
-- NOTE: Preserve existing badge_status enum type usage (enum values: Pending,Active,Returned,Expired,Cancelled).

-- Indexes (non-destructive)
CREATE INDEX IF NOT EXISTS idx_visitor_badges_qr_token ON public.visitor_badges(qr_token);
CREATE INDEX IF NOT EXISTS idx_visitor_badges_expires_at ON public.visitor_badges(expires_at);

-- BLOCKED FOR REVIEW: Credential backfill strategy
-- - Human must decide how to generate secure unique qr_token for existing rows (if needed)
-- - Human must decide expiry policy for existing rows (do not guess)
-- - Rows with qr_token NULL will not be found by current hardened endpoints
-- - Must not auto-activate badges with missing expires_at
-- - App validates: qr_token non-empty, status === 'Active', expires_at non-null + valid + > now()

-- ----------------------------------------------------------------------------
-- 2. RECONCILE VISITS (ADDITIVE, DATA-PRESERVING)
-- ----------------------------------------------------------------------------
-- Add required columns. Permit existing NULL registration_number.
-- OMIT appointment_id (appointments removed by 20260823_remove_appointments_module.sql).
-- OMIT is_overdue (no app dependency found in source code).

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
-- NOTE: No appointment_id added (module removed by 20260823_remove_appointments_module.sql)
-- NOTE: is_overdue NOT added (no app dependency found)

-- ----------------------------------------------------------------------------
-- 3. RECONCILE EMAIL_LOGS (MATCHING 20260701_email_logs.sql EXACTLY)
-- ----------------------------------------------------------------------------
-- Required by outbox processor (approval_email idempotency check at lines 160-172).

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

-- RLS policies (match 20260701_email_logs.sql exactly)
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

-- Realtime publication for email_logs.
-- This is OPTIONAL: if the supabase_realtime publication does not exist or
-- cannot be modified, the migration completes successfully but Realtime
-- subscriptions on email_logs will not deliver server-side changes. The email
-- logging and outbox processing are NOT affected by Realtime — those operate
-- via the outbox table and direct RPC calls.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'email_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.email_logs;
    END IF;
  ELSE
    RAISE NOTICE 'supabase_realtime publication does not exist; email_logs Realtime subscription will not be active. This is optional and does not block email logging or outbox processing.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add email_logs to supabase_realtime publication (%). Realtime subscriptions on email_logs may not deliver updates. Continuing migration.', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 4. RECONCILE OUTBOX TABLE (MATCHING lib/server/outbox-processor.ts)
-- ----------------------------------------------------------------------------
-- Interface from outbox-processor.ts lines 20-34, 47-64, 69-106.
-- Event types: 'qr_generate', 'approval_email', 'status_notification' (line 137).
-- Status values: 'pending', 'processing', 'done', 'failed', 'dead_letter' (line 75).

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

-- RLS: deny-all (service role bypasses RLS; only server-side worker should access)
DO $$ BEGIN
  CREATE POLICY "Service role manages outbox"
    ON public.outbox
    FOR ALL
    USING (false)
    WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 5. FUNCTIONS (MATCHING APP EXACTLY)
-- ----------------------------------------------------------------------------
-- Verified against:
--   - lib/server/outbox-processor.ts: claim_outbox_events() call (lines 52-64)
--   - lib/server/visit-status.ts: update_visit_status_atomic() call (lines 89-97)
--   - app/api/pa/visits/[id]/approve/route.ts: paRole, paComment, approvedBy
--   - app/api/pa/visits/[id]/reject/route.ts: rejectionReason, approvedBy
--   - app/api/public/kiosk-checkin/route.ts: systemAction: true

-- ----------------------------------------------------------------------------
-- 5a. claim_outbox_events
-- ----------------------------------------------------------------------------
-- Called by: lib/server/outbox-processor.ts:52-64
-- Signature: (p_batch_size int DEFAULT 10, p_lease_timeout_minutes int DEFAULT 5, p_worker_id text DEFAULT 'worker')
-- Returns: SETOF public.outbox
-- Uses: FOR UPDATE SKIP LOCKED for concurrency safety
-- Lease recovery: resets abandoned 'processing' events (lines 224-243 in original draft)

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

  -- Lease recovery: reset abandoned 'processing' events
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

  -- Claim pending events
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

-- Ownership strategy: prefer 'postgres' (Supabase default superuser). If only
-- 'service_role' exists, fall back to that role. The SECURITY DEFINER function
-- will execute as the owner. Both roles bypass RLS in standard Supabase projects.
DO $$
DECLARE
  v_owner name := 'postgres';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    v_owner := 'service_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_owner) THEN
    RAISE EXCEPTION 'Neither postgres nor service_role exists — create one before applying this migration';
  END IF;
  EXECUTE 'ALTER FUNCTION public.claim_outbox_events(integer, integer, text) OWNER TO ' || v_owner;
END $$;

-- Required: grant EXECUTE to service_role, which is the verified database role
-- used by lib/supabase-admin.ts (SUPABASE_SERVICE_ROLE_KEY). Source-level
-- verification: lib/supabase-admin.ts constructs the client with
-- process.env.SUPABASE_SERVICE_ROLE_KEY (lines 4-11). Live DBA verification:
-- confirm service_role exists and has BYPASSRLS before applying.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_outbox_events(integer, integer, text) TO service_role;
  ELSE
    RAISE EXCEPTION 'service_role does not exist — create it or adjust grants before applying this migration';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5b. update_visit_status_atomic
-- ----------------------------------------------------------------------------
-- Called by: lib/server/visit-status.ts:89-97 (via applyVisitStatusChange)
-- Parameters from call sites:
--   - approve/route.ts: p_pa_role='PA_TO_DIRECTOR'|'PA_TO_CI', p_pa_comment, p_actor_user_id=user.id
--   - reject/route.ts: p_rejection_reason, p_actor_user_id=user.id
--   - kiosk-checkin/route.ts: p_system_action=true, p_actor_user_id=NULL
-- Returns: TABLE(outcome text, visit_id uuid, status visit_status, message text)

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
  -- Resolve actor
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

  -- Lock visit row
  SELECT status, employee_id INTO v_current_status, v_visit_employee_id
  FROM public.visits WHERE id = p_visit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::uuid, NULL::visit_status, 'Visit not found';
    RETURN;
  END IF;

  -- PA host membership check (matches lib/server/pa-helpers.ts getAssignedHostEmployeeForPA)
  -- Resolves host employee via user_host_assignments (NOT employees.user_id directly).
  IF v_actor_role IN ('PA_TO_DIRECTOR', 'PA_TO_CI') THEN
    SELECT uha.employee_id INTO v_actor_employee_id
    FROM public.user_host_assignments uha
    WHERE uha.user_id = p_actor_user_id
    LIMIT 1;
    IF v_actor_employee_id IS NULL OR v_actor_employee_id <> v_visit_employee_id THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status, 'Not authorized to manage this visitor';
      RETURN;
    END IF;
  END IF;

  -- PA role validation
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

  -- Transition validation (matches VALID_TRANSITIONS in visit-status.ts)
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
    -- Kiosk pathway: SYSTEM + p_system_action=true only for approved->checked_in.
    -- SECURITY NOTE: The function cannot identify which API endpoint invoked it.
    -- Any caller with service_role EXECUTE privileges can set p_system_action=true.
    -- Defense relies on: (1) only service_role can EXECUTE, (2) only server-side
    -- code uses the service-role client, (3) browser code uses anon client.
    -- The kiosk route (app/api/public/kiosk-checkin/route.ts) additionally
    -- validates badge_status, expires_at, and visit status BEFORE calling RPC.
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

  -- Apply status change
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

  -- Audit logging (matches visit-status.ts documentation)
  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details, ip_address, created_at)
  VALUES ('Visit Status Changed', 'visit', p_visit_id::text, v_actor_label,
    jsonb_build_object('from_status', v_current_status, 'to_status', p_new_status, 'actor_role', v_actor_role, 'pa_role', p_pa_role, 'system_action', p_system_action),
    NULL, NOW());

  -- Outbox enqueueing (matches visit-status.ts documentation and outbox schema)
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

-- Ownership strategy: prefer 'postgres' (Supabase default superuser). If only
-- 'service_role' exists, fall back to that role. The SECURITY DEFINER function
-- will execute as the owner, bypassing RLS for visits/outbox/audit_logs writes.
-- DBA must verify: this is an intentionally privileged function that should
-- only be callable by trusted server-side code via the service_role database role.
DO $$
DECLARE
  v_owner name := 'postgres';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    v_owner := 'service_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_owner) THEN
    RAISE EXCEPTION 'Neither postgres nor service_role exists — create one before applying this migration';
  END IF;
  EXECUTE 'ALTER FUNCTION public.update_visit_status_atomic(uuid, visit_status, uuid, text, text, text, boolean) OWNER TO ' || v_owner;
END $$;

-- Required: grant EXECUTE to service_role. This is the verified database role
-- used by lib/supabase-admin.ts (SUPABASE_SERVICE_ROLE_KEY, lines 4-11).
-- Ownership and EXECUTE permission are deliberately separated: ownership
-- controls the SECURITY DEFINER execution identity; the GRANT controls who
-- can call the function.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.update_visit_status_atomic(uuid, visit_status, uuid, text, text, text, boolean) TO service_role;
  ELSE
    RAISE EXCEPTION 'service_role does not exist — create it or adjust grants before applying this migration';
  END IF;
END $$;

-- ============================================================================
-- END OF DRAFT PROPOSAL v2 - NOT APPROVED FOR EXECUTION
-- ============================================================================
-- ============================================================================
-- BLOCKERS REQUIRING HUMAN RESOLUTION
-- ============================================================================
-- 1. BADGE CREDENTIAL BACKFILL (visitor_badges.qr_token, expires_at)
--    - Current live table has zero rows, but migration must be safe for future rows.
--    - Policy needed: How to generate cryptographically secure qr_token (min 32 bytes)?
--    - Policy needed: What expiry duration for existing badges?
--    - Must NOT auto-activate badges with NULL expires_at.
--    - DBA decision required before UNIQUE/NOT NULL constraints added.
--
-- 2. REGISTRATION NUMBER UNIQUENESS
--    - registration_number column added as nullable TEXT (no UNIQUE).
--    - No generation logic exists in app code.
--    - Human decision: UNIQUE constraint? Generation logic (app-side or DB trigger)?
--    - Existing NULLs permitted.
--
-- 3. service_role BYPASSRLS (CRITICAL)
--    - Both functions GRANT EXECUTE to service_role conditionally.
--    - DBA must verify: service_role exists and has BYPASSRLS attribute.
--    - Without BYPASSRLS, the SECURITY DEFINER functions cannot bypass RLS
--      on visits/outbox tables during server-side operations.
--    Verify: SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname='service_role';
--
-- 4. user_host_assignments TABLE EXISTS
--    - update_visit_status_atomic PA host check queries user_host_assignments.
--    - Created by 20260817_pa_ci_assignment.sql but requires live verification.
--    Verify: SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='user_host_assignments';
--
-- 5. EXISTING FUNCTIONS (CREATE OR REPLACE conflict check)
--    - If claim_outbox_events or update_visit_status_atomic already exist with
--      different signatures, CREATE OR REPLACE will fail.
--    Verify: SELECT proname, pg_get_function_arguments(p.oid) FROM pg_proc p
--             JOIN pg_namespace n ON p.pronamespace=n.oid
--             WHERE n.nspname='public' AND p.proname IN ('claim_outbox_events','update_visit_status_atomic');
--
-- 6. REALTIME PUBLICATION (OPTIONAL)
--    - supabase_realtime publication optional for email_logs.
--    - If missing, Realtime subscriptions on email_logs won't deliver updates.
--    - This does NOT block the migration; behavior is explicitly NOTICE-only.
--    Verify: SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime');
--
-- 7. KIOSK p_system_action IMPERSONATION (DOCUMENTED RISK)
--    - Any caller with service_role EXECUTE can set p_system_action=true.
--    - The function cannot determine which API endpoint invoked it.
--    - Mitigation: only server-side code uses the service-role client;
--      kiosk route pre-validates badge_status, expires_at, and visit status.
--    - No source-code-based fix available without architectural change.
--
-- ============================================================================
-- VERIFICATION QUERIES (READ-ONLY - FOR HUMAN EXECUTION)
-- ============================================================================
-- Run these in Supabase SQL Editor to verify preconditions:
-- 1. SELECT typname, enumlabel FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid WHERE t.typname IN ('visit_status','badge_status') ORDER BY t.typname, e.enumsortorder;
-- 2. SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='visits' ORDER BY ordinal_position;
-- 3. SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='visitor_badges' ORDER BY ordinal_position;
-- 4. SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime');
-- 5. SELECT proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN ('claim_outbox_events','update_visit_status_atomic');
-- 6. SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('service_role','postgres','anon','authenticated');
-- 7. SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('appointments','email_logs','outbox');
-- 8. SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_roles' AND column_name='user_id';
-- ============================================================================
-- END OF PROPOSAL
-- ============================================================================