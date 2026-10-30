-- ============================================================================
-- PROPOSED MIGRATION: Atomic visit-status transitions + transactional outbox
-- File: supabase/migrations/20261024_atomic_visit_status.sql
-- STATUS: DRAFT ONLY — DO NOT EXECUTE without review and approval.
-- ============================================================================
-- Reconciles with:
--   - 20251024_init_naavc.sql (base schema, visit_status enum, audit_logs)
--   - 20260726_public_registration.sql (registration_number, rejection_reason)
--   - 20260828_pa_approval_comments.sql (pa_director_*, pa_ci_*)
--   - 20260701_email_logs.sql (email_logs table)
--
-- CRITICAL FIX: All error paths use bare RETURN (not just RETURN QUERY) to
-- immediately exit the function. RETURN QUERY alone adds rows to the result
-- set but does NOT terminate execution — subsequent statements would still run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Ensure missing columns exist before any function references them
-- ---------------------------------------------------------------------------
-- NOTE: ADD COLUMN IF NOT EXISTS does NOT verify existing column types or
-- constraints. Live-schema verification is required before deployment.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS registration_number TEXT NULL;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS pa_director_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pa_director_approved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pa_director_comment TEXT NULL,
  ADD COLUMN IF NOT EXISTS pa_ci_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pa_ci_approved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pa_ci_comment TEXT NULL;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_visits_rejection_reason ON public.visits(rejection_reason);
CREATE INDEX IF NOT EXISTS idx_visits_pa_director_approved_at ON public.visits(pa_director_approved_at);
CREATE INDEX IF NOT EXISTS idx_visits_pa_ci_approved_at ON public.visits(pa_ci_approved_at);
CREATE INDEX IF NOT EXISTS idx_visits_is_overdue ON public.visits(is_overdue);

