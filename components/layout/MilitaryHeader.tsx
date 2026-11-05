'use client'

import { useState, useEffect } from 'react'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth-client'
import type { UserRole } from '@/lib/auth-types'

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#departments', label: 'Departments' },
  { href: '#security', label: 'Security' },
  { href: '/visitors/new', label: 'Register Visitor', roles: ['Admin', 'Receptionist'] as UserRole[] },
]

export default function MilitaryHeader() {
  const [branding, setBranding] = useState<{
    logo_url: string | null
    department_logo_url: string | null
    primary_color: string
    secondary_color: string
    accent_color: string
    college_name: string
  } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/branding')
      .then(res => res.ok ? res.json() : { data: null })
      .then(json => {
        if (cancelled || !json?.data) return
        setBranding({
          logo_url: json.data.logo_url,
          department_logo_url: json.data.department_logo_url,
          primary_color: json.data.primary_color || '#4B5320',
          secondary_color: json.data.secondary_color || '#556B2F',
          accent_color: json.data.accent_color || '#C8A646',
          college_name: json.data.college_name || 'Nigerian Army Aviation Command',
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then(user => {
      if (!cancelled && user) {
        setUserRole(user.role)
      }
    })
    return () => { cancelled = true }
  }, [])

  const institutionLogo = branding?.logo_url || '/images/afcsc-logo.png'

  const filteredNavLinks = NAV_LINKS.filter(link => !link.roles || link.roles.includes(userRole as UserRole))

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(85,107,47,0.35)] bg-[#10150D]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 sm:gap-4 min-w-0 transition-opacity duration-200 hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#C8A646]/60 focus:ring-offset-2 focus:ring-offset-[#10150D] rounded"
            aria-label="Nigerian Army Aviation Visitors Management System - Go to homepage"
            title="Go to homepage"
          >
            <ImageWithFallback
              src={institutionLogo}
              alt="Nigerian Army Aviation Command Logo"
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain flex-shrink-0"
            />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#F5F5DC] whitespace-nowrap">
              Nigerian Army Aviation Visitors Management System
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-6">
            {filteredNavLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-semibold uppercase tracking-wider text-[#9A9F87] hover:text-[#C8A646] transition-colors whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              className="lg:hidden p-2 rounded-lg text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#C8A646]/50 to-transparent" />

      {mobileOpen && (
        <div className="lg:hidden border-t border-[rgba(85,107,47,0.35)] bg-[#0B0F08] py-4 px-4">
          <nav className="flex flex-col gap-1">
            {filteredNavLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-[#9A9F87] hover:text-[#C8A646] transition-colors py-2.5 min-h-[44px] flex items-center"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}

