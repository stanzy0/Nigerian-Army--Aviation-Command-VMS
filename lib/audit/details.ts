// Helpers for safely handling audit_logs.details, a JSONB column that may hold
// either a legacy plain string or a structured object such as
// { message, role, ... }. These never throw and never return objects, so the
// result is always safe to render or search in the UI.

export function detailsToText(details: unknown): string {
  if (details == null) return ''
  if (typeof details === 'string') return details
  if (typeof details === 'number' || typeof details === 'boolean') return String(details)
  if (typeof details === 'object') {
    const obj = details as Record<string, unknown>
    const parts: string[] = []
    if (typeof obj.message === 'string') parts.push(obj.message)
    if (typeof obj.role === 'string') parts.push(obj.role)
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'message' || key === 'role') continue
      if (typeof value === 'string') parts.push(value)
      else if (typeof value === 'number' || typeof value === 'boolean') parts.push(String(value))
    }
    if (parts.length > 0) return parts.join(' ')
    try {
      return JSON.stringify(obj)
    } catch {
      return ''
    }
  }
  return ''
}

export function detailsToRole(details: unknown): string {
  if (details && typeof details === 'object') {
    const role = (details as Record<string, unknown>).role
    if (typeof role === 'string' && role) return role
  }
  if (typeof details === 'string') {
    return details.match(/role\s+(\w+)/)?.[1] || '—'
  }
  return '—'
}

export function formatDetailsDisplay(details: unknown): string {
  if (details == null) return '—'
  if (typeof details === 'string') return details || '—'
  if (typeof details === 'object') {
    const obj = details as Record<string, unknown>
    const message = typeof obj.message === 'string' ? obj.message : ''
    const role = typeof obj.role === 'string' ? obj.role : ''
    if (message && role) return `${message} — Role: ${role}`
    if (message) return message
    if (role) return `Role: ${role}`
    return detailsToText(details) || '—'
  }
  return String(details)
}