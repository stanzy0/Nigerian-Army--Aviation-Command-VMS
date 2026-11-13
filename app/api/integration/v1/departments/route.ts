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
 * GET /api/integration/v1/departments
 *
 * Retrieves all departments with optional filtering.
 *
 * Required scope: departments:read
 *
 * Query parameters:
 *   - page: Page number (default: 1)
 *   - limit: Page size (default: 20, max: 100)
 *   - search: Filter by department name (case-insensitive substring)
 *
 * Returns paginated department data.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const endpoint = '/api/integration/v1/departments';
  const method = 'GET';
  let authResult = null as Awaited<ReturnType<typeof authenticateApiKey>> | null;
  let integrationId: string | null = null;
  let integrationName: string | null = null;

  // 1. Authenticate via bearer token
  authResult = await authenticateApiKey(
    request.headers.get('authorization')?.replace('Bearer ', '') || '',
    'departments:read'
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

  // 3. Parse and validate query parameters
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
  const search = searchParams.get('search') || undefined;

  try {
    // 4. Query departments
    let query = supabaseAdmin
      .from('departments')
      .select('id, name, created_at', { count: 'exact' })
      .order('name', { ascending: true });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error, count } = await query.range(
      (page - 1) * limit,
      page * limit - 1
    );

    if (error) {
      console.error('[GET /api/integration/v1/departments] error:', error.message);
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

      return integrationErrorResponse('INTERNAL_ERROR', 'Failed to fetch departments', 500);
    }

    const departments = data.map((d: { id: string; name: string; created_at: string | null }) => ({
      id: d.id,
      name: d.name,
      created_at: d.created_at || null,
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
      resultCount: departments.length,
    });

    return integrationSuccessResponse(departments, {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    }, { limit: rateLimit.limit, remaining: rateLimit.remaining, resetTime: rateLimit.resetTime });
  } catch (err) {
    console.error('[GET /api/integration/v1/departments] error:', err);
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