-- ---------------------------------------------------------------------------
-- 1. Outbox table — transactional outbox for QR, email, notifications
-- ---------------------------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_outbox_status_scheduled
  ON public.outbox(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_outbox_event_key
  ON public.outbox(event_key);

ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages outbox"
    ON public.outbox
    FOR ALL
    USING (false)
    WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------------------------
-- 1b. Outbox claim function — safe concurrent claiming with SKIP LOCKED
-- ---------------------------------------------------------------------------
-- Lease policy:
--   - Events in 'processing' with claimed_at older than p_lease_timeout_minutes
--     are considered abandoned.
--   - Abandoned events with attempts >= max_attempts move to 'dead_letter'.
--   - Abandoned events with attempts < max_attempts reset to 'pending' for retry.
--   - Null claimed_at on a 'processing' event is treated as abandoned (recoverable).
--   - Parameters are clamped to safe bounds.

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
  -- Clamp parameters to safe bounds.
  v_batch_size := GREATEST(1, LEAST(COALESCE(p_batch_size, 10), 100));
  v_lease_minutes := GREATEST(1, LEAST(COALESCE(p_lease_timeout_minutes, 5), 60));
  v_lease_cutoff := v_now - (v_lease_minutes || ' minutes')::interval;

  -- Recover abandoned events: move exhausted to dead_letter, reset others.
  -- Handle null claimed_at: treat as abandoned (recoverable).
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

  -- Claim pending events with SKIP LOCKED for concurrent safety.
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
-- GRANT EXECUTE ON FUNCTION public.claim_outbox_events(integer, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Atomic visit-status transition function
-- ---------------------------------------------------------------------------
-- System action pathway:
--   - Ordinary transitions require a verified actor (p_actor_user_id IS NOT NULL).
--   - System/kiosk actions (approved -> checked_in only) require BOTH:
--       a) p_actor_user_id IS NULL, AND
--       b) p_system_action = TRUE (explicitly set by server-side kiosk code only)
--   - The function itself cannot verify the caller's identity beyond the service
--     role. Security depends on:
--       1. Only service_role can EXECUTE (grant).
--       2. Only server-side code (Next.js API routes) uses the service-role client.
--       3. Browser code uses the anon client and cannot call this function.
--   - API callers must NEVER pass p_system_action = true from user-controlled input.

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
  -- -----------------------------------------------------------------------
  -- Resolve actor identity from trusted server-side table.
  -- Ordinary requests MUST have a verified actor. Null actors are only
  -- allowed when p_system_action = TRUE (explicit server-side kiosk pathway).
  -- -----------------------------------------------------------------------
  IF p_actor_user_id IS NOT NULL THEN
    SELECT role INTO v_actor_role
    FROM public.user_roles
    WHERE user_id = p_actor_user_id;

    IF v_actor_role IS NULL THEN
      RETURN QUERY SELECT 'authorization', NULL::uuid, NULL::visit_status,
        'Actor not found or has no role';
      RETURN;
    END IF;
    v_actor_label := p_actor_user_id::text;
  ELSIF p_system_action = true THEN
    -- System/kiosk pathway: only approved -> checked_in allowed.
    v_actor_role := 'SYSTEM';
    v_actor_label := 'system:kiosk';
  ELSE
    -- Null actor without system_action flag = unauthorized.
    RETURN QUERY SELECT 'authorization', NULL::uuid, NULL::visit_status,
      'Missing actor: null actor requires p_system_action = true';
    RETURN;
  END IF;

  -- Lock the visit row.
  SELECT status, employee_id INTO v_current_status, v_visit_employee_id
  FROM public.visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::uuid, NULL::visit_status,
      'Visit not found';
    RETURN;
  END IF;

  -- PA host-mismatch authorization.
  IF v_actor_role IN ('PA_TO_DIRECTOR', 'PA_TO_CI') THEN
    SELECT e.id INTO v_actor_employee_id
    FROM public.employees e
    WHERE e.user_id = p_actor_user_id;

    IF v_actor_employee_id IS NULL OR v_actor_employee_id <> v_visit_employee_id THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'Not authorized to manage this visitor';
      RETURN;
    END IF;
  END IF;

  -- Enforce p_pa_role matches the verified actor role.
  -- PA metadata cannot be set by non-PA actors or by passing a mismatched role.
  -- Admin cannot set PA approval fields (p_pa_role must be NULL for Admin).
  IF p_pa_role IS NOT NULL THEN
    IF v_actor_role = 'Admin' THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'Admin cannot set PA approval fields';
      RETURN;
    END IF;
    IF p_pa_role <> v_actor_role THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'p_pa_role does not match verified actor role';
      RETURN;
    END IF;
    IF p_pa_role NOT IN ('PA_TO_DIRECTOR', 'PA_TO_CI') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'Invalid p_pa_role value';
      RETURN;
    END IF;
  END IF;

  -- Validate transition and authorize by actor role.
  -- PA approval workflow: either PA_TO_DIRECTOR or PA_TO_CI can independently
  -- approve a pending visit (pending -> approved). Both PA roles are NOT required
  -- sequentially — a single PA approval completes the approval. The pa_role
  -- parameter records which PA performed the approval. This is the intended
  -- policy per the original code and migration 20260828.
  IF v_current_status = 'pending' THEN
    IF p_new_status NOT IN ('approved', 'rejected') THEN
      RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status,
        'Invalid transition from pending';
      RETURN;
    END IF;
    IF v_actor_role NOT IN ('Admin', 'PA_TO_DIRECTOR', 'PA_TO_CI') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'Role not authorized to approve or reject';
      RETURN;
    END IF;

  ELSIF v_current_status = 'approved' THEN
    IF p_new_status <> 'checked_in' THEN
      RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status,
        'Invalid transition from approved';
      RETURN;
    END IF;
    -- System action (kiosk) only allowed for approved -> checked_in.
    IF v_actor_role = 'SYSTEM' AND p_system_action = true THEN
      -- allowed
      NULL;
    ELSIF v_actor_role NOT IN ('Admin', 'Receptionist', 'Security') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'Role not authorized to check in';
      RETURN;
    END IF;

  ELSIF v_current_status = 'checked_in' THEN
    IF p_new_status <> 'checked_out' THEN
      RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status,
        'Invalid transition from checked_in';
      RETURN;
    END IF;
    IF v_actor_role NOT IN ('Admin', 'Receptionist', 'Security') THEN
      RETURN QUERY SELECT 'authorization', p_visit_id, v_current_status,
        'Role not authorized to check out';
      RETURN;
    END IF;

  ELSIF v_current_status IN ('rejected', 'checked_out') THEN
    RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status,
      'No further transitions allowed from terminal status';
    RETURN;

  ELSE
    RETURN QUERY SELECT 'invalid_transition', p_visit_id, v_current_status,
      'Unexpected current status';
    RETURN;
  END IF;

  -- -----------------------------------------------------------------------
  -- ALL VALIDATION PASSED — perform the status update.
  -- -----------------------------------------------------------------------

  UPDATE public.visits
  SET status = p_new_status,
      updated_at = NOW()
  WHERE id = p_visit_id;

  IF p_new_status = 'checked_in' THEN
    UPDATE public.visits SET check_in_time = NOW() WHERE id = p_visit_id;
  ELSIF p_new_status = 'checked_out' THEN
    UPDATE public.visits SET check_out_time = NOW() WHERE id = p_visit_id;
  ELSIF p_new_status = 'rejected' THEN
    UPDATE public.visits SET rejection_reason = p_rejection_reason WHERE id = p_visit_id;
  ELSIF p_new_status = 'approved' THEN
    IF p_pa_role = 'PA_TO_DIRECTOR' THEN
      UPDATE public.visits
      SET pa_director_approved_at = NOW(),
          pa_director_approved_by = p_actor_user_id,
          pa_director_comment = p_pa_comment
      WHERE id = p_visit_id;
    ELSIF p_pa_role = 'PA_TO_CI' THEN
      UPDATE public.visits
      SET pa_ci_approved_at = NOW(),
          pa_ci_approved_by = p_actor_user_id,
          pa_ci_comment = p_pa_comment
      WHERE id = p_visit_id;
    END IF;
  END IF;

  -- Audit record (same transaction).
  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, performed_by, details, ip_address, created_at
  )
  VALUES (
    'Visit Status Changed',
    'visit',
    p_visit_id::text,
    v_actor_label,
    jsonb_build_object(
      'from_status', v_current_status,
      'to_status', p_new_status,
      'actor_role', v_actor_role,
      'pa_role', p_pa_role,
      'system_action', p_system_action
    ),
    NULL,
    NOW()
  );

  -- Transactional outbox events (same transaction).
  IF p_new_status = 'approved' THEN
    INSERT INTO public.outbox (event_type, event_key, payload, status)
    VALUES (
      'qr_generate',
      'qr_generate:' || p_visit_id::text,
      jsonb_build_object('visitId', p_visit_id::text),
      'pending'
    )
    ON CONFLICT (event_key) DO NOTHING;

    INSERT INTO public.outbox (event_type, event_key, payload, status)
    VALUES (
      'approval_email',
      'approval_email:' || p_visit_id::text,
      jsonb_build_object('visitId', p_visit_id::text),
      'pending'
    )
    ON CONFLICT (event_key) DO NOTHING;
  END IF;

  INSERT INTO public.outbox (event_type, event_key, payload, status)
  VALUES (
    'status_notification',
    'status_notification:' || p_visit_id::text || ':' || p_new_status::text,
    jsonb_build_object('visitId', p_visit_id::text, 'status', p_new_status::text),
    'pending'
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN QUERY SELECT 'success', p_visit_id, p_new_status, 'Status updated successfully';
  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ownership and least-privilege grants
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: function runs as owner (postgres), bypassing RLS for the
-- visits update. The service-role client also bypasses RLS independently.
--
-- IMPORTANT: Verify the actual database role used by supabaseAdmin before
-- uncommenting the GRANT. In standard Supabase projects this is 'service_role'.
-- Do not grant to anon, authenticated, or PUBLIC.

ALTER FUNCTION public.update_visit_status_atomic(
  uuid, visit_status, uuid, text, text, text, boolean
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_visit_status_atomic(
  uuid, visit_status, uuid, text, text, text, boolean
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_visit_status_atomic(
  uuid, visit_status, uuid, text, text, text, boolean
) FROM anon;

REVOKE ALL ON FUNCTION public.update_visit_status_atomic(
  uuid, visit_status, uuid, text, text, text, boolean
) FROM authenticated;

-- Uncomment after verifying the live database role:
-- GRANT EXECUTE ON FUNCTION public.update_visit_status_atomic(
--   uuid, visit_status, uuid, text, text, text, boolean
-- ) TO service_role;

-- Also grant for claim_outbox_events:
-- GRANT EXECUTE ON FUNCTION public.claim_outbox_events(integer, integer, text)
--   TO service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS / FORCE RLS review notes
-- ---------------------------------------------------------------------------
-- a) FORCE RLS: ALTER TABLE public.visits FORCE ROW LEVEL SECURITY;
--    Verify owner BYPASSRLS attribute before enabling.
-- b) Service-role DB user needs: EXECUTE on function + BYPASSRLS (or ownership).
-- c) Outbox table: RLS enabled, deny-all policy. Service-role only.
-- d) Audit logs: existing policy allows any authenticated insert. Consider
--    restricting to service-role for defense-in-depth (separate migration).
-- e) Live-schema verification required for all columns listed in section 0.

