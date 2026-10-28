/**
 * PART H ON TEST (the EventLinqs engine plan of 28 October 2026): /go and its counted hop, the organiser's report after
 * each night kept by the real sweep, and /admin/today's queue, through their real readers and writers
 * (src/lib/growth/go.ts, src/app/go/[piece]/route.ts, src/lib/growth/organiser-report.ts, src/lib/admin/today.ts)
 * against the TEST database, never production.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/engine-today-drive.mts
 *
 * Plants a campaign in a past week (June 2026, so no real week is touched) with three posted pieces and a partner kit:
 * one naming a night still ahead (listed on /go), one naming only an ended night (not listed, but named in that night's
 * report with its /go taps), and a kit that was sent (never listed). Presses the hop as a person, twice, as a crawler,
 * on an unknown piece and on the kit; runs the report sweep twice; tries the table's refusals; reads the queue with a
 * planted removal request. Prints MADE lines for scripts/verify/engine-today-drive-cleanup.sql. Each check prints PASS
 * or FAIL; the last line is the verdict.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as GoModule from '@/lib/growth/go'
import type * as ReportModule from '@/lib/growth/organiser-report'
import type * as TodayModule from '@/lib/admin/today'
import type * as RouteModule from '@/app/go/[piece]/route'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const go = unwrap((await import('@/lib/growth/go')) as typeof GoModule & { default?: typeof GoModule })
const reports = unwrap((await import('@/lib/growth/organiser-report')) as typeof ReportModule & { default?: typeof ReportModule })
const today = unwrap((await import('@/lib/admin/today')) as typeof TodayModule & { default?: typeof TodayModule })
const route = unwrap((await import('@/app/go/[piece]/route')) as typeof RouteModule & { default?: typeof RouteModule })

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('engine-today-drive runs on TEST only')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
let fails = 0
const check = (name: string, ok: boolean, seen: unknown = null) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}

const started = new Date()
const stamp = started.getTime().toString(36)
const DAY = 24 * 60 * 60 * 1000
const ORIGIN = 'https://www.eventlinqs.com.au'
const PERSON = { 'user-agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) bp-drive-${stamp}`, 'x-real-ip': '203.0.113.7' }
const CRAWLER = { 'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'x-real-ip': '203.0.113.8' }

const { data: admin } = await db.from('admin_users').select('id').limit(1).maybeSingle()
const by = admin?.id as string
check('a TEST admin to approve and record as', Boolean(by), admin)

/** A piece of window 3's model with its approved, posted revision. */
async function makePiece(campaignId: string, o: { kind: string; city: string; hook: string; nightIds: string[]; approvedAt: string; postUrl: string; link: string; partner?: string }): Promise<string> {
  const { data: p, error } = await db
    .from('social_pieces')
    .insert({
      campaign_id: campaignId,
      kind: o.kind,
      city: o.city,
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: 'bp engine drive',
      next_step: 'Open the night on EventLinqs',
      outcome: 'Visits through this post',
      link: o.link,
      format: 'feed',
      partner_name: o.partner ?? null,
    })
    .select('id')
    .single()
  if (error || !p) throw new Error(`piece: ${error?.message}`)
  console.log(`MADE piece ${p.id}`)
  const { error: rerr } = await db.from('social_piece_revisions').insert({
    piece_id: p.id,
    version: 1,
    event_ids: o.nightIds,
    picks: [],
    mode: 'type_led',
    slides: [{ t: 'cover', title: 'bp engine drive' }],
    caption: 'bp engine drive caption',
    versions: { instagram: { hook: o.hook, caption: 'bp' }, facebook: { hook: o.hook, caption: 'bp' } },
    made_by: 'planner',
  })
  if (rerr) throw new Error(`revision: ${rerr.message}`)
  const { data: ap, error: aerr } = await db.from('social_piece_approvals').insert({ piece_id: p.id, revision: 1, approved_by: by, approved_at: o.approvedAt }).select('id, approved_at').single()
  if (aerr || !ap) throw new Error(`approval: ${aerr?.message}`)
  const { error: gerr } = await db.from('social_piece_postings').insert({ piece_id: p.id, approval_id: ap.id, post_url: o.postUrl, posted_at: ap.approved_at as string, recorded_by: by })
  if (gerr) throw new Error(`posting: ${gerr.message}`)
  return p.id as string
}

async function press(pieceId: string, headers: Record<string, string>, via = 'facebook'): Promise<URL> {
  const res = await route.GET(new NextRequest(`${ORIGIN}/go/${pieceId}?via=${via}`, { headers }), { params: Promise.resolve({ piece: pieceId }) })
  check(`the hop answers 302, never cached, never indexed (${pieceId.slice(0, 8)})`, res.status === 302 && res.headers.get('cache-control') === 'no-store' && /noindex/.test(res.headers.get('x-robots-tag') ?? ''), res.status)
  return new URL(res.headers.get('location') ?? '')
}

const pressesOf = async (pieceId: string) => (await db.from('go_presses').select('id', { count: 'exact', head: true }).eq('piece_id', pieceId)).count ?? -1

