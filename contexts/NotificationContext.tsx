'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useNotificationRealtime } from '@/hooks/useNotificationRealtime'
import type { Notification, NotificationFilters } from '@/lib/types/notification'
import { getAuthHeaders } from '@/lib/client/api'
import { isDemoMode } from '@/lib/demo'
import { supabase } from '@/lib/supabase'

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  clearRead: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/notifications?limit=100', {
        headers: await getAuthHeaders(),
      })
      if (!res.ok) return
      const json = await res.json()
      if (json.success && json.data) {
        setNotifications(json.data)
        setUnreadCount(json.unreadCount || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const markAsRead = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify({ action: 'mark_read' }),
    })
    await fetchNotifications()
  }, [fetchNotifications])

  const markAllAsRead = useCallback(async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify({ action: 'mark_all_read' }),
    })
    await fetchNotifications()
  }, [fetchNotifications])

  const deleteNotification = useCallback(async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })
    await fetchNotifications()
  }, [fetchNotifications])

  const clearRead = useCallback(async () => {
    await fetch('/api/notifications?clear_read=true', {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })
    await fetchNotifications()
  }, [fetchNotifications])

  useNotificationRealtime(() => {
    fetchNotifications()
  })

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      if (isDemoMode()) {
        setLoading(false)
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!cancelled && user) {
        await fetchNotifications()
      } else if (!cancelled) {
        setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [fetchNotifications])

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, refresh: fetchNotifications, markAsRead, markAllAsRead, deleteNotification, clearRead }}>
      {children}
    </NotificationContext.Provider>
  )
}