-- ---------------------------------------------------------------------------
-- 5. Outbox processor deployment notes
-- ---------------------------------------------------------------------------
-- - Call POST /api/outbox/process with Authorization: Bearer <OUTBOX_PROCESSOR_SECRET>
-- - Set OUTBOX_PROCESSOR_SECRET in deployment environment (min 32 chars).
-- - Configure a scheduler (Vercel cron, Supabase pg_cron, or external).
-- - Monitor dead_letter status for exhausted events.

-- ---------------------------------------------------------------------------
-- 6. Email idempotency
-- ---------------------------------------------------------------------------
-- Proposed unique constraint on email_logs (related_type, related_id, template).
-- WARNING: Will fail if existing duplicates exist. Verify first:
--   SELECT related_type, related_id, template, COUNT(*)
--   FROM public.email_logs GROUP BY related_type, related_id, template
--   HAVING COUNT(*) > 1;
-- Uncomment after deduplication:
-- ALTER TABLE public.email_logs
--   ADD CONSTRAINT uq_email_logs_related_template
--   UNIQUE (related_type, related_id, template);
--
-- External email (Resend) cannot guarantee exactly-once without provider
-- idempotency keys. Application-level check is best-effort.

-- ============================================================================
-- END OF DRAFT MIGRATION
-- ============================================================================
