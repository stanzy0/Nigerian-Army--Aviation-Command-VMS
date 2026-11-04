'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import { logAuditAction } from '@/lib/client/audit'
import { getAuthHeaders } from '@/lib/client/api'
import {
  Save,
  Download,
  Upload,
  RefreshCw,
  Loader2,
  Eye,
  Palette,
  Shield,
  Bell,
  Building2,
  UserCheck,
  QrCode,
  AlertTriangle,
} from 'lucide-react'

interface SettingRow {
  id?: string
  key: string
  value: SettingValue
  category: string
  description?: string
  is_sensitive?: boolean
}

const DEFAULT_SETTINGS: SettingRow[] = [
  { key: 'org_name', value: 'Organization Name', category: 'general', description: 'Organization display name' },
  { key: 'org_logo', value: '', category: 'general', description: 'Logo URL' },
  { key: 'org_address', value: '', category: 'general', description: 'Address' },
  { key: 'org_phone', value: '', category: 'general', description: 'Phone number' },
  { key: 'org_email', value: '', category: 'general', description: 'Email address' },
  { key: 'org_website', value: '', category: 'general', description: 'Website URL' },
  { key: 'working_hours_start', value: '08:00', category: 'visitor', description: 'Working hours start' },
  { key: 'working_hours_end', value: '18:00', category: 'visitor', description: 'Working hours end' },
  { key: 'max_visit_duration', value: 480, category: 'visitor', description: 'Max visit duration in minutes' },
  { key: 'require_photo', value: true, category: 'visitor', description: 'Require visitor photo' },
  { key: 'require_id_verification', value: false, category: 'visitor', description: 'Require ID verification' },
  { key: 'require_vehicle_registration', value: false, category: 'visitor', description: 'Require vehicle registration' },
  { key: 'auto_checkout', value: true, category: 'visitor', description: 'Auto check-out after hours' },
  { key: 'badge_expiry_hours', value: 24, category: 'visitor', description: 'Badge expiry in hours' },
  { key: 'badge_logo', value: '', category: 'badge', description: 'Badge logo URL' },
  { key: 'badge_background', value: '#ffffff', category: 'badge', description: 'Badge background color' },
  { key: 'badge_footer', value: '', category: 'badge', description: 'Badge footer text' },
  { key: 'badge_qr_position', value: 'right', category: 'badge', description: 'QR code position' },
  { key: 'notify_email', value: true, category: 'notifications', description: 'Enable email notifications' },
  { key: 'notify_inapp', value: true, category: 'notifications', description: 'Enable in-app notifications' },
  { key: 'notify_emergency', value: true, category: 'notifications', description: 'Enable emergency alerts' },
  { key: 'notify_watchlist', value: true, category: 'notifications', description: 'Enable watchlist alerts' },
  { key: 'session_timeout', value: 30, category: 'security', description: 'Session timeout in minutes' },
  { key: 'password_expiry_days', value: 90, category: 'security', description: 'Password expiry in days' },
  { key: 'max_login_attempts', value: 6, category: 'security', description: 'Max login attempts' },
  { key: 'force_password_change', value: false, category: 'security', description: 'Force password change on next login' },
  { key: 'auto_logout', value: true, category: 'security', description: 'Enable auto logout' },
  { key: 'resend_api_status', value: 'Not Configured', category: 'email', description: 'Resend API connection status' },
  { key: 'sender_name', value: '', category: 'email', description: 'Sender display name' },
  { key: 'sender_email', value: '', category: 'email', description: 'Sender email address' },
  { key: 'reply_to_email', value: '', category: 'email', description: 'Reply-to email address' },
  { key: 'enable_emails', value: true, category: 'email', description: 'Enable all email sending' },
  { key: 'enable_reminder_emails', value: true, category: 'email', description: 'Enable reminder emails' },
  { key: 'enable_emergency_emails', value: true, category: 'email', description: 'Enable emergency emails' },
  { key: 'theme', value: 'light', category: 'appearance', description: 'UI theme' },
  { key: 'accent_color', value: '#2563eb', category: 'appearance', description: 'Accent color' },
  { key: 'sidebar_style', value: 'default', category: 'appearance', description: 'Sidebar style' },
  { key: 'compact_mode', value: false, category: 'appearance', description: 'Enable compact mode' },
]

const CATEGORIES = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'visitor', label: 'Visitor Settings', icon: UserCheck },
  { id: 'badge', label: 'Badge Settings', icon: QrCode },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'email', label: 'Email', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'backup', label: 'Backup', icon: Download },
]

