import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * SWEEP ABANDONED COMPOSER ARTWORK.
 *
 * Anonymous drafts live 30 days in Redis (KIT_DRAFT_TTL_SECONDS) and then
 * vanish on their own, because a TTL expresses "this is ephemeral" directly.
 * Supabase Storage has no equivalent, so the OBJECTS would outlive the drafts
 * that point at them forever. This is the piece that stops that, and it is
 * designed in rather than bolted on because an upload endpoint whose bytes are
 * never deleted is a storage bill with no ceiling.
 *
 * THIRTY-ONE DAYS, NOT THIRTY, so a draft that is still alive is never stripped
 * of its artwork by a clock race between the Redis TTL and this sweep.
 *
 * THE COST, AND WHY THIS IS THE SMALLER LEVER. At 1,000 drafts a day carrying a
 * 2MB phone photo each, raw uploads would be about 2GB a day and roughly 60GB
 * at steady state. The upload route re-encodes to WebP at the long-edge ceiling
 * first, which brings a typical photo to 200-400KB, so the real figure is about
 * 300MB a day and under 10GB at steady state. The DOWNSCALE is the bigger
 * control by an order of magnitude; this sweep is what stops even that number
 * growing without bound. Both are needed.
 *
 * Fail-closed on the shared cron secret, like every other cron route.
 */

const BUCKET = 'kit-draft-covers'
const MAX_AGE_DAYS = 31
/** Supabase Storage list() caps at 100 by default; page explicitly. */
const PAGE = 100

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  let scanned = 0
  let deleted = 0
  const failures: string[] = []

  // Objects are stored one level deep as <kitCode>/cover.webp, so the sweep
  // walks the code prefixes and then the single object inside each.
  let offset = 0
  for (;;) {
    const { data: prefixes, error } = await admin.storage
      .from(BUCKET)
      .list('', { limit: PAGE, offset })
    if (error) {
      console.error('[sweep-kit-covers] list failed:', error)
      return NextResponse.json({ ok: false, error: 'list_failed' }, { status: 502 })
    }
    if (!prefixes || prefixes.length === 0) break

    for (const prefix of prefixes) {
      const { data: objects, error: innerError } = await admin.storage
        .from(BUCKET)
        .list(prefix.name, { limit: PAGE })
      if (innerError) {
        failures.push(prefix.name)
        continue
      }
      for (const object of objects ?? []) {
        scanned += 1
        // created_at is what matters: the object is replaced in place on
        // re-upload, and an organiser who swaps their photo on day 20 should
        // still get the full life from that swap, which upsert refreshes.
        const stamp = object.updated_at ?? object.created_at
        if (!stamp || new Date(stamp).getTime() > cutoff) continue

        const path = `${prefix.name}/${object.name}`
        const { error: removeError } = await admin.storage.from(BUCKET).remove([path])
        if (removeError) {
          failures.push(path)
          continue
        }
        deleted += 1
      }
    }

    if (prefixes.length < PAGE) break
    offset += PAGE
  }

  return NextResponse.json({
    ok: true,
    scanned,
    deleted,
    maxAgeDays: MAX_AGE_DAYS,
    failures: failures.length,
  })
}
