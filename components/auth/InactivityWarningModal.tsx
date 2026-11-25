'use client'

import { useEffect } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'

interface InactivityWarningModalProps {
  visible: boolean
  onStayLoggedIn: () => void
  secondsRemaining: number
}

export function InactivityWarningModal({
  visible,
  onStayLoggedIn,
  secondsRemaining,
}: InactivityWarningModalProps) {
  // Countdown timer for display
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {}, 1000)
    return () => clearInterval(id)
  }, [visible])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
      aria-describedby="session-warning-desc"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0B0F08]/80 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 p-6 bg-[#10150D] border border-[#C8A646]/40 rounded-2xl shadow-2xl shadow-[#C8A646]/20 text-center">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="w-10 h-10 text-[#C8A646] flex-shrink-0" />
        </div>

        <h2 id="session-warning-title" className="text-xl font-bold text-[#F5F5DC] mb-2">
          Session Expiring Soon
        </h2>

        <p id="session-warning-desc" className="text-[#9A9F87] text-sm mb-6">
          For security, your session will expire due to inactivity in{' '}
          <span className="text-[#C8A646] font-mono font-bold">{secondsRemaining}</span>{' '}
          seconds. Your work will not be lost, but you will need to sign in again.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onStayLoggedIn}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#C8A646] text-[#0B0F08] font-bold text-sm hover:bg-[#C8A646]/90 transition-colors focus:outline-none focus:ring-2 focus:ring-[#F5F5DC]/50"
          >
            Stay Logged In
          </button>
          <button
            onClick={() => {
              // Allow timeout to proceed - close modal, timer continues
              // The parent will handle the actual logout when timer expires
            }}
            className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#556B2F]/40 bg-transparent text-[#9A9F87] font-medium text-sm hover:bg-[#556B2F]/20 transition-colors focus:outline-none focus:ring-2 focus-ring-[#556B2F]/50"
          >
            Log Out Now
          </button>
        </div>

        <p className="mt-4 text-[10px] text-[#6B705A]">
          If you take no action, you will be automatically signed out.
        </p>
      </div>
    </div>
  )
}
