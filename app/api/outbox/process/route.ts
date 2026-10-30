import { NextRequest, NextResponse } from 'next/server'
import { processOutboxBatch } from '@/lib/server/outbox-processor'
import { isDemoMode } from '@/lib/demo'
import { checkRateLimit, rateLimitResponse } from '@/lib/server/rate-limit'

// ---------------------------------------------------------------------------
// Security: This endpoint processes the transactional outbox.
// It requires a server-side scheduler secret via the Authorization header.
//
// Configuration (server-only, never exposed to browser):
//   OUTBOX_PROCESSOR_SECRET — a strong random string (min 32 chars).
//   Set this in your deployment environment (Vercel env vars, etc.).
//   The scheduler (cron, Vercel cron, Supabase pg_cron) must send:
//     Authorization: Bearer <OUTBOX_PROCESSOR_SECRET>
//
// In demo mode, processing is a no-op.
// ---------------------------------------------------------------------------

const MAX_BATCH_SIZE = 25

export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, data: { processed: 0, failed: 0, skipped: 0, message: 'Demo mode' } })
  }

  // Rate limiting
  const rateLimit = checkRateLimit(request)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetAt)
  }

  // Scheduler secret validation
  const secret = process.env.OUTBOX_PROCESSOR_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, message: 'Outbox processor not configured', error: 'Server misconfiguration' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, message: 'Missing authorization', error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const providedToken = authHeader.slice(7)
  if (providedToken !== secret) {
    return NextResponse.json(
      { success: false, message: 'Invalid authorization', error: 'Forbidden' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(
      Math.max(1, typeof body?.batchSize === 'number' ? body.batchSize : 10),
      MAX_BATCH_SIZE
    )

    const result = await processOutboxBatch(batchSize)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('Outbox processing error:', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json(
      { success: false, message: 'Outbox processing failed', error: 'internal' },
      { status: 500 }
    )
  }
}
