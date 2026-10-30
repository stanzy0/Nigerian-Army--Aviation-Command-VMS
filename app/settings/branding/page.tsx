'use client'

import { useState, useEffect } from 'react'
import { Upload, Trash2, Eye, Palette, ImageIcon, FileText, Stamp } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth-client'

interface AssetFieldProps {
  label: string
  icon: React.ReactNode
  url: string | null
  onUpload: (url: string) => void
  onRemove: () => void
  accept: string
  path: string
  hint?: string
}

function AssetField({ label, icon, url, onUpload, onRemove, accept, path, hint }: AssetFieldProps) {
  const [preview, setPreview] = useState<string | null>(url)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setPreview(url)
  }, [url])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path)

      const res = await fetch('/api/branding/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error || 'Upload failed')
      }
      const { data } = await res.json()
      onUpload(data.url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-50 text-[#9A9F87]">{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-[#F5F5DC]">{label}</h3>
            {hint && <p className="text-xs text-[#9A9F87]">{hint}</p>}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50">
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading...' : 'Upload'}
              <input type="file" accept={accept} onChange={handleFileChange} className="hidden" disabled={uploading} />
            </label>
            {url && (
              <button onClick={onRemove} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-[#10150D] px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>

          {preview && (
            <div className="relative rounded-lg border border-[rgba(85,107,47,0.35)] p-2 bg-gray-50">
              <img src={preview} alt={label} className="max-h-32 max-w-full object-contain mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4">
      <label className="text-sm font-medium text-[#9A9F87]">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 rounded-lg border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase"
        />
      </div>
    </div>
  )
}

interface BrandingPreviewProps {
  branding: {
    college_name: string
    logo_url: string | null
    department_logo_url: string | null
    login_background_url: string | null
    primary_color: string
    secondary_color: string
    accent_color: string
    badge_header_text: string
  }
}

function BrandingPreview({ branding }: BrandingPreviewProps) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-5">
      <h3 className="text-sm font-semibold text-[#F5F5DC] mb-4">Live Preview</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#9A9F87] uppercase tracking-wider">Login Page</p>
          <div className="rounded-lg border border-[rgba(85,107,47,0.35)] overflow-hidden h-40 relative" style={{ background: branding.login_background_url ? `url(${branding.login_background_url}) center/cover` : '#f8fafc' }}>
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-full bg-[#10150D]/90 p-1" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-[#10150D]/90 flex items-center justify-center text-xs font-bold text-[#9A9F87]">LOGO</div>
              )}
            </div>
            <div className="absolute bottom-2 left-2 right-2">
              <div className="h-2 rounded bg-[#10150D]/80 w-3/4 mb-1" />
              <div className="h-2 rounded bg-[#10150D]/60 w-1/2" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[#9A9F87] uppercase tracking-wider">Badge</p>
          <div className="rounded-lg border border-[rgba(85,107,47,0.35)] overflow-hidden h-40 flex items-center justify-center p-3 bg-[#10150D]">
            <div className="w-full max-w-[120px] border-2 rounded-lg p-2 relative" style={{ borderColor: branding.primary_color }}>
              <div className="h-3 rounded mb-2 flex items-center justify-center text-white text-[6px] font-bold" style={{ backgroundColor: branding.primary_color }}>
                {branding.badge_header_text}
              </div>
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-1.5 rounded bg-gray-800 w-3/4" />
                  <div className="h-1 rounded bg-gray-400 w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[#9A9F87] uppercase tracking-wider">Dashboard</p>
          <div className="rounded-lg border border-[rgba(85,107,47,0.35)] overflow-hidden h-40 bg-gray-50 p-3">
            <div className="flex gap-2 mb-3">
              <div className="h-8 flex-1 rounded-lg" style={{ backgroundColor: branding.primary_color }} />
              <div className="h-8 flex-1 rounded-lg" style={{ backgroundColor: branding.secondary_color }} />
              <div className="h-8 flex-1 rounded-lg" style={{ backgroundColor: branding.accent_color }} />
            </div>
            <div className="space-y-2">
              <div className="h-2 rounded bg-gray-200 w-full" />
              <div className="h-2 rounded bg-gray-200 w-5/6" />
              <div className="h-2 rounded bg-gray-200 w-4/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BrandingSettingsPage() {
  const [branding, setBranding] = useState({
    college_name: 'Department of Land Warfare',
    logo_url: null as string | null,
    department_logo_url: null as string | null,
    login_background_url: null as string | null,
    badge_template_url: null as string | null,
    signature_url: null as string | null,
    stamp_url: null as string | null,
    primary_color: '#0B3D91',
    secondary_color: '#1F6FEB',
    accent_color: '#D4AF37',
    badge_header_text: 'VISITOR',
    badge_footer_text: '',
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'Admin') {
          setIsAdmin(false)
        } else {
          setIsAdmin(true)
        }
      } catch {
        setIsAdmin(false)
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetchBranding()
  }, [isAdmin])

  const fetchBranding = async () => {
    try {
      const res = await fetch('/api/branding')
      if (!res.ok) throw new Error('Failed to fetch branding')
      const { data } = await res.json()
      setBranding({
        college_name: data.college_name || 'Department of Land Warfare',
        logo_url: data.logo_url,
        department_logo_url: data.department_logo_url,
        login_background_url: data.login_background_url,
        badge_template_url: data.badge_template_url,
        signature_url: data.signature_url,
        stamp_url: data.stamp_url,
        primary_color: data.primary_color || '#0B3D91',
        secondary_color: data.secondary_color || '#1F6FEB',
        accent_color: data.accent_color || '#D4AF37',
        badge_header_text: data.badge_header_text || 'VISITOR',
        badge_footer_text: data.badge_footer_text || '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branding settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }))
        throw new Error(err.error || 'Failed to save')
      }
      alert('Branding settings saved successfully')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save branding settings')
    } finally {
      setSaving(false)
    }
  }

  const updateField = <K extends keyof typeof branding>(field: K, value: (typeof branding)[K]) => {
    setBranding(prev => ({ ...prev, [field]: value }))
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-[#9A9F87]">Checking permissions...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 font-medium">Unauthorized</p>
          <p className="text-sm text-[#9A9F87] mt-1">Only administrators can access branding settings.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-[#9A9F87]">Loading branding settings...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 font-medium">Failed to load branding</p>
          <p className="text-sm text-[#9A9F87] mt-1">{error}</p>
          <button onClick={fetchBranding} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F5F5DC]">Branding</h1>
          <p className="text-sm text-[#9A9F87] mt-1">Manage your organization logo, colors, and badge templates.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <AssetField
            label="Department Logo"
            icon={<ImageIcon className="h-5 w-5" />}
            url={branding.department_logo_url}
            onUpload={(url) => updateField('department_logo_url', url)}
            onRemove={() => updateField('department_logo_url', null)}
            accept="image/png,image/jpeg,image/webp"
            path="department-logo"
            hint="Logo of the Department of Land Warfare"
          />

          <AssetField
            label="Institution Logo"
            icon={<ImageIcon className="h-5 w-5" />}
            url={branding.logo_url}
            onUpload={(url) => updateField('logo_url', url)}
            onRemove={() => updateField('logo_url', null)}
            accept="image/png,image/jpeg,image/webp"
            path="institution-logo"
            hint="Logo of the NA Avn Comd"
          />

          <AssetField
            label="Login Background"
            icon={<ImageIcon className="h-5 w-5" />}
            url={branding.login_background_url}
            onUpload={(url) => updateField('login_background_url', url)}
            onRemove={() => updateField('login_background_url', null)}
            accept="image/jpeg,image/png,image/webp"
            path="login-background"
            hint="High-resolution image recommended"
          />

          <AssetField
            label="Badge Template"
            icon={<FileText className="h-5 w-5" />}
            url={branding.badge_template_url}
            onUpload={(url) => updateField('badge_template_url', url)}
            onRemove={() => updateField('badge_template_url', null)}
            accept="image/png,image/jpeg"
            path="badge-template"
            hint="PNG or JPG background for printed badges"
          />

          <AssetField
            label="College Signature"
            icon={<FileText className="h-5 w-5" />}
            url={branding.signature_url}
            onUpload={(url) => updateField('signature_url', url)}
            onRemove={() => updateField('signature_url', null)}
            accept="image/png,image/jpeg"
            path="signature"
          />

          <AssetField
            label="Official Stamp"
            icon={<Stamp className="h-5 w-5" />}
            url={branding.stamp_url}
            onUpload={(url) => updateField('stamp_url', url)}
            onRemove={() => updateField('stamp_url', null)}
            accept="image/png"
            path="stamp"
            hint="Transparent PNG recommended"
          />

          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-50 text-[#9A9F87]"><Palette className="h-5 w-5" /></div>
              <h3 className="text-sm font-semibold text-[#F5F5DC]">System Colors</h3>
            </div>
            <ColorField label="Primary Color" value={branding.primary_color} onChange={(v) => updateField('primary_color', v)} />
            <ColorField label="Secondary Color" value={branding.secondary_color} onChange={(v) => updateField('secondary_color', v)} />
            <ColorField label="Accent Color" value={branding.accent_color} onChange={(v) => updateField('accent_color', v)} />
          </div>

          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#F5F5DC]">Badge Text</h3>
            <div>
              <label className="block text-sm font-medium text-[#9A9F87] mb-2">Badge Header Text</label>
              <input
                type="text"
                value={branding.badge_header_text}
                onChange={(e) => updateField('badge_header_text', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9A9F87] mb-2">Badge Footer Text (Optional)</label>
              <input
                type="text"
                value={branding.badge_footer_text}
                onChange={(e) => updateField('badge_footer_text', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <BrandingPreview branding={branding} />
        </div>
      </div>
    </div>
  )
}



