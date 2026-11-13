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
 * GET /api/integration/v1/visitors/{id}
 *
 * Retrieves a single visitor with their associated visits, badges, and host information.
 *
 * Required scope: visitors:read
 * Optional scope: visitor_phone:read (to include phone number)
 *
 * Path parameters:
 *   - id: Visitor UUID
 *
 * Returns detailed visitor information including associated visits and badges.
 * Does NOT expose sensitive document information, emergency contact info, or QR tokens.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const endpoint = '/api/integration/v1/visitors/:id';
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

  // 3. Validate visitor ID (UUID format)
  const { id } = await params;
  if (!id || !isValidUuid(id)) {
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

    return integrationErrorResponse('INVALID_PARAMETER', 'Invalid visitor ID', 400);
  }

  try {
    // 4. Query visitor with visits and badges
    // We do NOT select sensitive columns: qr_token, doc_number, doc_front_url,
    // doc_back_url, issuing_country, emergency_contact, photo_url, nationality, gender,
    // visitor_address, vehicle_plate, vehicle_type, notes, email
    const { data, error } = await supabaseAdmin
      .from('visitors')
      .select(`
        id,
        full_name,
        visitor_organization,
        phone,
        created_at,
        updated_at,
        visit:visits(
          id,
          purpose,
          status,
          scheduled_date,
          check_in_time,
          check_out_time,
          created_at,
          updated_at,
          badges:visitor_badges(
            badge_number,
            badge_status
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      await logApiAccess({
        integrationKeyId: integrationId,
        integrationName,
        endpoint,
        method,
        statusCode: 404,
        outcome: 'client_error',
        requestId: request.headers.get('x-request-id') || null,
        responseTimeMs: Date.now() - startTime,
        resultCount: null,
      });

      return integrationErrorResponse('NOT_FOUND', 'Visitor not found', 404);
    }

    // 5. Map to response DTO
    const visitor = (() => {
      const base = {
        id: data.id,
        full_name: data.full_name || 'Unknown',
        visitor_organization: data.visitor_organization || null,
        created_at: data.created_at || null,
        updated_at: data.updated_at || null,
        visits: (data.visit || []).map((v: {
          id: string;
          purpose: string | null;
          status: string | null;
          scheduled_date: string | null;
          check_in_time: string | null;
          check_out_time: string | null;
          created_at: string | null;
          updated_at: string | null;
          badges: {
            badge_number: string;
            badge_status: string;
          }[] | null;
        }) => ({
          id: v.id,
          purpose: v.purpose || null,
          status: v.status || null,
          scheduled_date: v.scheduled_date || null,
          check_in_time: v.check_in_time || null,
          check_out_time: v.check_out_time || null,
          created_at: v.created_at || null,
          updated_at: v.updated_at || null,
          badges: (v.badges || []).map((b: { badge_number: string; badge_status: string }) => ({
            badge_number: b.badge_number || null,
            badge_status: b.badge_status || null,
          })),
        })),
      };
      if (authResult.scopes.includes('visitor_phone:read')) {
        return { ...base, phone: data.phone || null };
      }
      return base;
    })();

    await logApiAccess({
      integrationKeyId: integrationId,
      integrationName,
      endpoint,
      method,
      statusCode: 200,
      outcome: 'success',
      requestId: request.headers.get('x-request-id') || null,
      responseTimeMs: Date.now() - startTime,
      resultCount: 1,
    });

    return integrationSuccessResponse(visitor, undefined, { limit: rateLimit.limit, remaining: rateLimit.remaining, resetTime: rateLimit.resetTime });
  } catch (err) {
    console.error('[GET /api/integration/v1/visitors/:id] error:', err);
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

/**
 * Validates that a string is a valid UUID v4 format.
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}