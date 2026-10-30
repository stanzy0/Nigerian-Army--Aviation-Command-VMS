import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { logAuditAction } from '@/lib/server/audit'
import { VisitorDocument, DOCUMENT_TYPES, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/types/document'
import { createAdminNotification, createReceptionistNotification, createHostNotification, createSystemNotification } from '@/lib/server/notification-service'
import { requireRole } from '@/lib/auth-helpers'
import { isDemoMode } from '@/lib/demo'

function mapToDocumentVerification(doc: any) {
  return {
    id: doc.id,
    visitor_id: doc.visitor_id,
    visit_id: doc.visit_id || null,
    document_type: doc.document_type,
    document_number: doc.document_number || null,
    document_url: doc.front_image_url || doc.file_url || null,
    back_image_url: doc.back_image_url || null,
    status: doc.verification_status,
    approved_by: doc.verified_by || null,
    approved_at: doc.verified_at || null,
    rejected_reason: doc.verification_notes || null,
    replacement_requested: doc.replacement_requested || false,
    replacement_uploaded: doc.replacement_uploaded || false,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    visitor: doc.visitor,
    visit: doc.visit || null,
  }
}

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, data: [], total: 0 })
  }
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const visitorId = searchParams.get('visitor_id')
    const documentType = searchParams.get('document_type')
    const verificationStatus = searchParams.get('verification_status') || searchParams.get('status')
    const search = searchParams.get('search')
    const department = searchParams.get('department')
    const employee = searchParams.get('employee')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('visitor_documents')
      .select(`
        *,
        visitor:visitors(full_name, email, visitor_organization, photo_url)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (visitorId) query = query.eq('visitor_id', visitorId)
    if (documentType) query = query.eq('document_type', documentType)
    if (verificationStatus) query = query.eq('verification_status', verificationStatus)
    if (search) {
      query = query.or(`document_number.ilike.%${search}%,visitors.full_name.ilike.%${search}%,visitors.visitor_organization.ilike.%${search}%`)
    }
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    const mappedData = (data || []).map(mapToDocumentVerification)

    // Fetch visit data separately for documents that have a visit_id
    const visitIds = [...new Set(mappedData.map((d: { visit_id?: string }) => d.visit_id).filter(Boolean))]
    if (visitIds.length > 0) {
      const { data: visits } = await supabaseAdmin
        .from('visits')
        .select(`
          id,
          status,
          employee:employees(full_name, department)
        `)
        .in('id', visitIds)

      const visitsMap = new Map((visits || []).map((v: any) => [v.id, v]))
      for (const doc of mappedData) {
        if (doc.visit_id && visitsMap.has(doc.visit_id)) {
          doc.visit = visitsMap.get(doc.visit_id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: mappedData.length,
      data: mappedData,
      total: count ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : ''
    console.error('[Documents API] GET error:', { message: errorMessage, stack: errorStack, timestamp: new Date().toISOString() })
    // Return error details in development for debugging
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ success: false, message: errorMessage, error: errorStack }, { status: 500 })
    }
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const visitor_id = formData.get('visitor_id') as string
    const document_type = formData.get('document_type') as string
    const document_number = formData.get('document_number') as string
    const issuing_country = formData.get('issuing_country') as string | null
    const expiry_date = formData.get('expiry_date') as string | null
    const notes = formData.get('notes') as string | null
    const visit_id = formData.get('visit_id') as string | null
    const file = formData.get('file') as File | null

    if (!visitor_id || !document_type || !document_number) {
      return NextResponse.json(
        { error: 'Missing required fields: visitor_id, document_type, document_number' },
        { status: 400 }
      )
    }

    if (!DOCUMENT_TYPES.includes(document_type as any)) {
      return NextResponse.json(
        { error: `Invalid document type. Allowed: ${DOCUMENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    let file_name: string | null = null
    let file_url: string | null = null
    let mime_type: string | null = null
    let file_size: number | null = null

    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        )
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` },
          { status: 400 }
        )
      }

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/-+/g, '-')
      const uniqueFileName = `${visitor_id}/${Date.now()}-${sanitizedName}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('visitor-documents')
        .upload(uniqueFileName, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('visitor-documents')
        .getPublicUrl(uniqueFileName)

      file_name = file.name
      file_url = publicUrlData.publicUrl
      mime_type = file.type
      file_size = file.size
    }

    const { data, error } = await supabaseAdmin
      .from('visitor_documents')
      .insert({
        visitor_id,
        document_type,
        document_number,
        issuing_country: issuing_country || null,
        expiry_date: expiry_date || null,
        visit_id: visit_id || null,
        front_image_url: file_url,
        back_image_url: null,
        file_name,
        file_url,
        mime_type,
        file_size,
        notes: notes || null,
        verification_status: 'Pending',
        verified: false,
        uploaded_by: user.id,
      })
      .select(`
        *,
        visitor:visitors(full_name, email, visitor_organization, photo_url)
      `)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    await logAuditAction(
      'Document Uploaded',
      'visitor_document',
      data.id,
      `Document ${document_type} (${document_number}) uploaded for visitor ${visitor_id}`
    )

    createReceptionistNotification(
      'Document Uploaded',
      `New ${document_type} uploaded by visitor for review.`,
      'info',
      'visitor_document',
      data.id
    ).catch(() => {})

    if (visit_id) {
      supabaseAdmin.from('visits').select('employee_id').eq('id', visit_id).single().then(({ data: visit }: { data: { employee_id?: string } | null }) => {
        if (visit?.employee_id) {
          createHostNotification(
            visit.employee_id,
            'Visitor Documents Uploaded',
            `A visitor has uploaded a ${document_type} for your upcoming visit.`,
            'visitor',
            'visitor_document',
            data.id
          ).catch(() => {})
        }
      })
    }

    return NextResponse.json(mapToDocumentVerification(data), { status: 201 })
  } catch (err) {
    console.error('[Documents API] POST error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
