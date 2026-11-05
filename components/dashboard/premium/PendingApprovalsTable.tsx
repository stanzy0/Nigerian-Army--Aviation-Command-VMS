'use client'

import { motion } from 'framer-motion'
import { Clock, FileText, Eye, Calendar, XCircle } from 'lucide-react'
import { fadeIn, staggerContainer } from '@/lib/animations/variants'

interface PendingApproval {
  id: string
  full_name: string
  registration_number: string
  created_at: string
  purpose: string
  employee: { full_name: string; department: string } | null
}

interface PendingApprovalsProps {
  approvals: PendingApproval[]
  onApprove: (id: string) => void
  onReject: (id: string) => Promise<void>
  onViewProfile: (id: string) => void
}

const typeConfig: Record<string, { color: string; bg: string }> = {
  'Visit': { color: 'text-[#4B5320]', bg: 'bg-[#4B5320]/10' },
  'Meeting': { color: 'text-[#C8A646]', bg: 'bg-[#C8A646]/10' },
  'Tour': { color: 'text-[#6B8E23]', bg: 'bg-[#6B8E23]/10' },
  'Interview': { color: 'text-[#556B2F]', bg: 'bg-[#556B2F]/10' },
  'Delivery': { color: 'text-[#B89635]', bg: 'bg-[#B89635]/10' },
  'Training': { color: 'text-[#4B5320]', bg: 'bg-[#4B5320]/10' },
  'Conference': { color: 'text-[#3D5A1E]', bg: 'bg-[#3D5A1E]/10' },
  'default': { color: 'text-[#6B705A]', bg: 'bg-[#6B705A]/10' },
}

export default function PendingApprovalsTable({
  approvals,
  onApprove,
  onReject,
  onViewProfile,
}: PendingApprovalsProps) {
  if (approvals.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-gray-200 bg-white p-4 sm:p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
          <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">0</span>
        </div>
        <div className="p-8 text-center">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">No pending approvals</p>
          <p className="text-xs text-gray-400 mt-1">Visitor registrations will appear here</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
          <p className="text-sm text-gray-500 mt-0.5">{approvals.length} registration{approvals.length !== 1 ? 's' : ''} awaiting review</p>
        </div>
        <motion.span
          layout
          className="text-xs font-medium text-[#9A9F87] bg-[#4B5320]/10 px-2.5 py-1 rounded-full"
        >
          {approvals.length}
        </motion.span>
      </div>

      <div className="overflow-x-auto">
        <motion.table variants={staggerContainer} initial="hidden" animate="visible" className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Visitor</th>
              <th className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Host</th>
              <th className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Time</th>
              <th className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Purpose</th>
              <th className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {approvals.map((approval) => {
              const config = typeConfig[approval.purpose || ''] || typeConfig.default
              return (
                <motion.tr
                  key={approval.id}
                  variants={fadeIn}
                  className="hover:bg-gray-50/80 transition-colors"
                >
                   <td className="px-5 py-3">
                     <div className="flex items-center gap-3">
                       <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                         <span className="text-xs font-bold text-gray-600">
                            {(approval.full_name || '?').charAt(0).toUpperCase()}
                         </span>
                       </div>
                       <div>
                         <p className="font-medium text-gray-900">{approval.full_name ?? 'Unknown Visitor'}</p>
                         <p className="text-xs text-gray-500 font-mono">{approval.registration_number ?? ''}</p>
                       </div>
                     </div>
                   </td>
                   <td className="px-5 py-3">
                     <p className="font-medium text-gray-900">{approval.employee?.full_name || '—'}</p>
                     <p className="text-xs text-gray-500">{approval.employee?.department || '—'}</p>
                   </td>
                   <td className="px-5 py-3">
                     <div className="flex items-center gap-1.5 text-xs text-gray-600">
                       <Calendar className="h-3 w-3" />
                        {approval.created_at ? new Date(approval.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                     </div>
                   </td>
                   <td className="px-5 py-3">
                     <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.color} ${config.bg}`}>
                       {approval.purpose || '—'}
                     </span>
                   </td>
                   <td className="px-5 py-3">
                     <div className="flex items-center justify-end gap-2">
                       <motion.button
                         whileHover={{ scale: 1.05 }}
                         whileTap={{ scale: 0.95 }}
                         onClick={() => onViewProfile(approval.id)}
                          aria-label={`View profile of ${approval.full_name || 'Unknown Visitor'}`}
                         className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-[#C8A646] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C8A646]/50"
                       >
                         <Eye className="h-4 w-4" />
                       </motion.button>
                       <motion.button
                         whileHover={{ scale: 1.05 }}
                         whileTap={{ scale: 0.95 }}
                         onClick={() => onApprove(approval.id)}
                          aria-label={`Approve ${approval.full_name || 'Unknown Visitor'}`}
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50"
                       >
                         <FileText className="h-4 w-4" />
                       </motion.button>
                       <motion.button
                         whileHover={{ scale: 1.05 }}
                         whileTap={{ scale: 0.95 }}
                         onClick={() => onReject(approval.id)}
                          aria-label={`Reject ${approval.full_name || 'Unknown Visitor'}`}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
                       >
                         <XCircle className="h-4 w-4" />
                       </motion.button>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </motion.table>
      </div>
    </motion.div>
  )
}
