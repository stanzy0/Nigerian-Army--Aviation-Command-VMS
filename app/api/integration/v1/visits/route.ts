import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticateApiKey } from '@/lib/server/integration-auth';
import { checkRateLimit } from '@/lib/server/integration-rate-limit';
import { logApiAccess } from '@/lib/server/integration-audit';
import {
  integrationErrorResponse,
  integrationSuccessResponse,
  integrationRateLimitResponse,
} from '@/lib/server/integration-response';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const endpoint = '/api/integration/v1/visits';
  const method = 'GET';
  let authResult = null as Awaited<ReturnType<typeof authenticateApiKey>> | null;
  let integrationId: string | null = null;
  let integrationName: string | null = null;

  // 1. Authenticate via bearer token
  authResult = await authenticateApiKey(
    request.headers.get('authorization')?.replace('Bearer ', '') || '',
    'visits:read'
  );
  integrationId = authResult.integrationId;
  integrationName = authResult.integrationName;

  if (!authResult.authorized) {
    const status = authResult.status;
    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: status,
      outcome: 'auth_failure',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: null,
    });

    return integrationErrorResponse(
      status === 403 ? 'INSUFFICIENT_SCOPE' : 'UNAUTHORIZED',
      authResult.error || 'Authentication required',
      status
    );
  }

  // 2. Rate limit check
  const rateLimit = await checkRateLimit(authResult.integrationId!, 100, 60);
  if (!rateLimit.allowed) {
    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: 429,
      outcome: 'rate_limited',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: null,
    });

    return integrationRateLimitResponse(rateLimit.resetTime, rateLimit.limit, rateLimit.currentCount);
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
  const statusParam = searchParams.get('status') || undefined;
  const visitorId = searchParams.get('visitor_id') || undefined;
  const visitDate = searchParams.get('visit_date') || undefined;
  const search = searchParams.get('search') || undefined;
  const phone = searchParams.get('phone') || undefined;

  // Parse date parameters
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (visitDate) {
    const parsed = new Date(visitDate);
    if (isNaN(parsed.getTime())) {
      await logApiAccess({
        integrationKeyId: integrationId,
        integrationName,
        endpoint,
        method,
        statusCode: 400,
        outcome: 'client_error',
        requestId: request.headers.get('x-request-id') || null,
        responseTimeMs: Date.now() - startTime,
        resultCount: null,
      });

      return integrationErrorResponse('INVALID_PARAMETER', 'Invalid visit_date format', 400);
    }
    startDate = parsed;
    // Set end date to end of the same day
    endDate = new Date(parsed);
    endDate.setHours(23, 59, 59, 999);
  }

  if (phone && !authResult.scopes.includes('visitor_phone:read')) {
    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: 403,
      outcome: 'auth_failure',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: null,
    });

    return integrationErrorResponse(
      'INSUFFICIENT_SCOPE',
      'The visitor_phone:read scope is required to filter by phone number',
      403
    );
  }

  try {
    // Query visits with explicit field selection - no sensitive fields
    // We do NOT select: notes, photo_url, nationality, gender, emergency_contact,
    // doc_number, doc_front_url, doc_back_url, qr_token, qr_code,
    // visitor_address, vehicle_plate, vehicle_type, email
    let query = supabaseAdmin
      .from('visits')
      .select(
        'id, visitor_id, employee_id, purpose, status, scheduled_date, check_in_time, check_out_time, created_at, updated_at, visitor:visitors(full_name, visitor_organization), employee:employees(full_name, department), badges:visitor_badges(badge_number, badge_status)',
        { count: 'exact' }
      )
      .order('scheduled_date', { ascending: false });

    if (statusParam) {
      query = query.eq('status', statusParam);
    }

    if (visitorId) {
      query = query.eq('visitor_id', visitorId);
    }

    if (startDate) {
      query = query.gte('scheduled_date', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('scheduled_date', endDate.toISOString());
    }

    if (search) {
      query = query.ilike('visitor.full_name', `%${search}%`);
    }

    if (phone) {
      query = query.ilike('visitor.phone', `%${phone}%`);
    }

    const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1);

    if (error) {
      console.error('[GET /api/integration/v1/visits] error:', error.message);
      await logApiAccess({
        integrationKeyId: integrationId,
        integrationName,
        endpoint,
        method,
        statusCode: 500,
        outcome: 'server_error',
        requestId: request.headers.get('x-request-id') || null,
        responseTimeMs: Date.now() - startTime,
        resultCount: null,
      });

      return integrationErrorResponse('INTERNAL_ERROR', 'Failed to fetch visits', 500);
    }

    const visitsData = (data || []).map((v: {
      id: string;
      visitor_id: string;
      employee_id: string | null;
      purpose: string | null;
      status: string | null;
      scheduled_date: string | null;
      check_in_time: string | null;
      check_out_time: string | null;
      created_at: string | null;
      updated_at: string | null;
      visitor: { full_name: string | null; visitor_organization: string | null } | null;
      employee: { full_name: string | null; department: string | null } | null;
      badges: Array<{ badge_number: string | null; badge_status: string | null }>;
    }) => ({
      id: v.id,
      purpose: v.purpose || null,
      status: v.status || null,
      scheduled_date: v.scheduled_date || null,
      check_in_time: v.check_in_time || null,
      check_out_time: v.check_out_time || null,
      created_at: v.created_at || null,
      updated_at: v.updated_at || null,
      visitor: v.visitor
        ? {
            full_name: v.visitor.full_name || null,
            visitor_organization: v.visitor.visitor_organization || null,
          }
        : null,
      employee: v.employee
        ? {
            full_name: v.employee.full_name || null,
            department: v.employee.department || null,
          }
        : null,
      badges: (v.badges || []).map((b: { badge_number: string | null; badge_status: string | null }) => ({
        badge_number: b.badge_number || null,
        badge_status: b.badge_status || null,
      })),
    }));

    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: 200,
      outcome: 'success',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: visitsData.length,
    });

    return integrationSuccessResponse(visitsData, {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    }, { limit: rateLimit.limit, remaining: rateLimit.remaining, resetTime: rateLimit.resetTime });
  } catch (err) {
    console.error('[GET /api/integration/v1/visits] error:', err);
    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: 500,
      outcome: 'server_error',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: null,
    });

    return integrationErrorResponse('INTERNAL_ERROR', 'Something went wrong. Please try again.', 500);
  }
}