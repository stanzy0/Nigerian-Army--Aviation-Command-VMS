export interface BrandingSettings {
  id: string
  college_name: string
  logo_url: string | null
  department_logo_url: string | null
  login_background_url: string | null
  badge_template_url: string | null
  signature_url: string | null
  stamp_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  badge_header_text: string
  badge_footer_text: string | null
  created_at: string
  updated_at: string
}

export interface BrandingUpdatePayload {
  college_name?: string
  logo_url?: string | null
  department_logo_url?: string | null
  login_background_url?: string | null
  badge_template_url?: string | null
  signature_url?: string | null
  stamp_url?: string | null
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  badge_header_text?: string
  badge_footer_text?: string | null
}

export const DEFAULT_BRANDING: BrandingSettings = {
  id: '00000000-0000-0000-0000-000000000000',
  college_name: 'Nigerian Army Aviation Visitors Management System',
  logo_url: null,
  department_logo_url: null,
  login_background_url: null,
  badge_template_url: null,
  signature_url: null,
  stamp_url: null,
  primary_color: '#0B3D91',
  secondary_color: '#1F6FEB',
  accent_color: '#D4AF37',
  badge_header_text: 'VISITOR',
  badge_footer_text: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
