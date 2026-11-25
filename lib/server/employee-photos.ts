import { supabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = 'employee-photos'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export function validatePhotoFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only JPG, JPEG, PNG and WebP images are allowed.' }
  }
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File size must be 5 MB or less.' }
  }
  return { valid: true }
}

export async function uploadEmployeePhoto(file: File, path: string): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Service role key not configured')
  }

  const validation = validatePhotoFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const bytes = await file.arrayBuffer()
  const fileExt = file.name.split('.').pop() || 'jpg'
  const fileName = `${path}-${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(fileName, bytes, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(fileName)

  return publicUrlData.publicUrl
}

export async function deleteEmployeePhoto(filePath: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Service role key not configured')
  }

  await supabaseAdmin.storage.from(BUCKET).remove([filePath])
}
