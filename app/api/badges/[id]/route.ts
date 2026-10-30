import { NextResponse, NextRequest } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const { id } = await params

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { data, error } = await supabaseAdmin
      .from('visitor_badges')
      .select('*, visit:visits(*, visitor:visitors(full_name, visitor_organization, photo_url), employee:employees(full_name, department))')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    let body
    try {
      body = await request.json()
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : 'Invalid JSON body',
        },
        { status: 400 }
      )
    }

    const { action } = body

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: `Demo mode: badge ${action} (not persisted)`,
      })
    }

    const authResult = await requireRole(['Admin', 'Receptionist'])
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    if (action === 'print') {
      const { data: badge } = await supabaseAdmin
        .from('visitor_badges')
        .select('reprint_count')
        .eq('id', id)
        .single()

      if (!badge) {
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
      }

      const { error } = await supabaseAdmin
        .from('visitor_badges')
        .update({
          printed_at: new Date().toISOString(),
          printed_by: null,
          reprint_count: (badge as { reprint_count: number }).reprint_count + 1,
        })
        .eq('id', id)

      if (error) {
        return NextResponse.json({ success: false, message: error.message, error: error.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: 'Badge printed' })
    }

    if (action === 'reprint') {
      const { data: badge } = await supabaseAdmin
        .from('visitor_badges')
        .select('reprint_count')
        .eq('id', id)
        .single()

      if (!badge) {
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
      }

      const { error } = await supabaseAdmin
        .from('visitor_badges')
        .update({
          printed_at: new Date().toISOString(),
          printed_by: null,
          reprint_count: (badge as { reprint_count: number }).reprint_count + 1,
        })
        .eq('id', id)

      if (error) {
        return NextResponse.json({ success: false, message: error.message, error: error.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: 'Badge reprinted' })
    }

    if (action === 'cancel') {
      const { error } = await supabaseAdmin
        .from('visitor_badges')
        .update({ badge_status: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        return NextResponse.json({ success: false, message: error.message, error: error.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: 'Badge cancelled' })
    }

    return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
  } catch (err) {
    console.error('Badge action error:', err)

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
