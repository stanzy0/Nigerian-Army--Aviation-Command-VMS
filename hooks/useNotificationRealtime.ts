'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

import { isDemoMode } from '@/lib/demo'

export function useNotificationRealtime(onNewNotification?: () => void) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const callbackRef = useRef(onNewNotification)

  useEffect(() => {
    if (isDemoMode()) return
    callbackRef.current = onNewNotification
  }, [onNewNotification])

  useEffect(() => {
    if (isDemoMode()) return
    if (!supabase) return

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch role via server-side API to bypass RLS issues
      const roleRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      const roleData = roleRes.ok ? await roleRes.json() : { success: false }
      const role = roleData.success ? roleData.data?.role : null

      if (!role) return

      channelRef.current = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
          },
          (payload) => {
            const notification = payload.new as {
              user_id: string | null
              recipient_role: string | null
            } | null

            if (!notification) return

            const matchesUser = notification.user_id === user.id
            const matchesRole = !!role && notification.recipient_role === role

            if (matchesUser || matchesRole) {
              if (process.env.NODE_ENV === 'development') {
                console.log('Realtime Notification Received:', notification)
              }
              callbackRef.current?.()
            }
          }
        )
        .subscribe()
    }

    setupRealtime()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])
}
