'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { getAuthHeaders } from '@/lib/client/api'
import { Loader2, Users, UserCheck, XCircle, ShieldAlert, Car, LogOut, Clock, AlertTriangle, ShieldCheck, PackageSearch } from 'lucide-react'
import type { SecurityDashboardStats } from '@/lib/types/security'
import NotificationBell from '@/components/notifications/NotificationBell'

export default function SecurityDashboardPage() {
  const [stats, setStats] = useState<SecurityDashboardStats>({
    visitorsWaitingAtGate: 0,
    visitorsCleared: 0,
    visitorsDenied: 0,
    visitorsCurrentlyInside: 0,
    expiredBadges: 0,
    vehiclesInside: 0,
    visitorsDueToExit: 0,
    watchlistMatches: 0,
  })
  const [propertyStats, setPropertyStats] = useState({
    itemsInside: 0,
    confiscatedItems: 0,
    pendingRelease: 0,
    missingItemAlerts: 0,
    confiscationAlerts: 0,
  })
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const [securityRes, propertyRes] = await Promise.all([
        fetch('/api/security/stats', { headers: await getAuthHeaders() }),
        fetch('/api/assets/stats', { headers: await getAuthHeaders() }),
      ])
      const securityJson = await securityRes.json()
      const propertyJson = await propertyRes.json()
      if (securityJson.success) {
        setStats(securityJson.data)
      }
      if (propertyJson.success) {
        setPropertyStats({
          itemsInside: propertyJson.data.itemsInside || 0,
          confiscatedItems: propertyJson.data.confiscatedItems || 0,
          pendingRelease: propertyJson.data.pendingRelease || 0,
          missingItemAlerts: 0,
          confiscationAlerts: propertyJson.data.confiscatedItems || 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch security stats:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      if (!user.role) {
        window.location.href = '/unauthorized'
        return
      }
      if (!PERMISSIONS[user.role]?.includes('scanner')) {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchStats()
    }
    checkAuth()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('security-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_activities' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_items' }, () => fetchStats())
      .subscribe()

    const pollInterval = setInterval(() => {
      fetchStats()
    }, 10000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchStats()
      }
    }
    const onFocus = () => {
      fetchStats()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchStats])

  if (authChecking || loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const cards = [
    { title: 'Visitors Waiting at Gate', value: stats.visitorsWaitingAtGate.toString(), icon: Users, color: 'amber', href: '/security/gate' },
    { title: 'Visitors Cleared', value: stats.visitorsCleared.toString(), icon: UserCheck, color: 'green', href: '/security/gate' },
    { title: 'Visitors Denied', value: stats.visitorsDenied.toString(), icon: XCircle, color: 'red', href: '/security/gate' },
    { title: 'Visitors Currently Inside', value: stats.visitorsCurrentlyInside.toString(), icon: ShieldAlert, color: 'blue', href: '/security/gate-activity' },
    { title: 'Expired Badges', value: stats.expiredBadges.toString(), icon: AlertTriangle, color: 'red', href: '/security/gate-activity' },
    { title: 'Vehicles Inside', value: stats.vehiclesInside.toString(), icon: Car, color: 'purple', href: '/security/gate-activity' },
    { title: 'Visitors Due to Exit', value: stats.visitorsDueToExit.toString(), icon: LogOut, color: 'orange', href: '/security/exit' },
    { title: 'Watchlist Matches', value: stats.watchlistMatches.toString(), icon: Clock, color: 'red', href: '/security/watchlist' },
    { title: 'Property Items Inside', value: propertyStats.itemsInside.toString(), icon: PackageSearch, color: 'green', href: '/assets' },
    { title: 'Confiscated Items', value: propertyStats.confiscatedItems.toString(), icon: ShieldAlert, color: 'red', href: '/assets' },
    { title: 'Pending Release', value: propertyStats.pendingRelease.toString(), icon: Clock, color: 'amber', href: '/assets' },
    { title: 'Confiscation Alerts', value: propertyStats.confiscationAlerts.toString(), icon: AlertTriangle, color: 'red', href: '/assets' },
  ]

  return (
    <div className="min-h-screen bg-[#0B0F08]">
        <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#F5F5DC]">Security Dashboard</h1>
              <p className="text-sm text-[#9A9F87]">Live gate and security operations overview</p>
            </div>
            <NotificationBell />
          </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <a
              key={card.title}
              href={card.href}
              className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#9A9F87]">{card.title}</p>
                <card.icon className={`h-4 w-4 ${
                  card.color === 'green' ? 'text-green-600' :
                  card.color === 'red' ? 'text-red-600' :
                  card.color === 'amber' ? 'text-amber-600' :
                  card.color === 'blue' ? 'text-blue-600' :
                  card.color === 'purple' ? 'text-purple-600' :
                  card.color === 'orange' ? 'text-orange-600' : 'text-[#9A9F87]'
                }`} />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#F5F5DC]">{card.value}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}