try {
  /* The nights: one still ahead and public; one public night that ended inside the report window. */
  const now = Date.now()
  const { data: ahead } = await db.from('events').select('id, title, slug').eq('status', 'published').eq('visibility', 'public').gte('start_date', new Date(now + DAY).toISOString()).order('start_date').limit(1).single()
  const { data: ended } = await db
    .from('events')
    .select('id, title, end_date, organisation_id')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_seed_data', false)
    .gte('end_date', new Date(now - 13 * DAY).toISOString())
    .lte('end_date', new Date(now - 3 * DAY).toISOString())
    .order('end_date')
    .limit(1)
    .single()
  check('a TEST night still ahead and one ended in the report window', Boolean(ahead?.id && ended?.id), { ahead, ended })
  const endedAt = Date.parse(ended?.end_date as string)

  const { data: c, error: cerr } = await db.from('social_campaigns').insert({ week_start: '2026-06-22', planned_by: by }).select('id').single()
  if (cerr || !c) throw new Error(`campaign: ${cerr?.message}`)
  console.log(`MADE campaign ${c.id}`)

  const live = await makePiece(c.id, { kind: 'weekend_carousel', city: 'melbourne', hook: `bp drive: say yes to this weekend ${stamp}`, nightIds: [ahead?.id as string], approvedAt: new Date(now - 60_000).toISOString(), postUrl: `https://www.instagram.com/p/bpgo-${stamp}-a/`, link: `${ORIGIN}/city/melbourne` })
  const past = await makePiece(c.id, { kind: 'venue_spotlight', city: 'melbourne', hook: `bp drive: an ended night ${stamp}`, nightIds: [ended?.id as string], approvedAt: new Date(endedAt - 3 * DAY).toISOString(), postUrl: `https://www.instagram.com/p/bpgo-${stamp}-b/`, link: `${ORIGIN}/events/somewhere` })
  const kit = await makePiece(c.id, { kind: 'partner_kit', city: 'melbourne', hook: `bp drive: a kit ${stamp}`, nightIds: [ahead?.id as string], approvedAt: new Date(now - 60_000).toISOString(), postUrl: 'sent', link: `${ORIGIN}/events/${ahead?.slug}`, partner: `bp drive host ${stamp}` })

  /* /go lists the live piece, in its approved words, and nothing else of ours. */
  const links = await go.readGoLinks(new Date())
  const mine = links.filter((l) => [live, past, kit].includes(l.pieceId))
  check('/go lists the posted piece whose night is still ahead, in its approved words', mine.length === 1 && mine[0].pieceId === live && mine[0].words.includes(stamp), mine)
  check('/go never lists a piece whose only night has ended, nor a partner kit that was sent', !mine.some((l) => l.pieceId === past || l.pieceId === kit), mine)

  /* The hop: a person counted once a day, landing on the stored path on this site; a crawler never counted. */
  const landing = await press(live, PERSON)
  check('a press lands on the piece\'s stored path on this site, tagged for the visit ledger', landing.origin === ORIGIN && landing.pathname === '/city/melbourne' && landing.searchParams.get('utm_source') === 'facebook' && landing.searchParams.get('utm_medium') === 'social' && landing.searchParams.get('utm_campaign') === 'go', landing.toString())
  check('the press is counted', (await pressesOf(live)) === 1, await pressesOf(live))
  await press(live, PERSON)
  check('the same person pressing again that day is one press', (await pressesOf(live)) === 1, await pressesOf(live))
  await press(live, CRAWLER)
  check('a link preview crawler is never counted', (await pressesOf(live)) === 1, await pressesOf(live))
  const unknown = await press('00000000-0000-4000-8000-000000000000', PERSON)
  check('an unknown piece lands on /events, nothing counted', unknown.pathname === '/events', unknown.toString())
  const kitLanding = await press(kit, PERSON)
  check('a partner kit (sent, never posted) is not a /go link: /events, nothing counted', kitLanding.pathname === '/events' && (await pressesOf(kit)) === 0, kitLanding.toString())

  /* The ended night's post: two taps before the night ended. */
  const { error: gp } = await db.from('go_presses').insert([
    { piece_id: past, via: 'instagram', visitor: `bpdrive${stamp}aaaa`, day: '2026-06-01', pressed_at: new Date(endedAt - 2 * DAY).toISOString() },
    { piece_id: past, via: 'instagram', visitor: `bpdrive${stamp}bbbb`, day: '2026-06-01', pressed_at: new Date(endedAt - DAY).toISOString() },
  ])
  check('two earlier taps on the ended night\'s post are planted', !gp, gp)

  /* The sweep, twice: the night gets one report, written once. */
  const run1 = await reports.runOrganiserReports(new Date())
  console.log(`SWEEP 1 due=${run1.due} written=${run1.written} failed=${run1.failed}`)
  check('the first sweep writes every report owed, none failing', run1.failed === 0 && run1.written === Math.min(run1.due, 40) && run1.written > 0, run1)
  const { data: kept } = await db.from('organiser_night_reports').select('id, figures, night_ended_at, read_at, sent_at').eq('event_id', ended?.id as string).maybeSingle()
  const f = kept?.figures as { version?: number; viewers?: number; numbers?: { views?: number }; pressesOut?: { people?: number }; posts?: { pieceId: string; goPresses: number; nightsNamed: number }[]; instagramReach?: unknown; ownLink?: unknown } | undefined
  check('the ended night has its report, kept with the figures message 8 fills from', Boolean(kept) && f?.version === 1 && typeof f?.viewers === 'number' && typeof f?.numbers?.views === 'number' && typeof f?.pressesOut?.people === 'number', kept)
  check('the report names the post that named the night, with its two taps', (f?.posts ?? []).some((p) => p.pieceId === past && p.goPresses === 2 && p.nightsNamed === 1), f?.posts)
  check('no Instagram reach is in it, since nobody entered one', f?.instagramReach === null, f?.instagramReach)
  check('a report is kept held: nothing marks it sent', kept?.sent_at === null, kept?.sent_at)
  const run2 = await reports.runOrganiserReports(new Date())
  const { count: rowsForNight } = await db.from('organiser_night_reports').select('id', { count: 'exact', head: true }).eq('event_id', ended?.id as string)
  check('the second sweep writes nothing again: one report per night', (run1.due > 40 || run2.written === 0) && rowsForNight === 1, { run2, rowsForNight })

  /* The table's own refusals, with the app's checks absent. */
  const { error: e1 } = await db.from('organiser_night_reports').update({ figures: { version: 1, viewers: 999999 } }).eq('id', kept?.id as string)
  check('a kept report\'s figures cannot be changed', Boolean(e1) && /permission denied|kept as they were read/.test(e1?.message ?? ''), e1?.message)
  const { error: e2 } = await db.from('organiser_night_reports').update({ sent_at: new Date().toISOString() }).eq('id', kept?.id as string)
  check('a sending is recorded whole, never a time without a person', Boolean(e2) && /sent_whole|check constraint/.test(e2?.message ?? ''), e2?.message)
  const { error: e3 } = await db.from('organiser_night_reports').insert({ event_id: ahead?.id, organisation_id: ended?.organisation_id, figures: { version: 1 }, night_ended_at: new Date(now + DAY).toISOString(), read_at: new Date(now + 2 * DAY).toISOString() })
  check('a night that has not ended cannot be reported', Boolean(e3) && /not before/.test(e3?.message ?? ''), e3?.message)

  /* Signed out visitors read and write neither table. */
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error: a1 } = await anon.from('go_presses').select('id').limit(1)
  const { error: a2 } = await anon.from('organiser_night_reports').select('id').limit(1)
  const { error: a3 } = await anon.from('go_presses').insert({ piece_id: live, via: 'instagram', visitor: 'bpdriveanon0000', day: '2026-06-02' })
  check('a signed out visitor can neither read nor write go_presses or the reports', Boolean(a1) && Boolean(a2) && Boolean(a3), [a1?.message, a2?.message, a3?.message])

  /* The queue: an open removal request is an exception; the sources whose cars have not landed are named. */
  const { data: venue } = await db.from('venues').select('id, name').order('id').limit(1).single()
  const { data: rr, error: rerr } = await db.from('removal_requests').insert({ venue_id: venue?.id, requester_name: `bp drive ${stamp}`, requester_email: 'bp-drive@example.com', reason: 'bp engine drive: please take it down' }).select('id').single()
  if (rerr || !rr) throw new Error(`removal request: ${rerr?.message}`)
  console.log(`MADE removal ${rr.id}`)
  const q = await today.readTodayQueue(new Date())
  const exceptions = q.sections.find((s) => s.key === 'exceptions')
  check('the open removal request waits in Exceptions, in words', (exceptions?.items ?? []).some((i) => i.id === `removal:${rr.id}` && i.what === `bp drive ${stamp} asks for ${venue?.name} to be taken down`), exceptions?.items.map((i) => i.id))
  check('the night just reported is not raised as a report not kept', !(exceptions?.items ?? []).some((i) => i.id === `report:${ended?.id}`), exceptions?.items.map((i) => i.id))
  check(
    "window 6's plays, paused plays, unclear replies and held drafts are read by their real names",
    ['plays', 'paused_sends', 'unclear_replies'].every((k) => q.sections.find((s) => s.key === k)?.unread.length === 0) &&
      !(exceptions?.unread ?? []).some((u) => u.startsWith('Drafts held by a rule')),
    q.sections.map((s) => s.unread),
  )
  check(
    'the queue is never called clear while a source has not landed',
    q.allClear === false && (exceptions?.unread ?? []).some((u) => /not on this database yet/.test(u)),
    q.sections.map((s) => s.unread),
  )
  check('every source that exists was read, none failed', !q.sections.some((s) => s.unread.some((u) => /could not be read/.test(u))), q.sections.map((s) => s.unread))
} catch (err) {
  fails += 1
  console.log(`FAIL the drive stopped: ${err instanceof Error ? err.message : String(err)}`)
}

console.log(`STARTED ${started.toISOString()}`)
console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED (${fails})`)
process.exit(fails === 0 ? 0 : 1)
