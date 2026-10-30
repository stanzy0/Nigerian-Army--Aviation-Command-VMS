'use client'

import { useState, useEffect } from 'react'
import PublicRegistrationWizard from '@/components/PublicRegistrationWizard'
import Link from 'next/link'
import Image from 'next/image'
import { getCurrentUser } from '@/lib/auth-client'
import { Loader2 } from 'lucide-react'

export default function DirectorRegisterPage() {
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<Awaited<ReturnType<typeof getCurrentUser>> | null>(null)

  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u)
      setChecking(false)
    })
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0B0F08] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C8A951]" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0F08]">
        <header className="bg-[#10150D] border-b border-[rgba(85,107,47,0.35)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/images/afcsc-logo.png"
                  alt="Department of Land Warfare Logo"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                  priority
                />
                <div className="hidden sm:block">
                  <p className="text-xs text-[#9A9F87] leading-tight">NA Avn Comd</p>
                  <p className="text-xs text-gray-400 leading-tight">Kaduna, Nigeria</p>
                </div>
              </div>
              <nav className="flex items-center gap-6">
                <Link href="/register/status" className="text-sm font-medium text-[#C8A951] hover:text-[#E5C76B]">
                  Check Status
                </Link>
                <Link href="/" className="text-sm font-medium text-[#9A9F87] hover:text-[#F5F5DC]">
                  Home
                </Link>
              </nav>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="rounded-2xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-8">
            <h1 className="text-2xl font-bold text-[#F5F5DC] mb-4">DIRECTOR</h1>
            <h2 className="text-lg font-medium text-[#C8A951] mb-4">DEPARTMENT OF LAND WARFARE</h2>
            <p className="text-[#9A9F87] mb-6">
              Visitor registration is handled at the Main Reception Desk. Please arrive at the premises to register for your visit.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#C8A951] px-6 py-3 text-sm font-medium text-[#0B0F08] hover:bg-[#E5C76B] transition-colors">
                Return to Home
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#10150D] px-6 py-3 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 border border-gray-300 transition-colors">
                Staff Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <header className="bg-[#10150D] border-b border-[rgba(85,107,47,0.35)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/images/afcsc-logo.png"
                alt="Department of Land Warfare Logo"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                priority
              />
              <div className="hidden sm:block">
                <p className="text-xs text-[#9A9F87] leading-tight">NA Avn Comd</p>
                <p className="text-xs text-gray-400 leading-tight">Kaduna, Nigeria</p>
              </div>
            </div>
            <nav className="flex items-center gap-6">
              <Link href="/register/status" className="text-sm font-medium text-[#C8A951] hover:text-[#E5C76B]">
                Check Status
              </Link>
              <Link href="/" className="text-sm font-medium text-[#9A9F87] hover:text-[#F5F5DC]">
                Home
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <PublicRegistrationWizard variant="director" />
    </div>
  )
}

