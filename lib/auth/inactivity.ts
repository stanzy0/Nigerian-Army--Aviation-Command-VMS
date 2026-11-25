// lib/auth/inactivity.ts
// Inactivity monitoring constants and helpers for automatic session logout.
// All times are in milliseconds.

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
export const WARNING_MS = 2 * 60 * 1000 // 2 minutes before timeout

// Throttle localStorage writes to at most once per second to avoid excessive
// disk I/O on high-frequency events like mousemove/pointermove.
export const STORAGE_WRITE_THROTTLE_MS = 1000

// User activity events that reset the inactivity timer.
// Background API requests / polling are NOT included.
export const ACTIVITY_EVENTS: string[] = [
  'mousedown',
  'mouseup',
  'click',
  'mousemove',
  'keydown',
  'keyup',
  'keypress',
  'scroll',
  'touchstart',
  'touchmove',
  'touchend',
  'pointerdown',
  'pointermove',
  'pointerup',
  'visibilitychange',
  'focus',
]

// localStorage keys for cross-tab synchronisation
export const STORAGE_KEY_LAST_ACTIVITY = 'naac_vms_last_activity'
export const STORAGE_KEY_LOGOUT_REQUESTED = 'naac_vms_logout_requested'

// Tracks the last time we wrote to localStorage for activity (for throttling)
let lastStorageWriteTime = 0

/** Record the current time as the last user activity, shared across tabs.
 *
 * Writes to localStorage are throttled to at most once per second to avoid
 * excessive disk I/O on high-frequency events like mousemove/pointermove.
 * Only writes if the new timestamp differs from the currently stored value,
 * preventing redundant storage events that could cause cross-tab update loops.
 */
export function recordActivity(): void {
  try {
    const now = Date.now()
    // Throttle: don't write more than once per second
    if (now - lastStorageWriteTime < STORAGE_WRITE_THROTTLE_MS) {
      return
    }
    const existing = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY)
    const existingTime = existing ? parseInt(existing, 10) : 0
    // Only write if the value actually changed (prevents infinite storage loops)
    if (isNaN(existingTime) || now > existingTime) {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(now))
      lastStorageWriteTime = now
    }
  } catch {
    // localStorage may be unavailable in private mode; ignore gracefully
  }
}

/** Read the last recorded activity timestamp. */
export function getLastActivityTime(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY)
    return val ? parseInt(val, 10) : Date.now()
  } catch {
    return Date.now()
  }
}

/** Signal all tabs that a logout has been requested. */
export function setLogoutRequested(): void {
  try {
    localStorage.setItem(STORAGE_KEY_LOGOUT_REQUESTED, 'true')
  } catch {
    // ignore
  }
}

/** Clear the logout-requested flag. */
export function clearLogoutRequested(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_LOGOUT_REQUESTED)
  } catch {
    // ignore
  }
}

/** Check whether another tab has requested a logout. */
export function isLogoutRequested(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_LOGOUT_REQUESTED) === 'true'
  } catch {
    return false
  }
}

/** Compute milliseconds remaining until inactivity timeout, based on last activity. */
export function timeRemainingMs(): number {
  const elapsed = Date.now() - getLastActivityTime()
  return Math.max(0, INACTIVITY_TIMEOUT_MS - elapsed)
}

/** Compute milliseconds remaining until the warning should be shown. */
export function warningTimeRemainingMs(): number {
  const elapsed = Date.now() - getLastActivityTime()
  return Math.max(0, INACTIVITY_TIMEOUT_MS - WARNING_MS - elapsed)
}

/** Returns true if the warning period has been reached. */
export function isWarningTime(): boolean {
  return warningTimeRemainingMs() <= 0 && timeRemainingMs() > 0
}

/** Returns true if the inactivity timeout has been reached. */
export function isTimedOut(): boolean {
  return timeRemainingMs() <= 0
}

/** Returns true if an event should be treated as fresh user activity.
 *
 * If the session has already timed out, the event should NOT reset the timer -
 * instead the user should be logged out. This prevents returning to a
 * backgrounded tab after 30+ minutes from extending an expired session.
 */
export function shouldRecordActivity(): boolean {
  return !isTimedOut()
}
