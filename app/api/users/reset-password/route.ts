import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// DISABLED: This legacy, insecure password-reset path has been consolidated into
// the Admin-only endpoint at POST /api/admin/users/reset-password (server-side
// authorization against public.user_roles, crypto-secure temporary passwords,
// forced password change, and safe audit logging). It is intentionally inert so
// no insecure reset path remains reachable.
export async function POST(_request?: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      message: 'Password resets must be performed by an administrator.',
      error: 'Forbidden',
    },
    { status: 403 }
  )
}

export async function GET(_request?: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      message: 'Password resets must be performed by an administrator.',
      error: 'Forbidden',
    },
    { status: 403 }
  )
}