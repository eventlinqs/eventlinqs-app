import { NextResponse, type NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { graphCaller, metaConfigFrom } from '@/lib/social/meta-publisher'
import { readBackHandle, verifiedOnReadBack } from '@/lib/social/handle-readback'

/**
 * POST /api/cron/instagram-handle-readback (law 40 (c); the PM's 10:15 of 21 November 2026, ruling 8). Started by hand
 * from .github/workflows/instagram-handle-readback.yml until proved, never on a schedule yet. CRON_SECRET only. Reads
 * every organiser whose handle came from its own website (instagram_verified_source) and is not yet verified, asks Meta's
 * Graph API whether Instagram shows that account, one a second, and with ?apply=1 writes instagram_verified_at for each
 * one it shows. A dry run writes nothing. The answer names each handle and its outcome: business usernames, public.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  const apply = new URL(request.url).searchParams.get('apply') === '1'
  const config = metaConfigFrom(process.env)
  if (!config) return NextResponse.json({ ok: false, error: 'meta_not_wired' }, { status: 503 })
  const db = createAdminClient()
  const read = await db
    .from('organisers')
    .select('id, instagram_handle, instagram_verified_source')
    .not('instagram_handle', 'is', null)
    .not('instagram_verified_source', 'is', null)
    .is('instagram_verified_at', null)
    .order('id', { ascending: true })
    .limit(100)
  if (read.error) return NextResponse.json({ ok: false, error: 'organisers_unreadable' }, { status: 502 })
  const call = graphCaller(config.pageToken)
  const outcomes: Array<{ handle: string; found: boolean; verified: boolean; reason?: string }> = []
  for (const [i, o] of (read.data ?? []).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000))
    const r = await readBackHandle(call, config.igUserId, o.instagram_handle as string)
    const ok = verifiedOnReadBack(r, o.instagram_verified_source)
    let verified = false
    if (ok && apply) {
      const w = await db
        .from('organisers')
        .update({ instagram_verified_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('instagram_handle', o.instagram_handle as string)
        .is('instagram_verified_at', null)
      verified = !w.error
    }
    outcomes.push({ handle: r.handle, found: r.found, verified, ...(r.found ? {} : { reason: r.reason }) })
  }
  const shown = outcomes.filter((o) => o.found).length
  console.log(`[instagram-handle-readback] ${apply ? 'apply' : 'dry run'}: ${outcomes.length} read, ${shown} shown by Instagram, ${outcomes.filter((o) => o.verified).length} verified`)
  return NextResponse.json({ ok: true, mode: apply ? 'apply' : 'dry_run', read: outcomes.length, shown, verified: outcomes.filter((o) => o.verified).length, outcomes })
}
