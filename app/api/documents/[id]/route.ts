import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { logAuditAction } from '@/lib/server/audit'
import { VisitorDocument, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/types/document'
import { approveDocument, rejectDocument, requestReplacement, markReplacementUploaded } from '@/lib/server/document-verification'
import { createAdminNotification, createReceptionistNotification, createHostNotification, createSystemNotification } from '@/lib/server/notification-service'

function mapToDocumentVerification(doc: VisitorDocument) {
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
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { id } = await params

    const { data, error } = await supabaseAdmin!
      .from('visitor_documents')
      .select(`
        *,
        visitor:visitors(full_name, email, visitor_organization, photo_url)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
    }

    return NextResponse.json(mapToDocumentVerification(data))
  } catch (err) {
    console.error('[Documents API] GET error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { id } = await params
    const body = await request.json()

    const allowedFields = [
      'document_type',
      'document_number',
      'issuing_country',
      'expiry_date',
      'notes',
      'verification_status',
      'verification_notes',
      'verified_by',
      'verified_at',
      'verified',
    ]

    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (body.verification_status && ['Pending', 'Verified', 'Rejected'].includes(body.verification_status)) {
      updates.verification_status = body.verification_status
      updates.verified = body.verification_status === 'Verified'
      if (body.verification_status === 'Verified') {
        updates.verified_by = user.id
        updates.verified_at = new Date().toISOString()
      }
    }

    const { data, error } = await supabaseAdmin!
      .from('visitor_documents')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        visitor:visitors(full_name, email, visitor_organization, photo_url)
      `)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    const action = body.verification_status === 'Verified'
      ? 'Document Verified'
      : body.verification_status === 'Rejected'
        ? 'Document Rejected'
        : 'Document Updated'

    await logAuditAction(action, 'visitor_document', id, `Document ${id} ${action.toLowerCase()}`)

    return NextResponse.json(mapToDocumentVerification(data))
  } catch (err) {
    console.error('[Documents API] PATCH error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { id } = await params

    const { data: existing } = await supabaseAdmin!
      .from('visitor_documents')
      .select('file_url, visitor_id')
      .eq('id', id)
      .single()

    if (existing?.file_url) {
      const path = existing.file_url.split('/visitor-documents/')[1]
      if (path) {
        await supabaseAdmin!.storage.from('visitor-documents').remove([path])
      }
    }

    const { error } = await supabaseAdmin!
      .from('visitor_documents')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    await logAuditAction('Document Deleted', 'visitor_document', id, `Document ${id} deleted`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Documents API] DELETE error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const admin = supabaseAdmin

    const { id } = await params

    const contentType = request.headers.get('content-type') || ''
    const isFormData = contentType.includes('multipart/form-data')

    let action: string
    let file: File | null = null
    let mimeType: string | null = null
    let notes: string | null = null
    let reason: string | null = null

    if (isFormData) {
      const formData = await request.formData()
      action = formData.get('action') as string
      file = formData.get('file') as File | null
      mimeType = formData.get('mime_type') as string | null
      notes = formData.get('notes') as string | null
      reason = formData.get('reason') as string | null
    } else {
      const body = await request.json()
      action = body.action
      notes = body.notes || null
      reason = body.reason || null
    }

    const { data: existing, error: lookupError } = await admin
      .from('visitor_documents')
      .select('*')
      .eq('id', id)
      .single()

    if (lookupError || !existing) {
      return NextResponse.json({ success: false, message: 'Document not found', error: 'Document not found', details: lookupError?.message || 'No matching document found' }, { status: 404 })
    }

    if (action === 'approve') {
      try {
        const document = await approveDocument(id, user.id, notes || undefined)
        await logAuditAction('Document Approved', 'visitor_document', id, `Document ${existing.document_type} approved for visitor ${existing.visitor_id}`)

        admin.from('visitor_documents').select('visitor_id, visit_id').eq('id', id).single().then(({ data: doc }: { data: { visitor_id: string; visit_id: string | null } | null }) => {
          if (doc?.visit_id) {
            admin.from('visits').select('employee_id').eq('id', doc.visit_id).single().then(({ data: visit }: { data: { employee_id: string } | null }) => {
              if (visit?.employee_id) {
                createHostNotification(
                  visit.employee_id,
                  'Visitor Documents Approved',
                  `Documents for your visitor have been approved.`,
                  'visitor',
                  'visitor_document',
                  id
                ).catch(() => {})
            }
          })
        }
        if (doc?.visitor_id) {
          admin.from('visitors').select('email').eq('id', doc.visitor_id).single().then(({ data: visitor }: { data: { email: string } | null }) => {
            if (visitor?.email) {
              createSystemNotification(
                'Document Approved',
                `Your ${existing.document_type} has been approved.`,
                'success',
                'visitor_document',
                id
              ).catch(() => {})
            }
          })
        }
        })
        
       return NextResponse.json({ success: true, document })
       } catch (err: unknown) {
         return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }
    }

    if (action === 'reject') {
      if (!reason) {
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
      }

       try {
         const document = await rejectDocument(id, user.id, reason)
         await logAuditAction('Document Rejected', 'visitor_document', id, `Document ${existing.document_type} rejected for visitor ${existing.visitor_id}`)

         admin.from('visitor_documents').select('visitor_id').eq('id', id).single().then(({ data: doc }: { data: { visitor_id: string } | null }) => {
           if (doc?.visitor_id) {
             admin.from('visitors').select('email').eq('id', doc.visitor_id).single().then(({ data: visitor }: { data: { email: string } | null }) => {
               if (visitor?.email) {
                 createSystemNotification(
                   'Document Rejected',
                   `Your ${existing.document_type} has been rejected. Reason: ${reason}`,
                   'error',
                   'visitor_document',
                   id
                 ).catch(() => {})
               }
             })
           }
         })

        return NextResponse.json({ success: true, document })
       } catch (err: unknown) {
         return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }
    }

    if (action === 'replacement') {
      if (!reason) {
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
      }

       try {
         const document = await requestReplacement(id, reason)
         await logAuditAction('Replacement Requested', 'visitor_document', id, `Replacement requested for document ${existing.document_type}`)

         admin.from('visitor_documents').select('visitor_id').eq('id', id).single().then(({ data: doc }: { data: { visitor_id: string } | null }) => {
           if (doc?.visitor_id) {
             admin.from('visitors').select('email').eq('id', doc.visitor_id).single().then(({ data: visitor }: { data: { email: string } | null }) => {
              if (visitor?.email) {
                createSystemNotification(
                  'Replacement Requested',
                  `Please upload a replacement for your ${existing.document_type}. Reason: ${reason}`,
                  'warning',
                  'visitor_document',
                  id
                ).catch(() => {})
              }
            })
          }
        })

        return NextResponse.json({ success: true, document })
       } catch (err: unknown) {
         return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }
    }

     if (action === 'mark_replacement_uploaded') {
       try {
         const document = await markReplacementUploaded(id)
         await logAuditAction('Replacement Uploaded', 'visitor_document', id, `Replacement uploaded for document ${existing.document_type}`)

        createReceptionistNotification(
          'Replacement Uploaded',
          `A replacement document has been uploaded and is ready for review.`,
          'info',
          'visitor_document',
          id
        ).catch(() => {})

        return NextResponse.json({ success: true, document })
       } catch (err: unknown) {
         return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }
    }

     if (action === 'replace' && file && file.size > 0) {
       if (file.size > MAX_FILE_SIZE) {
         return NextResponse.json(
          { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        )
      }

       if (!ALLOWED_MIME_TYPES.includes(file.type)) {
         return NextResponse.json(
           { error: `Unsupported file type: ${file.type}` },
           { status: 400 }
         )
       }

       if (existing.file_url) {
         const path = existing.file_url.split('/visitor-documents/')[1]
         if (path) {
           await admin.storage.from('visitor-documents').remove([path])
         }
       }

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/-+/g, '-')
      const uniqueFileName = `${existing.visitor_id}/${Date.now()}-${sanitizedName}`
      const { error: uploadError } = await admin.storage
        .from('visitor-documents')
        .upload(uniqueFileName, file, {
          contentType: file.type,
          upsert: false,
        })

       if (uploadError) {
         return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }

      const { data: publicUrlData } = admin.storage
        .from('visitor-documents')
        .getPublicUrl(uniqueFileName)

      const { data, error } = await admin
        .from('visitor_documents')
        .update({
          file_name: file.name,
          file_url: publicUrlData.publicUrl,
          front_image_url: publicUrlData.publicUrl,
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
          replacement_uploaded: true,
        })
        .eq('id', id)
        .select(`
          *,
          visitor:visitors(full_name, email, visitor_organization, photo_url)
        `)
        .single()

       if (error) {
         return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
       }

       await logAuditAction('Document Replaced', 'visitor_document', id, `Document ${id} replaced`)

       return NextResponse.json(mapToDocumentVerification(data))
    }

    if (action === 'download') {
      const { data: doc } = await admin
        .from('visitor_documents')
        .select('file_url, front_image_url, file_name, document_type')
        .eq('id', id)
        .single()

       const fileUrl = doc?.file_url || doc?.front_image_url
       if (!fileUrl) {
         return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
      }

       await logAuditAction('Document Downloaded', 'visitor_document', id, `Document ${doc.document_type} downloaded`)

       return NextResponse.json({ url: fileUrl, file_name: doc.file_name })
    }

    return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
  } catch (err) {
    console.error('[Documents API] POST error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
