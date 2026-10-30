import { requireRole } from '@/lib/auth-helpers'
import { getBadge } from '@/lib/badge/badge-service'
import { getBranding } from '@/lib/server/branding'
import { isDemoMode } from '@/lib/demo'
import PrintableBadge from '@/components/badges/PrintableBadge'
import type { BrandingSettings } from '@/lib/types/branding'
import type { VisitorBadge } from '@/lib/badge/badge-types'

export const dynamic = 'force-dynamic'

export default async function PrintBadgeRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (isDemoMode()) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-[#9A9F87]">Demo mode: badge preview not available (no persisted badges)</div>
      </div>
    )
  }

  const authResult = await requireRole(['Admin', 'Receptionist'])
  if (!authResult.authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-red-600">Unauthorized</div>
      </div>
    )
  }

  const [badge, branding] = await Promise.all([
    getBadge(id),
    getBranding(),
  ])

  if (!badge) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-red-600">Badge not found</div>
      </div>
    )
  }

  return <PrintableBadge badge={badge} branding={branding} />
}
