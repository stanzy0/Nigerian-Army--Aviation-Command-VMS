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

/**
 * GET /api/integration/v1/visitors
 *
 * Retrieves a paginated list of visitors with optional filtering.
 *
 * Required scope: visitors:read
 * Optional additional scope: visitor_phone:read
 *
 * Query parameters:
 *   - page: Page number (default: 1)
 *   - limit: Page size (default: 20, max: 100)
 *   - search: Filter by visitor full name (case-insensitive substring match)
 *   - phone: Filter by visitor phone number (requires visitor_phone:read scope)
 *   - from: Filter by created_at >= this ISO date/time
 *   - to: Filter by created_at <= this ISO date/time
 *
 * Returns paginated visitor data without exposing sensitive fields.
 * Does NOT expose: qr_token, doc_number, doc_front_url, doc_back_url,
 *   issuing_country, emergency_contact, photo_url, nationality, gender,
 *   visitor_address, vehicle_plate, vehicle_type, notes, email, or other sensitive fields.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const endpoint = '/api/integration/v1/visitors';
  const method = 'GET';
  let authResult = null as Awaited<ReturnType<typeof authenticateApiKey>> | null;
  let integrationId: string | null = null;
  let integrationName: string | null = null;

  // 1. Authenticate via bearer token
  authResult = await authenticateApiKey(
    request.headers.get('authorization')?.replace('Bearer ', '') || '',
    'visitors:read'
  );
  integrationId = authResult.integrationId;
  integrationName = authResult.integrationName;

  if (!authResult.authorized) {
    const status = authResult.status;
    const outcome = status === 403 ? 'auth_failure' : 'auth_failure';
    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: status,
      outcome,
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

  // 3. Parse and validate query parameters
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
  const search = searchParams.get('search') || undefined;
  const phone = searchParams.get('phone') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  // Validate phone scope if phone filter is provided
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

  // Validate date parameters
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (from) {
    const parsed = new Date(from);
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

      return integrationErrorResponse('INVALID_PARAMETER', 'Invalid from date format', 400);
    }
    startDate = parsed;
  }

  if (to) {
    const parsed = new Date(to);
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

      return integrationErrorResponse('INVALID_PARAMETER', 'Invalid to date format', 400);
    }
    parsed.setHours(23, 59, 59, 999); // End of day
    endDate = parsed;
  }

  if (startDate && endDate && startDate > endDate) {
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

    return integrationErrorResponse('INVALID_PARAMETER', 'from date must be before to date', 400);
  }

  try {
    // 4. Query visitors - only select approved fields
    let query = supabaseAdmin
      .from('visitors')
      .select('id, full_name, visitor_organization, phone, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('full_name', `%${search}%`);
    }

    if (phone) {
      query = query.ilike('phone', `%${phone}%`);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1);

    if (error) {
      console.error('[GET /api/integration/v1/visitors] error:', error.message);
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

      return integrationErrorResponse('INTERNAL_ERROR', 'Failed to fetch visitors', 500);
    }

    // 5. Map to response DTO - only approved fields
    const visitors = (data || []).map((v: {
      id: string;
      full_name: string | null;
      visitor_organization: string | null;
      phone: string | null;
      created_at: string | null;
      updated_at: string | null;
    }) => {
      const base = {
        id: v.id,
        full_name: v.full_name || 'Unknown',
        visitor_organization: v.visitor_organization || null,
        created_at: v.created_at || null,
        updated_at: v.updated_at || null,
      };
      if (authResult.scopes.includes('visitor_phone:read')) {
        return { ...base, phone: v.phone || null };
      }
      return base;
    });

    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: 200,
      outcome: 'success',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: visitors.length,
    });

    return integrationSuccessResponse(visitors, {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    }, { limit: rateLimit.limit, remaining: rateLimit.remaining, resetTime: rateLimit.resetTime });
  } catch (err) {
    console.error('[GET /api/integration/v1/visitors] error:', err);
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