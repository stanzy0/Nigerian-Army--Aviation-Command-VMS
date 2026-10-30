'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { isDemoMode } from '@/lib/demo'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import type { Notification } from '@/lib/types/notification'
import NotificationDropdown from './NotificationDropdown'

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        setUserRole(user.role)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (!userId || !userRole) return
    if (isDemoMode()) return

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/notifications/unread-count')
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setUnreadCount(result.unreadCount ?? 0)
          }
        }
      } catch (err) {
        console.error('Failed to fetch unread notification count:', err)
      }
    }

    fetchUnreadCount()

    realtimeChannel.current = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          const notif = payload.new as Notification | null
          const oldNotif = payload.old as Notification | null

          if (payload.eventType === 'INSERT' && notif) {
            if (notif.user_id === userId || notif.recipient_role === userRole) {
              setUnreadCount(prev => prev + 1)
            }
          } else if (payload.eventType === 'UPDATE' && notif) {
            const matches = notif.user_id === userId || notif.recipient_role === userRole
            if (matches) {
              if (!notif.is_read) {
                setUnreadCount(prev => prev + 1)
              } else {
                setUnreadCount(prev => Math.max(0, prev - 1))
              }
            }
          } else if (payload.eventType === 'DELETE' && oldNotif) {
            if (oldNotif.user_id === userId || oldNotif.recipient_role === userRole) {
              setUnreadCount(prev => Math.max(0, prev - 1))
            }
          }
        }
      )
      .subscribe()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
  }, [userId, userRole])

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-md hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && <NotificationDropdown onClose={() => setIsOpen(false)} />}
    </div>
  )
}
