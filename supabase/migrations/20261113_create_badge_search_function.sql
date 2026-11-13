-- Badge search RPC function with parameterized inputs
-- Returns structured JSON with data array and total count
-- SECURITY INVOKER: runs with caller's permissions (service_role bypasses RLS)
-- Only service_role granted EXECUTE

-- Function does not exist yet; CREATE OR REPLACE is safe and idempotent
CREATE OR REPLACE FUNCTION public.search_badges(
    p_search_text TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_page INTEGER DEFAULT 1,
    p_limit INTEGER DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_offset BIGINT;
    v_limit INTEGER;
    v_page INTEGER;
    v_search_pattern TEXT;
    v_status_filter TEXT;
    v_total BIGINT;
    v_data JSONB;
BEGIN
    -- Validate and clamp pagination parameters (prevent overflow)
    v_page := GREATEST(1, COALESCE(p_page, 1));
    v_limit := GREATEST(1, LEAST(1000, COALESCE(p_limit, 20)));
    v_offset := (v_page::BIGINT - 1) * v_limit::BIGINT;

    -- Build safe LIKE pattern: escape backslash FIRST, then % and _ for literal matching
    IF p_search_text IS NOT NULL AND p_search_text <> '' THEN
        v_search_pattern := '%' || 
            REPLACE(REPLACE(REPLACE(p_search_text, '\', '\\'), '%', '\%'), '_', '\_') 
            || '%';
    ELSE
        v_search_pattern := NULL;
    END IF;

    -- Normalize status filter: trim, treat 'all' (case-insensitive) as no filter
    v_status_filter := CASE
        WHEN LOWER(TRIM(COALESCE(p_status, ''))) = 'all' THEN NULL
        ELSE NULLIF(TRIM(COALESCE(p_status, '')), '')
    END;

    -- Stage 1: Calculate total count from all matching records (before pagination)
    SELECT COUNT(*) INTO v_total
    FROM public.visitor_badges vb
    JOIN public.visits v ON vb.visit_id = v.id
    LEFT JOIN public.visitors vis ON v.visitor_id = vis.id
    LEFT JOIN public.employees e ON v.employee_id = e.id
    WHERE
        (v_search_pattern IS NULL
            OR vb.badge_number ILIKE v_search_pattern
            OR vb.qr_token ILIKE v_search_pattern
            OR vis.full_name ILIKE v_search_pattern
            OR vis.visitor_organization ILIKE v_search_pattern
            OR e.full_name ILIKE v_search_pattern)
        AND (v_status_filter IS NULL OR vb.badge_status = v_status_filter);

    -- Stage 2: Retrieve only the requested page of matching records
    -- Include sort columns in subquery so outer aggregate can reference them
    SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_created_at DESC, sort_id DESC), '[]'::jsonb)
    INTO v_data
    FROM (
        SELECT
            jsonb_build_object(
                'id', vb.id,
                'badge_number', vb.badge_number,
                'badge_status', vb.badge_status,
                'issued_at', vb.issued_at,
                'expires_at', vb.expires_at,
                'printed_at', vb.printed_at,
                'reprint_count', vb.reprint_count,
                'created_at', vb.created_at,
                'updated_at', vb.updated_at,
                'visit', jsonb_build_object(
                    'id', v.id,
                    'purpose', v.purpose,
                    'status', v.status,
                    'scheduled_date', v.scheduled_date,
                    'check_in_time', v.check_in_time,
                    'check_out_time', v.check_out_time,
                    'created_at', v.created_at,
                    'visitor', jsonb_build_object(
                        'full_name', vis.full_name,
                        'visitor_organization', vis.visitor_organization,
                        'photo_url', vis.photo_url
                    ),
                    'employee', jsonb_build_object(
                        'full_name', e.full_name,
                        'department', e.department
                    )
                )
            ) AS row_data,
            vb.created_at AS sort_created_at,
            vb.id AS sort_id
        FROM public.visitor_badges vb
        JOIN public.visits v ON vb.visit_id = v.id
        LEFT JOIN public.visitors vis ON v.visitor_id = vis.id
        LEFT JOIN public.employees e ON v.employee_id = e.id
        WHERE
            (v_search_pattern IS NULL
                OR vb.badge_number ILIKE v_search_pattern
                OR vb.qr_token ILIKE v_search_pattern
                OR vis.full_name ILIKE v_search_pattern
                OR vis.visitor_organization ILIKE v_search_pattern
                OR e.full_name ILIKE v_search_pattern)
            AND (v_status_filter IS NULL OR vb.badge_status = v_status_filter)
        ORDER BY vb.created_at DESC, vb.id DESC
        LIMIT v_limit OFFSET v_offset
    ) sub;

    -- Build final JSON response with both data and total
    RETURN jsonb_build_object(
        'data', v_data,
        'total', v_total
    );
END;
$$;

-- Revoke all default permissions, then grant only to service_role
REVOKE ALL ON FUNCTION public.search_badges(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_badges(TEXT, TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.search_badges(TEXT, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_badges(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- Trigram indexes OMITTED from this migration (pg_trgm schema unknown)
-- Add separately after verifying: SELECT nspname FROM pg_extension WHERE extname = 'pg_trgm';