import { NextResponse, type NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { backfillPendingConfirms, readSenderConfirms } from '@/lib/newsletter/pending-backfill'

/**
 * POST /api/cron/newsletter-pending-backfill (law 50 (a); the PM's 10:07 of 21 November 2026). Started by hand from
 * .github/workflows/newsletter-pending-backfill.yml, never on a schedule. CRON_SECRET only. A dry run by default; with
 * ?apply=1 each pending newsletter signup is made a subscriber, its click the record (src/lib/newsletter/
 * pending-backfill.ts). The sender's key lives only on production, which is why this runs here. The answer is counts
 * and city slugs only, never an address, because the workflow's log is public.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  const apply = new URL(request.url).searchParams.get('apply') === '1'
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'no_sender_key' }, { status: 503 })
  let read
  try {
    read = await readSenderConfirms(fetch, key)
  } catch (error) {
    console.error('[newsletter-pending-backfill] the sender log could not be read:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ ok: false, error: 'sender_log_unreadable' }, { status: 502 })
  }
  const result = await backfillPendingConfirms(createAdminClient(), read.confirms, { apply })
  console.log(`[newsletter-pending-backfill] ${result.mode}: ${read.pages} pages, complete ${read.complete}, pending ${result.pending}, recorded ${result.recorded}`)
  return NextResponse.json({ ok: true, pagesRead: read.pages, complete: read.complete, ...result })
}
