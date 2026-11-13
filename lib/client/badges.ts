import type { VisitorBadge, BadgeFormData } from '@/lib/badge/badge-types'
import { getAuthHeaders } from '@/lib/client/api'

export type { VisitorBadge, BadgeFormData }

export async function getBadges(search?: string, status?: string, signal?: AbortSignal): Promise<VisitorBadge[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (status && status !== 'all') params.set('status', status)
  params.set('limit', '1000')

  const res = await fetch(`/api/badges?${params.toString()}`, {
    headers: await getAuthHeaders(),
    signal,
  })
  if (!res.ok) throw new Error('Failed to fetch badges')
  const json = await res.json()
  return json.data || []
}

export async function getBadgeById(id: string): Promise<VisitorBadge | null> {
  const res = await fetch(`/api/badges/${id}`, {
    headers: await getAuthHeaders(),
  })
  if (!res.ok) return null
  const { data } = await res.json()
  return data as VisitorBadge
}

export async function createBadge(visitId: string, expiresInHours?: number): Promise<VisitorBadge> {
  const res = await fetch('/api/badges', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ visit_id: visitId, expires_in_hours: expiresInHours || 24 }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create badge')
  }
  const { data } = await res.json()
  return data as VisitorBadge
}

export async function printBadge(id: string): Promise<void> {
  const res = await fetch(`/api/badges/${id}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'print' }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to print badge')
  }
}

export async function reprintBadge(id: string): Promise<void> {
  const res = await fetch(`/api/badges/${id}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'reprint' }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to reprint badge')
  }
}

export async function cancelBadge(id: string): Promise<void> {
  const res = await fetch(`/api/badges/${id}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'cancel' }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to cancel badge')
  }
}
