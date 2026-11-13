import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, requireRole } from '@/lib/auth-helpers';
import { isDemoMode } from '@/lib/demo';

function logError(context: string, err: unknown) {
  console.error(`[${context}]`, err instanceof Error ? { message: err.message, stack: err.stack } : err);
}

function errorResponse(message: string, status: number, error?: string) {
  return NextResponse.json({ success: false, message, error: error || message }, { status });
}

function isPostgresNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string }
  return (
    err.code === 'PGRST116' ||
    (typeof err.message === 'string' &&
      (err.message.includes('not found') || err.message.includes('No rows found')))
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status });
    }

    if (!supabaseAdmin) {
      logError('GET /api/badges/[id]', 'Service role key not configured');
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Internal server error' }, { status: 500 });
    }

    const { id } = await params;

    const { data: badge, error } = await supabaseAdmin
      .from('visitor_badges')
      .select(`
        id,
        badge_number,
        badge_status,
        issued_at,
        expires_at,
        printed_at,
        reprint_count,
        created_at,
        updated_at,
        visit_id,
        visit:visits(
          purpose,
          status,
          scheduled_date,
          check_in_time,
          check_out_time,
          visitor:visitors(
            full_name,
            visitor_organization,
            photo_url
          ),
          employee:employees(
            full_name,
            department
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (isPostgresNotFoundError(error)) {
        return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
      }
      logError('GET /api/badges/[id]', { id, error });
      return NextResponse.json({ success: false, message: 'Failed to fetch badge', error: 'Internal server error' }, { status: 500 });
    }

    if (!badge) {
      return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data: badge });
  } catch (err) {
    logError('GET /api/badges/[id]', err);
    return NextResponse.json({ success: false, message: 'Internal server error', error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch (err) {
      logError('POST /api/badges/[id] - JSON parse', err);
      return errorResponse('Invalid request body', 400);
    }

    if (body === null || typeof body !== 'object') {
      return errorResponse('Invalid request body: expected an object', 400);
    }

    const { action } = body as Record<string, unknown>;

    if (typeof action !== 'string') {
      return errorResponse('Invalid action: expected a string', 400);
    }

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true, message: `Demo mode: badge ${action} (not persisted)` });
    }

    if (!supabaseAdmin) {
      logError('POST /api/badges/[id]', 'Service role key not configured');
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Internal server error' }, { status: 500 });
    }

    const authResult = await requireRole(['Admin', 'Receptionist']);
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status });
    }

    if (action === 'print') {
      const { data: badge, error: lookupError } = await supabaseAdmin
        .from('visitor_badges')
        .select('id, reprint_count')
        .eq('id', id)
        .single();

      if (lookupError) {
        if (isPostgresNotFoundError(lookupError)) {
          return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
        }
        logError('POST /api/badges/[id] - print lookup', lookupError);
        return NextResponse.json({ success: false, message: 'Failed to fetch badge', error: 'Internal server error' }, { status: 500 });
      }

      if (!badge) {
        return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
      }

      const currentCount = (badge as { reprint_count: number }).reprint_count ?? 0;

      if (currentCount >= 5) {
        return NextResponse.json({ success: false, message: 'Reprint limit reached', error: 'Reprint limit reached' }, { status: 400 });
      }

      const { error, count } = await supabaseAdmin
        .from('visitor_badges')
        .update({
          printed_at: new Date().toISOString(),
          reprint_count: currentCount + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('reprint_count', currentCount)
        .lt('reprint_count', 5)
        .select('id', { count: 'exact' });

      if (error) {
        logError('POST /api/badges/[id] - print update', error);
        return NextResponse.json({ success: false, message: 'Failed to print badge', error: 'Internal server error' }, { status: 500 });
      }

      if ((count ?? 0) === 0) {
        return NextResponse.json({ success: false, message: 'Reprint limit reached or badge was modified by another request', error: 'Reprint limit reached or concurrent modification' }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Badge printed' });
    }

    if (action === 'reprint') {
      const { data: badge, error: lookupError } = await supabaseAdmin
        .from('visitor_badges')
        .select('id, reprint_count')
        .eq('id', id)
        .single();

      if (lookupError) {
        if (isPostgresNotFoundError(lookupError)) {
          return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
        }
        logError('POST /api/badges/[id] - reprint lookup', lookupError);
        return NextResponse.json({ success: false, message: 'Failed to fetch badge', error: 'Internal server error' }, { status: 500 });
      }

      if (!badge) {
        return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
      }

      const currentCount = (badge as { reprint_count: number }).reprint_count ?? 0;

      if (currentCount >= 5) {
        return NextResponse.json({ success: false, message: 'Reprint limit reached', error: 'Reprint limit reached' }, { status: 400 });
      }

      const { error, count } = await supabaseAdmin
        .from('visitor_badges')
        .update({ printed_at: new Date().toISOString(), reprint_count: currentCount + 1, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('reprint_count', currentCount)
        .lt('reprint_count', 5)
        .select('id', { count: 'exact' });

      if (error) {
        logError('POST /api/badges/[id] - reprint update', error);
        return NextResponse.json({ success: false, message: 'Failed to reprint badge', error: 'Internal server error' }, { status: 500 });
      }

      if ((count ?? 0) === 0) {
        return NextResponse.json({ success: false, message: 'Reprint limit reached or badge was modified by another request', error: 'Reprint limit reached or concurrent modification' }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Badge reprinted' });
    }

    if (action === 'cancel') {
      const { error, count } = await supabaseAdmin
        .from('visitor_badges')
        .update({ badge_status: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id', { count: 'exact' });

      if (error) {
        logError('POST /api/badges/[id] - cancel update', error);
        return NextResponse.json({ success: false, message: 'Failed to cancel badge', error: 'Internal server error' }, { status: 500 });
      }

      if ((count ?? 0) === 0) {
        return NextResponse.json({ success: false, message: 'Badge not found', error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, message: 'Badge cancelled' });
    }

    return NextResponse.json({ success: false, message: 'Invalid action', error: 'Bad request' }, { status: 400 });
  } catch (err) {
    logError('POST /api/badges/[id]', err);
    return NextResponse.json({ success: false, message: 'Internal server error', error: 'Internal server error' }, { status: 500 });
  }
}