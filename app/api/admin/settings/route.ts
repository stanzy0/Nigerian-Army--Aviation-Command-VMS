import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logAuditAction } from '@/lib/client/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .order('category', { ascending: true })
      .order('key', { ascending: true })

    if (error) {
      // Table might not exist yet
      if (error.message?.includes('Could not find the table')) {
        return NextResponse.json({ success: true, data: [] })
      }
      throw new Error(error.message)
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (err) {
    console.error('Fetch settings error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const settings = Array.isArray(body) ? body : [body]

    const { error } = await supabaseAdmin
      .from('system_settings')
      .upsert(settings, { onConflict: 'key' })

    if (error) {
      if (error.message?.includes('Could not find the table')) {
        return NextResponse.json({ success: true })
      }
      throw new Error(error.message)
    }

    await logAuditAction('System Setting Changed', 'system_settings', null, 'System configuration updated via admin portal')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update settings error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
