/**
 * THE WEEKLY SOCIAL REPORT ON TEST (the release checklist of 28 October 2026: J16, J17, G3 to G5, K14), its real
 * reader and writers (src/lib/growth/social-report.ts) against the TEST database, never production.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-report-drive.mts
 *
 * Makes two campaigns in past weeks (June 2026, so no real week is touched) with pieces of window 3's tables, written
 * directly under their own triggers: the first campaign's report has no baseline and proposes nothing; figures are
 * refused for a piece that has not gone, for watch time on a piece that is not the Reel, read before the piece went or
 * in the future; the newest read is the figure; a partner kit counts its own link's arrivals; the second campaign
 * compares with the first, proposes at most three changes with their data, keeps an approval once and refuses a
 * second answer and an answer to a rule not in the report; signed out and signed in visitors read neither table.
 * Prints MADE lines for scripts/verify/social-report-drive-cleanup.sql. Each check prints PASS or FAIL; the last line
 * is the verdict.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as ReportModule from '@/lib/growth/social-report'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const mod = (await import('@/lib/growth/social-report')) as typeof ReportModule & { default?: typeof ReportModule }
const report = (mod.default ?? mod) as typeof ReportModule

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-report-drive runs on TEST only')
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
const { data: admin } = await db.from('admin_users').select('id').limit(1).maybeSingle()
const by = admin?.id as string
check('a TEST admin to enter and decide as', Boolean(by), admin)
const WEEKS = ['2026-06-01', '2026-06-08']
const ORIGIN = 'https://www.eventlinqs.com.au'

/** One piece of window 3's model: the piece, its first revision, and (when it goes) its approval and posting. */
async function makePiece(campaignId: string, kind: string, city: string, goes: boolean, shareLinkId: string | null = null): Promise<string> {
  const { data: p, error } = await db
    .from('social_pieces')
    .insert({
      campaign_id: campaignId,
      kind,
      city,
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: 'bp report drive',
      next_step: 'Open the week on EventLinqs',
      outcome: 'Visits through this post',
      link: `${ORIGIN}/city/${city}`,
      format: kind === 'discovery_reel' ? 'story' : 'feed',
      partner_name: kind === 'partner_kit' ? `bp drive host ${stamp}` : null,
      ...(shareLinkId ? { share_link_id: shareLinkId } : {}),
    })
    .select('id')
    .single()
  if (error || !p) throw new Error(`piece: ${error?.message}`)
  const slide = [{ t: 'cover', title: 'bp report drive' }]
  const { error: rerr } = await db.from('social_piece_revisions').insert({
    piece_id: p.id,
    version: 1,
    event_ids: [],
    picks: [],
    mode: 'type_led',
    slides: slide,
    caption: 'bp report drive caption',
    versions: { instagram: { caption: 'bp' }, facebook: { caption: 'bp' } },
    made_by: 'planner',
  })
  if (rerr) throw new Error(`revision: ${rerr.message}`)
  if (goes) {
    const { data: ap, error: aerr } = await db.from('social_piece_approvals').insert({ piece_id: p.id, revision: 1, approved_by: by }).select('id, approved_at').single()
    if (aerr || !ap) throw new Error(`approval: ${aerr?.message}`)
    const { error: gerr } = await db.from('social_piece_postings').insert({
      piece_id: p.id,
      approval_id: ap.id,
      post_url: `https://www.instagram.com/p/bpm-${stamp}-${p.id.slice(0, 8)}/`,
      posted_at: ap.approved_at as string,
      recorded_by: by,
    })
    if (gerr) throw new Error(`posting: ${gerr.message}`)
  }
  return p.id as string
}

