/**
 * THE REVIEW QUEUE ON TEST (the release checklist of 28 October 2026, A5): an unverified, an ended and a duplicate
 * night cannot enter a public campaign. The real planner input (store.readCampaignNights) against the TEST database
 * (never production), with four nights planted in Geelong this week and removed again:
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-review-queue-drive.mts
 *
 * The control (published, public, its listing fresh) must reach the planner and a plan, so the test can fail; the
 * three that must not: a draft (never verified for the public), a listing whose source was last confirmed past its
 * 21 days (no longer verified), and a night already over. The duplicate is the planner's own rule, one night per
 * title in a set (tests/unit/social/creative-treatments.test.ts), driven here on the real read: a second Geelong
 * night with the control's title, a day later, reaches the planner and never a plan beside it. Nothing of the
 * campaign tables is written, so the demonstration week left on TEST is untouched. Each check prints PASS or FAIL;
 * the last line is the verdict, after the planted rows are removed and their absence read back.
 */
import Module from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as StoreModule from '@/lib/social/store'
import type * as CampaignModule from '@/lib/social/campaign'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const storeMod = (await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule }
const store = (storeMod.default ?? storeMod) as typeof StoreModule
const campaignMod = (await import('@/lib/social/campaign')) as typeof CampaignModule & { default?: typeof CampaignModule }
const campaign = (campaignMod.default ?? campaignMod) as typeof CampaignModule

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-review-queue-drive runs on TEST only')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
let fails = 0
const check = (name: string, ok: boolean, seen: unknown = null) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}

const now = new Date()
const HOUR = 3600_000
const stamp = now.getTime().toString(36)
const weekStart = campaign.weekStartOf(now)
const cities = [{ slug: 'geelong', name: 'Geelong' }]

/* An owner TEST already has: any published Geelong night's organisation, its maker and its cover (a published public
 * night must carry a real cover, events_published_real_cover, 20260504000001). */
const { data: owner, error: ownerErr } = await db.from('events').select('organisation_id, created_by, cover_image_url').eq('status', 'published').ilike('venue_city', 'geelong').limit(1).maybeSingle()
check('a TEST organisation to plant the nights under', Boolean(owner?.organisation_id && owner?.created_by), ownerErr?.message ?? owner)
if (!owner) process.exit(1)

/* Tomorrow evening in Melbourne, inside this week unless this is Sunday (the drive then says so and stops). */
const soon = new Date(now.getTime() + 18 * HOUR)
if (campaign.weekStartOf(soon) !== weekStart) {
  console.log('FAIL the drive needs tomorrow inside this week; run it Monday to Saturday')
  process.exit(1)
}
const title = `Review queue control ${stamp}`
const base = (over: Record<string, unknown>) => ({
  id: randomUUID(),
  title,
  slug: `review-queue-${stamp}-${Math.random().toString(36).slice(2, 7)}`,
  organisation_id: owner.organisation_id,
  created_by: owner.created_by,
  cover_image_url: owner.cover_image_url,
  start_date: soon.toISOString(),
  end_date: new Date(soon.getTime() + 3 * HOUR).toISOString(),
  status: 'published',
  visibility: 'public',
  venue_name: 'Review Queue Hall',
  venue_city: 'Geelong',
  timezone: 'Australia/Melbourne',
  is_free: true,
  listing_source: 'organiser',
  ...over,
})
const planted = {
  control: base({}),
  draft: base({ title: `Review queue draft ${stamp}`, status: 'draft' }),
  stale: base({ title: `Review queue stale listing ${stamp}`, listing_source: 'eventlinqs', listing_fresh_until: new Date(now.getTime() - 24 * HOUR).toISOString() }),
  ended: base({ title: `Review queue ended ${stamp}`, start_date: new Date(now.getTime() - 5 * HOUR).toISOString(), end_date: new Date(now.getTime() - 2 * HOUR).toISOString() }),
  duplicate: base({ start_date: new Date(soon.getTime() + 24 * HOUR).toISOString(), end_date: new Date(soon.getTime() + 27 * HOUR).toISOString() }),
}
const ids = Object.values(planted).map((e) => e.id as string)
for (const [name, row] of Object.entries(planted)) console.log(`MADE event ${row.id} (${name})`)

try {
  const { error: insErr } = await db.from('events').insert(Object.values(planted))
  check('the five nights are planted on TEST', !insErr, insErr?.message)
  if (insErr) throw new Error(insErr.message)

  const nights = await store.readCampaignNights(db, cities, weekStart, now)
  const read = new Set(nights.map((n) => n.eventId))
  check('the control reaches the planner (published, public, fresh)', read.has(planted.control.id as string), nights.length)
  check('a draft never reaches the planner (unverified)', !read.has(planted.draft.id as string))
  check('a listing past its 21 days never reaches the planner (no longer verified)', !read.has(planted.stale.id as string))
  check('a night already over never reaches the planner (expired)', !read.has(planted.ended.id as string))
  check('the duplicate is read, so the planner itself is what keeps it out', read.has(planted.duplicate.id as string))

  /* Only the planted nights, so the control is certain of a place: Geelong's week ahead and weekend need two. */
  const mine = nights.filter((n) => ids.includes(n.eventId))
  const plan = campaign.planCampaign({ nights: mine, cities, weekStart, origin: 'https://www.eventlinqs.com.au' })
  const inPlan = new Set(plan.pieces.flatMap((p) => p.eventIds))
  check('the control reaches a plan', inPlan.has(planted.control.id as string), plan.pieces.map((p) => p.kind))
  check('no piece carries the draft, the stale listing or the ended night', ![planted.draft, planted.stale, planted.ended].some((e) => inPlan.has(e.id as string)))
  const both = plan.pieces.filter((p) => p.eventIds.includes(planted.control.id as string) && p.eventIds.includes(planted.duplicate.id as string))
  check('no set carries the same title twice (the duplicate)', both.length === 0, both.map((p) => p.kind))
} catch (e) {
  check('the drive ran to its end', false, e instanceof Error ? e.message : String(e))
} finally {
  const { error: delErr } = await db.from('events').delete().in('id', ids)
  const { data: left } = await db.from('events').select('id').in('id', ids)
  check('every planted night is removed again', !delErr && (left ?? []).length === 0, delErr?.message ?? left)
  console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED (${fails} failure(s))`)
  process.exit(fails === 0 ? 0 : 1)
}