type SettingValue = string | number | boolean

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [activeCategory, setActiveCategory] = useState('general')
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [lastConfigChange, setLastConfigChange] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')

  async function fetchSettings() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const result = await res.json()
        const data = result.data || []
        const map: Record<string, SettingRow> = {}
        DEFAULT_SETTINGS.forEach((def) => {
          const existing = data?.find((s: any) => s.key === def.key)
          map[def.key] = existing ? { ...def, value: existing.value } : { ...def }
        })
        setSettings(map)
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err)
      const map: Record<string, SettingRow> = {}
      DEFAULT_SETTINGS.forEach((def) => {
        map[def.key] = { ...def }
      })
      setSettings(map)
    } finally {
      setLoading(false)
    }
  }

  async function fetchEmailStatus() {
    try {
      const res = await fetch('/api/admin/email-status', {
        headers: await getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setSettings((prev) => ({
          ...prev,
          resend_api_status: {
            ...prev.resend_api_status,
            value: data.configured ? 'Connected' : 'Not Configured',
          },
        }))
      }
    } catch (error) {
      console.error('Failed to fetch email status:', error)
    }
  }

  async function fetchAuditInfo() {
    try {
      const res = await fetch('/api/admin/audit-logs?limit=20')
      if (res.ok) {
        const result = await res.json()
        const data = result.data || []
        const backup = data.find((l: any) => l.action?.toLowerCase().includes('backup'))
        const config = data.find((l: any) => l.action?.toLowerCase().includes('settings'))
        const login = data.find((l: any) => l.action?.toLowerCase().includes('login'))
        setLastBackup(backup ? new Date(backup.created_at).toLocaleString() : null)
        setLastConfigChange(config ? new Date(config.created_at).toLocaleString() : null)
        setLastLogin(login ? new Date(login.created_at).toLocaleString() : null)
      }
    } catch (err) {
      console.error('Failed to fetch audit info:', err)
    }
  }

  function setupRealtime() {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('settings-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => {
          fetchSettings()
        }
      )
      .subscribe()
  }

  async function handleSave() {
    setSaving(true)
    const user = await getCurrentUser()

    const entries = Object.values(settings).map((s) => ({
      key: s.key,
      value: s.value,
      category: s.category,
      description: s.description,
      is_sensitive: s.is_sensitive || false,
      updated_by: user?.id,
    }))

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
      })
      if (!res.ok) {
        throw new Error('Failed to save')
      }
      await logAuditAction('Settings Updated', 'system_settings', null, 'System configuration updated')
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  function handleExportConfig() {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-settings-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    logAuditAction('Settings Exported', 'system_settings', null, 'Configuration exported')
  }

  function handleImportConfig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string)
        const newSettings = { ...settings }
        Object.entries(imported).forEach(([key, row]) => {
          if (newSettings[key]) {
            newSettings[key] = { ...newSettings[key], ...(row as SettingRow) }
          }
        })
        setSettings(newSettings)
        logAuditAction('Settings Imported', 'system_settings', null, 'Configuration imported')
        fetchSettings()
      } catch (err) {
        console.error('Invalid settings file:', err)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleClearVisitorData() {
    if (clearConfirmText !== 'CLEAR VISITOR DATA') {
      setClearResult({ type: 'error', text: 'Please type the confirmation phrase exactly.' })
      return
    }

    setClearing(true)
    setClearResult(null)
    try {
      const res = await fetch('/api/admin/clear-visitor-data', {
        method: 'POST',
        headers: await getAuthHeaders(),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setClearResult({ type: 'success', text: 'Visitor and operational data cleared successfully.' })
        setShowClearModal(false)
        setClearConfirmText('')
      } else {
        setClearResult({ type: 'error', text: json.message || 'Failed to clear visitor data' })
      }
    } catch (error) {
      setClearResult({ type: 'error', text: 'Failed to clear visitor data' })
    } finally {
      setClearing(false)
    }
  }

  function updateSetting(key: string, value: SettingValue) {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }))
  }

  function getSettingsByCategory(cat: string) {
    return Object.values(settings).filter((s) => s.category === cat)
  }

  useEffect(() => {
    let authUnsubscribe: (() => void) | null = null

    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user || user.role !== 'Admin') {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchSettings()
      fetchAuditInfo()
      setupRealtime()

      authUnsubscribe = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.access_token) {
          fetchEmailStatus()
        }
      }).data.subscription.unsubscribe
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
      if (authUnsubscribe) {
        authUnsubscribe()
      }
    }
  }, [])

  if (authChecking) {
    return (
      <div className="flex h-screen bg-[#0B0F08] relative items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/naac-login.jpg"
            alt="Nigerian Army Aviation Command background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
        </div>
        <Loader2 className="h-8 w-8 animate-spin text-[#C8A646]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08] relative">
      <div className="absolute inset-0 z-0">
        <img
          src="/images/naac-login.jpg"
          alt="Nigerian Army Aviation Command background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">System Settings</h1>
            <p className="text-sm text-[#9A9F87]">Admin configuration and preferences</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchSettings}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
                <nav className="space-y-1">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          activeCategory === cat.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-[#9A9F87] hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {cat.label}
                      </button>
                    )
                  })}
                </nav>

                <div className="mt-6 pt-4 border-t border-[rgba(85,107,47,0.35)]">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Audit Info</h4>
                  <div className="space-y-1 text-xs text-[#9A9F87]">
                    <p>Last Backup: {lastBackup || 'Never'}</p>
                    <p>Last Change: {lastConfigChange || 'Never'}</p>
                    <p>Last Login: {lastLogin || 'Never'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              {activeCategory === 'backup' ? (
                <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] mb-4">Backup & Configuration</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-[rgba(85,107,47,0.35)] rounded-lg">
                      <div>
                        <h4 className="text-sm font-medium text-[#F5F5DC]">Export Configuration</h4>
                        <p className="text-xs text-[#9A9F87]">Download all settings as JSON</p>
                      </div>
                      <button
                        onClick={handleExportConfig}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        <Download className="h-4 w-4" />
                        Export
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-4 border border-[rgba(85,107,47,0.35)] rounded-lg">
                      <div>
                        <h4 className="text-sm font-medium text-[#F5F5DC]">Import Configuration</h4>
                        <p className="text-xs text-[#9A9F87]">Upload a previously exported JSON file</p>
                      </div>
                      <label className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer">
                        <Upload className="h-4 w-4" />
                        Import
                        <input type="file" accept=".json" onChange={handleImportConfig} className="hidden" />
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 border border-[rgba(85,107,47,0.35)] rounded-lg">
                      <div>
                        <h4 className="text-sm font-medium text-[#F5F5DC]">Download Settings JSON</h4>
                        <p className="text-xs text-[#9A9F87]">Save a copy of current configuration</p>
                      </div>
                      <button
                        onClick={handleExportConfig}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                  <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                    <h3 className="text-lg font-semibold text-[#F5F5DC] capitalize">{activeCategory.replace('_', ' ')} Settings</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    {getSettingsByCategory(activeCategory).map((setting) => (
                      <div key={setting.key} className="flex items-center justify-between">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-[#F5F5DC]">{setting.key.replace(/_/g, ' ')}</label>
                          {setting.description && <p className="text-xs text-[#9A9F87]">{setting.description}</p>}
                        </div>
                        <div className="ml-4 w-64">
                          {typeof setting.value === 'boolean' ? (
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={setting.value as boolean}
                                onChange={(e) => updateSetting(setting.key, e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#10150D] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          ) : typeof setting.value === 'number' ? (
                            <input
                              type="number"
                              value={setting.value as number}
                              onChange={(e) => updateSetting(setting.key, parseInt(e.target.value) || 0)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          ) : setting.key === 'resend_api_status' ? (
                            <span className={`text-sm font-medium ${
                              setting.value === 'Connected' ? 'text-green-600' : 'text-red-600'
                            }`}>{setting.value as string}</span>
                          ) : (
                            <input
                              type={setting.key.includes('email') ? 'email' : setting.key.includes('url') || setting.key.includes('website') ? 'url' : 'text'}
                              value={setting.value as string}
                              onChange={(e) => updateSetting(setting.key, e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-red-500/30 bg-[#10150D] shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-xl bg-red-500/10 flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[#F5F5DC]">Clear Visitor &amp; Operational Data</h3>
              <p className="text-sm text-[#9A9F87] mt-1">
                Permanently delete all visitor and visitor-related operational/testing data (visitors, visits, badges,
                documents, notifications). Staff accounts, employees, departments, office locations, roles, permissions
                and branding are NOT affected.
              </p>
              <div className="mt-4">
                <button
                  onClick={() => { setShowClearModal(true); setClearConfirmText(''); setClearResult(null) }}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors min-h-[44px]"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Clear Visitor &amp; Operational Data
                </button>
              </div>
              {clearResult && (
                <div className={`mt-3 rounded-lg p-3 text-sm ${clearResult.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {clearResult.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {showClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <h2 className="text-xl font-bold text-[#F5F5DC]">Clear Visitor &amp; Operational Data</h2>
              </div>
              <p className="text-sm text-[#9A9F87] mb-2">
                This permanently deletes all visitor and visitor-related operational/testing data.
              </p>
              <p className="text-sm text-[#9A9F87] mb-4">
                Staff accounts, Admin accounts, Receptionist accounts, PA to CI accounts, PA to Director accounts,
                employees, departments, office locations, roles, permissions, branding and system configuration will
                NOT be deleted.
              </p>
              <label className="block text-sm font-medium text-[#F5F5DC] mb-1">
                Type <span className="font-mono font-bold">CLEAR VISITOR DATA</span> to confirm:
              </label>
              <input
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="CLEAR VISITOR DATA"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearVisitorData}
                  disabled={clearing || clearConfirmText !== 'CLEAR VISITOR DATA'}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {clearing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Permanently Clear Visitor Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