/** jsonb keeps no key order, so two objects are compared by their sorted entries. */
const sorted = (o: unknown) => JSON.stringify(Object.entries((o ?? {}) as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

try {
  /* Two campaigns in past weeks. */
  const campaigns: string[] = []
  for (const w of WEEKS) {
    const { data: c, error } = await db.from('social_campaigns').insert({ week_start: w, planned_by: by }).select('id').single()
    if (error || !c) throw new Error(`campaign ${w}: ${error?.message}`)
    campaigns.push(c.id as string)
    console.log(`MADE campaign ${c.id}`)
  }
  const [c1, c2] = campaigns

  /* A partner kit's own link on a TEST event, with one arrival after it goes. */
  const { data: ev } = await db.from('events').select('id').eq('status', 'published').order('id', { ascending: true }).limit(1).maybeSingle()
  const { data: link, error: lerr } = await db.from('share_links').insert({ event_id: ev?.id, channel: 'other', code: `bpm${stamp}`, created_by: by }).select('id').single()
  if (lerr || !link) throw new Error(`share link: ${lerr?.message}`)
  console.log(`MADE link ${link.id}`)

  /* The first campaign: four pieces gone, one not; a partner kit counted through its own link. */
  const first: Record<string, string> = {}
  for (const [kind, city] of [['discovery_reel', 'melbourne'], ['discovery_reel', 'geelong'], ['week_ahead', 'melbourne'], ['week_ahead', 'geelong']] as const) {
    first[`${kind}:${city}`] = await makePiece(c1, kind, city, true)
  }
  const notGone = await makePiece(c1, 'venue_spotlight', 'melbourne', false)
  const kit = await makePiece(c1, 'partner_kit', 'melbourne', true, link.id as string)
  await sleep(1500)
  const { error: arr } = await db.from('share_link_events').insert({ link_id: link.id, kind: 'click', occurred_at: new Date().toISOString() })
  check('an arrival through the partner kit\'s own link is recorded', !arr, arr)

  /* J16: the database's refusals, in its own words, through the one writer. */
  const now = () => new Date()
  const r1 = await report.enterPieceFigure(db, { pieceId: notGone, platform: 'instagram', metric: 'reach', value: 10, readAt: now(), by })
  check('a figure for a piece that has not gone is refused', r1.state === 'refused' && /has not gone/.test(r1.reason), r1)
  const r2 = await report.enterPieceFigure(db, { pieceId: first['week_ahead:melbourne'], platform: 'instagram', metric: 'watch_time_seconds', value: 10, readAt: now(), by })
  check('watch time on a piece that is not the Reel is refused', r2.state === 'refused' && /Discovery Reel/.test(r2.reason), r2)
  const r3 = await report.enterPieceFigure(db, { pieceId: first['week_ahead:melbourne'], platform: 'instagram', metric: 'reach', value: 10, readAt: new Date(Date.now() - 86_400_000), by })
  check('a figure read before the piece went is refused', r3.state === 'refused' && /after the piece went/.test(r3.reason), r3)
  const r4 = await report.enterPieceFigure(db, { pieceId: first['week_ahead:melbourne'], platform: 'instagram', metric: 'reach', value: 10, readAt: new Date(Date.now() + 3_600_000), by })
  check('a figure read in the future is refused', r4.state === 'refused' && /once it has been read/.test(r4.reason), r4)
  const r5 = await report.enterPieceFigure(db, { pieceId: first['discovery_reel:melbourne'], platform: 'instagram', metric: 'watch_time_seconds', value: 5400, readAt: now(), by })
  check('watch time on the Reel is kept', r5.state === 'kept', r5)

  /* Reach for every gone piece on both platforms; the Melbourne week ahead read twice, the newer read is the figure. */
  const reach: Record<string, [number, number]> = { 'discovery_reel:melbourne': [4000, 900], 'discovery_reel:geelong': [3600, 800], 'week_ahead:melbourne': [1000, 300], 'week_ahead:geelong': [1000, 200] }
  for (const [k, [ig, fb]] of Object.entries(reach)) {
    await report.enterPieceFigure(db, { pieceId: first[k], platform: 'instagram', metric: 'reach', value: k === 'week_ahead:melbourne' ? 500 : ig, readAt: now(), by })
    await report.enterPieceFigure(db, { pieceId: first[k], platform: 'facebook', metric: 'reach', value: fb, readAt: now(), by })
  }
  await sleep(1100)
  await report.enterPieceFigure(db, { pieceId: first['week_ahead:melbourne'], platform: 'instagram', metric: 'reach', value: 1200, readAt: now(), by })

  /* The first campaign's report: no baseline, nothing proposed, entered and counted apart. */
  const p1 = await report.readSocialReport(db, { campaignId: c1, now: now() })
  const rep1 = p1.report
  check('the first campaign reads back with its six pieces', rep1?.pieces.length === 6, rep1?.pieces.length)
  check('no baseline yet, and it says so', rep1?.baseline === null && /No baseline yet/.test(rep1?.baselineWords ?? ''), rep1?.baselineWords)
  check('no recommendation without a baseline', rep1?.recommendations.length === 0 && /No recommendation until there is a baseline/.test(rep1?.recommendationWords ?? ''), rep1?.recommendations)
  const wa = rep1?.pieces.find((p) => p.id === first['week_ahead:melbourne'])
  check('the newest read is the figure (1,200, not 500)', wa?.entered.instagram.reach?.value === 1200, wa?.entered.instagram.reach)
  check('a figure nobody entered is null, never zero', wa?.entered.facebook.saves === null && wa?.entered.instagram.watch_time_seconds === null, wa?.entered)
  const k = rep1?.pieces.find((p) => p.id === kit)
  check('the partner kit counts its own link: 1 arrival', k?.counted?.arrived === 1 && k.counted.orders === 0, k?.counted)
  const page = rep1?.pieces.find((p) => p.id === first['discovery_reel:melbourne'])
  check('a piece with a page link is counted for the week only, and says so', page?.counted === null && /counted for the week only/.test(page?.countedWords ?? ''), page?.countedWords)
  check('the June week has begun, so it is counted from TEST\'s own rows', rep1?.counted !== null && typeof rep1?.counted?.visitors === 'number', rep1?.counted)
  check('Instagram reach adds only Instagram reach: 4,000 + 3,600 + 1,200 + 1,000 over 4 pieces', rep1?.enteredTotals.instagram.reach?.value === 9800 && rep1.enteredTotals.instagram.reach.pieces === 4, rep1?.enteredTotals.instagram.reach)

  /* The second campaign: the same shape, so there is a baseline and enough pieces of each kind. */
  for (const [kind, city] of [['discovery_reel', 'melbourne'], ['discovery_reel', 'geelong'], ['week_ahead', 'melbourne'], ['week_ahead', 'geelong']] as const) {
    const id = await makePiece(c2, kind, city, true)
    await sleep(1200)
    const [ig, fb] = reach[`${kind}:${city}`]
    await report.enterPieceFigure(db, { pieceId: id, platform: 'instagram', metric: 'reach', value: kind === 'week_ahead' && city === 'melbourne' ? 1200 : ig, readAt: now(), by })
    await report.enterPieceFigure(db, { pieceId: id, platform: 'facebook', metric: 'reach', value: fb, readAt: now(), by })
  }
  const p2 = await report.readSocialReport(db, { campaignId: c2, now: now() })
  const rep2 = p2.report
  check('the second campaign compares with the first', rep2?.baseline?.campaigns === 1 && rep2.previous[0]?.weekStart === WEEKS[0], rep2?.baseline)
  const recs = rep2?.recommendations ?? []
  console.log(`recommendations: ${recs.map((r) => `${r.rule} ${JSON.stringify(r.evidence)}`).join(' | ') || 'none'}`)
  check(`at most three recommendations, each with its data (${recs.length})`, recs.length >= 1 && recs.length <= 3 && recs.every((r) => Object.keys(r.evidence).length > 0 && !/[–—!]/.test(r.words)), recs)
  const kindRec = recs.find((r) => r.rule === 'more_of_the_strongest_kind')
  check('the Reel against the week ahead, with the medians it rests on (3,800 against 1,100)', kindRec?.evidence.strongestMedianReach === 3800 && kindRec?.evidence.weakestMedianReach === 1100, kindRec)

  /* G4: an answer is kept once, with the words and evidence as shown, and changes nothing by itself. */
  const d1 = await report.decideRecommendation(db, { campaignId: c2, rule: 'more_of_the_strongest_kind', decision: 'approved', by, now: now() })
  check('approving a recommendation keeps it', d1.state === 'kept', d1)
  const d2 = await report.decideRecommendation(db, { campaignId: c2, rule: 'more_of_the_strongest_kind', decision: 'declined', by, now: now() })
  check('a second answer to the same recommendation is refused', d2.state === 'refused' && /answered already/.test(d2.reason), d2)
  const d3 = await report.decideRecommendation(db, { campaignId: c2, rule: 'not_in_this_report', decision: 'approved', by, now: now() })
  check('an answer to a rule not in the report is refused', d3.state === 'refused', d3)
  const { data: kept } = await db.from('social_report_decisions').select('rule, decision, recommendation, evidence').eq('campaign_id', c2)
  check('the decision holds the words and evidence as shown', kept?.length === 1 && kept[0].recommendation === kindRec?.words && sorted(kept[0].evidence) === sorted(kindRec?.evidence), kept)
  const again = await report.readSocialReport(db, { campaignId: c2, now: now() })
  check('the report reads the decision back', again.decisions.length === 1 && again.decisions[0].decision === 'approved', again.decisions)

  /* Staff only: a signed out visitor reads neither table, and nobody but the service role can write them. */
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error: a1 } = await anon.from('social_piece_figures').select('id').limit(1)
  const { error: a2 } = await anon.from('social_report_decisions').select('id').limit(1)
  const { error: a3 } = await anon.from('social_piece_figures').insert({ piece_id: kit, platform: 'instagram', metric: 'reach', value: 1, read_at: now().toISOString(), entered_by: by })
  check('a signed out visitor can neither read nor write them', Boolean(a1) && Boolean(a2) && Boolean(a3), { a1: a1?.code, a2: a2?.code, a3: a3?.code })
  const { error: u1 } = await db.from('social_piece_figures').update({ value: 999999 }).eq('piece_id', kit)
  const { error: u2 } = await db.from('social_report_decisions').delete().eq('campaign_id', c2)
  check('an entered figure and a decision are never rewritten or removed by the service role', Boolean(u1) && Boolean(u2), { u1: u1?.code, u2: u2?.code })
} catch (e) {
  fails += 1
  console.log(`FAIL the drive stopped: ${e instanceof Error ? e.message : String(e)}`)
}
console.log(`MADE since ${started.toISOString()} by ${by}`)
console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${fails} check(s)`)
process.exit(fails === 0 ? 0 : 1)
