'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isDemoMode } from '@/lib/demo'
import {
  INACTIVITY_TIMEOUT_MS,
  WARNING_MS,
  ACTIVITY_EVENTS,
  recordActivity,
  getLastActivityTime,
  setLogoutRequested,
  clearLogoutRequested,
  isLogoutRequested,
  timeRemainingMs,
  warningTimeRemainingMs,
  isWarningTime,
  isTimedOut,
  shouldRecordActivity,
} from '@/lib/auth/inactivity'
import { InactivityWarningModal } from './InactivityWarningModal'

interface SessionTimeoutContextValue {
  warningVisible: boolean
  resetWarning: () => void
}

const SessionTimeoutContext = createContext<SessionTimeoutContextValue | undefined>(undefined)

export function useSessionTimeout() {
  const context = useContext(SessionTimeoutContext)
  if (!context) {
    throw new Error('useSessionTimeout must be used within a SessionTimeoutProvider')
  }
  return context
}

interface SessionTimeoutProviderProps {
  children: ReactNode
}

/**
 * SessionTimeoutProvider monitors user activity across the application and
 * automatically logs the user out after 30 minutes of inactivity.
 *
 * Features:
 * - Tracks mouse, keyboard, scroll, touch, pointer, visibility, and focus events
 * - 30-minute inactivity timeout with automatic logout via Supabase
 * - 2-minute warning modal with "Stay Logged In" button
 * - Cross-tab synchronisation via localStorage + storage event
 * - Graceful cleanup of timers and event listeners on unmount
 * - Throttled localStorage writes (max once per second)
 * - Cross-tab logout propagation
 * - Auth state change monitoring via Supabase onAuthStateChange
 */
