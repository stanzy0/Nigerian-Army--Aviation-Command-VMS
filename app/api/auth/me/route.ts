import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      data: {
        id: 'demo-admin',
        email: 'demo.admin@local',
        full_name: 'Demo Admin (Sample)',
        role: 'Admin',
        created_at: new Date().toISOString(),
        must_change_password: false,
      }
    })
  }

  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Service role not configured' },
        { status: 500 }
      )
    }

    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, full_name, created_at, must_change_password')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleError) {
      console.error('[api/auth/me] user_roles query failed:', { error: roleError, userId: user.id })
      return NextResponse.json(
        { success: false, error: 'Failed to fetch role' },
        { status: 500 }
      )
    }

    if (!userRole) {
      return NextResponse.json({
        success: true,
        data: {
          id: user.id,
          email: user.email || '',
          full_name: null,
          role: null,
          created_at: null,
          missingRole: true,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email || '',
        full_name: userRole.full_name,
        role: userRole.role,
        created_at: userRole.created_at,
        must_change_password: userRole.must_change_password ?? false,
      }
    })
  } catch (err) {
    console.error('[api/auth/me] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}