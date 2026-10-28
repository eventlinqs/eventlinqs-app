import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sweepWithdrawnImages } from '@/lib/social/store'

export const dynamic = 'force-dynamic'

/**
 * THE HOURLY IMAGE SWEEP (the engine plan's part D, 28 October 2026: "withdrawal pulls images from every unposted post
 * within the hour"). At 25 minutes past each hour, every weekly campaign piece that has not gone and carries an image
 * no longer usable for its slide (withdrawn or replaced by its owner, expired, refused) is given a new version drawn in
 * type, with a decision saying so, so its earlier approval can never post it. A piece that has gone is never touched.
 * Writes campaign versions only; posts nothing and sends nothing.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const result = await sweepWithdrawnImages(createAdminClient(), new Date())
    console.log(`[cron/social-image-sweep] ${result.checked} piece(s) with images checked, ${result.regenerated.length} drawn again in type, ${result.failed.length} failed`)
    for (const f of result.failed) console.error(`[cron/social-image-sweep] ${f}`)
    return NextResponse.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length === 0 ? 200 : 500 })
  } catch (err) {
    console.error('[cron/social-image-sweep] failed:', err)
    return NextResponse.json({ error: 'image sweep failed' }, { status: 500 })
  }
}