export function SessionTimeoutProvider({ children }: SessionTimeoutProviderProps) {
  const router = useRouter()
  const [warningVisible, setWarningVisible] = useState(false)
  const logoutInProgressRef = useRef(false)
  const isAuthenticatedRef = useRef(false)

  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activityListenerRef = useRef<((e: Event) => void) | null>(null)
  const storageListenerRef = useRef<((e: StorageEvent) => void) | null>(null)
  const authStateListenerRef = useRef<{ unsubscribe: () => void } | null>(null)
  const authStateCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const supabase = createClient()

  const clearTimers = useCallback(() => {
    if (timeoutTimerRef.current !== null) {
      clearTimeout(timeoutTimerRef.current)
      timeoutTimerRef.current = null
    }
    if (warningTimerRef.current !== null) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    if (authStateCheckRef.current !== null) {
      clearInterval(authStateCheckRef.current)
      authStateCheckRef.current = null
    }
  }, [])

  const performLogout = useCallback(async () => {
    if (logoutInProgressRef.current) return
    logoutInProgressRef.current = true

    clearTimers()
    setLogoutRequested()

    try {
      if (!isDemoMode()) {
        await supabase.auth.signOut()
      }
    } catch {
      // Ignore sign-out errors; proceed with redirect regardless
    }

    // Redirect to login - a full-page navigation is sufficient
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [supabase, clearTimers])

  const resetTimer = useCallback(() => {
    clearTimers()
    recordActivity()

    // Schedule warning (2 minutes before timeout)
    warningTimerRef.current = setTimeout(() => {
      setWarningVisible(true)
    }, INACTIVITY_TIMEOUT_MS - WARNING_MS)

    // Schedule full logout (30 minutes)
    timeoutTimerRef.current = setTimeout(() => {
      performLogout()
    }, INACTIVITY_TIMEOUT_MS)
  }, [clearTimers])

  const handleActivity = useCallback(() => {
    // Only reset if not demo mode
    if (isDemoMode()) return

    // If the session has already expired, do not treat this as new activity
    // - this prevents returning to a backgrounded tab from extending an
    //   already-expired session.
    if (!shouldRecordActivity()) {
      performLogout()
      return
    }

    recordActivity()

    // Dismiss warning if user interacts
    if (warningVisible) {
      setWarningVisible(false)
    }

    resetTimer()
  }, [warningVisible, resetTimer, performLogout])

  const handleStorage = useCallback((e: StorageEvent) => {
    if (isDemoMode()) return

    // Another tab recorded more recent activity - sync our timer
    if (e.key === 'naac_vms_last_activity' && e.newValue) {
      const otherTime = parseInt(e.newValue, 10)
      const ourTime = getLastActivityTime()
      if (!isNaN(otherTime) && otherTime > ourTime) {
        recordActivity()
        resetTimer()
      }
    }

    // Another tab logged out - we should log out too
    if (e.key === 'naac_vms_logout_requested' && e.newValue === 'true') {
      performLogout()
    }
  }, [performLogout, resetTimer])

  const checkAuthState = useCallback(async () => {
    if (isDemoMode()) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const wasAuthenticated = isAuthenticatedRef.current
      isAuthenticatedRef.current = !!user

      // Session was lost - trigger logout
      if (wasAuthenticated && !user) {
        clearTimers()
        performLogout()
        return
      }

      // Session was gained (fresh login) - clear logout flag and start timer
      if (!wasAuthenticated && user) {
        clearLogoutRequested()
        recordActivity()
        resetTimer()
      }
    } catch (err) {
      // Ignore errors - auth check will be retried on next interval
      // If the error is due to 401 (unauthenticated), stop the interval
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) {
        isAuthenticatedRef.current = false
        clearTimers()
      }
    }
  }, [supabase, clearTimers, performLogout, resetTimer])

  // Initialise on mount
  useEffect(() => {
    if (isDemoMode()) return

    // Clear a stale cross-tab logout flag when on the login page. If we
    // don't, performLogout() would set the flag again and reload, causing
    // an infinite redirect loop on /login.
    if (
      typeof window !== 'undefined' &&
      window.location.pathname === '/login' &&
      isLogoutRequested()
    ) {
      clearLogoutRequested()
      // On the login page, we should NOT check auth state or perform logout.
      // The user is explicitly trying to log in. Just clear the flag and return.
      return
    }

    // If another tab requested logout AND we don't have an active session,
    // follow suit. If we DO have an active session (fresh login), clear the
    // stale flag and start fresh.
    if (isLogoutRequested()) {
      void checkAuthState().then(() => {
        // checkAuthState already handles the logout logic:
        // - If user was authenticated but session lost -> performLogout() called inside checkAuthState
        // - If user was never authenticated -> clearLogoutRequested() called inside checkAuthState
        // No additional action needed here.
      })
      return
    }

    // Check current auth state before starting the timer
    void checkAuthState()

    // Initial activity record and timer setup (only if authenticated)
    if (isAuthenticatedRef.current) {
      recordActivity()
      resetTimer()
    }

    // Listen for user activity events
    activityListenerRef.current = (e: Event) => {
      // Ignore visibilitychange/focus when document is not visible
      if (e.type === 'visibilitychange' && document.visibilityState !== 'visible') {
        return
      }
      handleActivity()
    }

    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, activityListenerRef.current!, true)
    })

    // Listen for cross-tab synchronisation events
    storageListenerRef.current = handleStorage
    window.addEventListener('storage', storageListenerRef.current)

    // Listen for Supabase auth state changes (session expiry, etc.)
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          clearTimers()
          performLogout()
        } else if (event === 'SIGNED_IN' && session) {
          clearLogoutRequested()
          recordActivity()
          resetTimer()
          isAuthenticatedRef.current = true
        }
      })
      authStateListenerRef.current = { unsubscribe: () => subscription.unsubscribe() }
    } catch {
      // onAuthStateChange may not be available; fall back to polling
    }

    // Cleanup on unmount
    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach((event) => {
        document.removeEventListener(event, activityListenerRef.current!, true)
      })
      window.removeEventListener('storage', storageListenerRef.current!)
      authStateListenerRef.current?.unsubscribe()
    }
  }, [resetTimer, clearTimers, handleActivity, handleStorage, performLogout, checkAuthState])

  // Periodically re-evaluate warning/timeout state based on last activity time.
  // This handles cases where the tab was backgrounded and timers drifted.
  // Also checks auth state periodically as a fallback if onAuthStateChange fails.
  useEffect(() => {
    if (isDemoMode()) return

    const checkInterval = setInterval(() => {
      // Skip periodic auth check on the login page to avoid logout loops
      if (typeof window !== 'undefined' && window.location.pathname === '/login') {
        return
      }

      // Skip if user is not authenticated to avoid unnecessary API calls
      if (!isAuthenticatedRef.current) {
        return
      }

      // Periodic auth state check as fallback
      void checkAuthState()

      // If logout was requested from another tab, follow suit
      if (isLogoutRequested()) {
        performLogout()
        return
      }

      // If we're showing the warning and timeout has passed, log out
      if (warningVisible && isTimedOut()) {
        setWarningVisible(false)
        performLogout()
        return
      }

      // Show warning when we enter the warning window
      if (!warningVisible && isWarningTime()) {
        setWarningVisible(true)
      }

      // Dismiss warning if activity has reset the timer past the warning point
      if (warningVisible && !isWarningTime() && !isTimedOut()) {
        setWarningVisible(false)
      }
    }, 1000)

    return () => clearInterval(checkInterval)
  }, [warningVisible, performLogout, checkAuthState])

  const contextValue: SessionTimeoutContextValue = {
    warningVisible,
    resetWarning: resetTimer,
  }

  return (
    <SessionTimeoutContext.Provider value={contextValue}>
      {children}
      {warningVisible && (
        <InactivityWarningModal
          visible={warningVisible}
          secondsRemaining={Math.ceil(timeRemainingMs() / 1000)}
          onStayLoggedIn={resetTimer}
        />
      )}
    </SessionTimeoutContext.Provider>
  )
}
