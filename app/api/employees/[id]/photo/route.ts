import { NextResponse, NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadEmployeePhoto } from '@/lib/server/employee-photos'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json(
      { success: false, message: authResult.error, error: authResult.error },
      { status: authResult.status }
    )
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, message: 'Server configuration error', error: 'Service role key not configured' },
      { status: 500 }
    )
  }

  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided', error: 'Bad request' },
        { status: 400 }
      )
    }

    const url = await uploadEmployeePhoto(file, `employee-${id}`)
    return NextResponse.json({ data: { url } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    // Validation errors (file type, size) should return 400, storage errors return 500
    const status = message.includes('Only') || message.includes('size') || message.includes('File size') ? 400 : 500
    return NextResponse.json(
      { success: false, message, error: status === 400 ? 'Bad request' : 'Internal server error' },
      { status }
    )
  }
}
