'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  Clock,
  UserCheck,
  FileText,
  ShieldCheck,
  Settings,
  LogOut,
  Monitor,
  Building2,
  BarChart3,
  IdCard,
  Scan,
  Car,
  Bell,
  AlertTriangle,
  Shield,
  Activity,
  GitBranch,
  FileDown,
  Database,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Palette,
  UserCog,
  UserPlus,
  ScrollText,
} from 'lucide-react'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import type { LucideIcon } from 'lucide-react'
import { UserRole, PERMISSIONS } from '@/lib/auth-client'
import { staggerContainer, fadeUp } from '@/lib/animations/variants'
import { useBranding } from '@/hooks/useBranding'

const NAV_SECTIONS = [
  { title: 'MAIN', items: [
    { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', permission: 'dashboard' },
    { label: 'Visitors', icon: Users, href: '/visitors', permission: 'visitors' },
    { label: 'Visits', icon: Clock, href: '/visits', permission: 'visits' },
    { label: 'Badges', icon: IdCard, href: '/badges', permission: 'badges' },
    { label: 'QR Scanner', icon: Scan, href: '/scanner', permission: 'scanner' },
  ]},
  { title: 'MANAGEMENT', items: [
    { label: 'Employees', icon: UserCog, href: '/employees', permission: 'employees' },
    { label: 'Users', icon: UserPlus, href: '/users', permission: 'users' },
  ]},
  { title: 'REPORTING', items: [
    { label: 'Reports', icon: FileDown, href: '/reports', permission: 'reports' },
    { label: 'Audit Logs', icon: ScrollText, href: '/audit-logs', permission: 'audit-logs' },
  ]},
  { title: 'SYSTEM', items: [
    { label: 'Settings', icon: Settings, href: '/settings', permission: 'settings' },
  ]},
]

export interface NavSectionItem {
  label: string
  icon: LucideIcon
  href: string
  permission: string
}

export interface NavSection {
  title: string
  items: NavSectionItem[]
}

interface PremiumSidebarProps {
  open: boolean
  onClose: () => void
  userRole: UserRole
  userEmail: string
  userName?: string
  onLogout: () => void
  currentPath?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  navSections?: NavSection[]
  brandSubtitle?: string
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])

  return matches
}

export default function PremiumSidebar({
  open,
  onClose,
  userRole,
  userEmail,
  userName,
  onLogout,
  currentPath,
  collapsed = false,
  onToggleCollapse,
  navSections,
  brandSubtitle,
}: PremiumSidebarProps) {
  const { branding } = useBranding()
  const [liveTime, setLiveTime] = useState(new Date())
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getNavItems = (sectionItems: typeof NAV_SECTIONS[0]['items']) =>
    sectionItems.filter(item => PERMISSIONS[userRole]?.includes(item.permission))

  const isCollapsed = collapsed && isDesktop
  const institutionLogo = branding?.logo_url || '/images/afcsc-logo.png'
  const displayName = userName || userEmail?.split('@')[0] || 'User'

  return (
    <>
      <AnimatePresence>
        {open && !isDesktop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{
          x: isDesktop ? 0 : (open ? 0 : '-100%'),
          width: isCollapsed ? 80 : 280,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 left-0 z-50 flex flex-col bg-[#10150D] border-r border-[rgba(85,107,47,0.35)] shadow-2xl lg:relative lg:translate-x-0 lg:w-[280px]"
      >
        <div className="flex items-center justify-between p-4 border-b border-[rgba(85,107,47,0.35)] flex-shrink-0">
          <Link
            href="/"
            className="flex items-center justify-center w-full transition-opacity duration-200 hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-slate-900 rounded"
             aria-label="Nigerian Army Aviation Command Visitor Management - Go to homepage"
             title="Go to homepage"
          >
            <motion.div
              className="flex items-center gap-2.5 w-full"
              style={{ display: isCollapsed ? 'flex' : 'flex' }}
            >
              <ImageWithFallback
                src={institutionLogo}
                alt="Nigerian Army Aviation Command Logo"
                className="h-8 w-8 object-contain flex-shrink-0"
              />
              {!isCollapsed && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex-1 text-center">
                  <span className="text-xs font-bold text-[#9A9F87] block leading-tight">Nigerian Army Aviation Command</span>
                </motion.div>
              )}
            </motion.div>
          </Link>

          {onToggleCollapse && isDesktop && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-[#9A9F87] hover:text-white hover:bg-[#4B5320]/10 transition-colors"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </motion.button>
          )}

          {!isDesktop && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-[#9A9F87] hover:text-white hover:bg-[#4B5320]/10 transition-colors"
              aria-label="Close sidebar"
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>
          )}
        </div>

        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="p-4 border-b border-[rgba(85,107,47,0.35)] bg-gradient-to-br from-[#10150D] to-[#0B0F08]"
          >
          <p className="text-sm font-medium text-[#F5F5DC]">
             {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {displayName}
          </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-2 w-2 rounded-full bg-[#6B8E23] animate-pulse" />
              <p className="text-xs text-[#9A9F87] font-mono">
                {liveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
            <p className="text-xs text-[#9A9F87] mt-1 capitalize">{userRole}</p>
          </motion.div>
        )}

        <nav className={`flex-1 overflow-y-auto scrollbar-thin ${isCollapsed ? 'p-2' : 'p-3'}`}>
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
            {(navSections ?? NAV_SECTIONS).map((section) => {
              const items = navSections ? section.items : getNavItems(section.items)
              if (items.length === 0) return null
              return (
                <div key={section.title}>
                  {!isCollapsed && (
                    <h3 className="px-3 mb-2 text-[10px] font-bold text-[#9A9F87] uppercase tracking-widest">
                      {section.title}
                    </h3>
                  )}
                  <motion.ul variants={staggerContainer} className="space-y-0.5">
                    {items.map((item) => {
                      const isActive = currentPath === item.href || (item.href !== '/dashboard' && currentPath?.startsWith(item.href))
                      return (
                        <motion.li key={item.label} variants={fadeUp} custom={0}>
                           <a
                             href={item.href}
                             onClick={() => { if (!isDesktop) onClose() }}
                             className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                               isActive
                                 ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                 : 'text-[#9A9F87] hover:bg-[#4B5320]/10 hover:text-white'
                             } ${isCollapsed ? 'justify-center' : ''}`}
                             aria-label={item.label}
                             title={isCollapsed ? item.label : undefined}
                           >
                             <div className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                               isActive ? 'bg-primary/20 text-white' : 'text-[#9A9F87] group-hover:text-[#F5F5DC]'
                             }`}>
                              <item.icon className="h-4 w-4" />
                            </div>
                            {!isCollapsed && <span>{item.label}</span>}
                            {isActive && !isCollapsed && (
                              <motion.div
                                layoutId="sidebar-active-indicator"
                                className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              />
                            )}
                          </a>
                        </motion.li>
                      )
                    })}
                  </motion.ul>
                </div>
              )
            })}
          </motion.div>
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-[rgba(85,107,47,0.35)]">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onLogout}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#f87171] hover:bg-[#8B3A3A]/20 transition-colors ${
              isCollapsed ? 'justify-center' : ''
            }`}
            aria-label="Logout"
            title={isCollapsed ? 'Logout' : undefined}
          >
            <div className="p-1.5 rounded-lg bg-[#8B3A3A]/20 text-[#f87171] flex-shrink-0">
              <LogOut className="h-4 w-4" />
            </div>
            {!isCollapsed && <span>Logout</span>}
          </motion.button>
        </div>
      </motion.aside>
    </>
  )
}

