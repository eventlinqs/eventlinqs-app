/**
 * THE WEEKLY CAMPAIGN ON TEST (the release checklist of 28 October 2026: A1, B2, B3, F7 to F9, J15, K2, K6, K7), its
 * real store against the TEST database (never production), on TEST's own nights.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-campaign-drive.mts
 *
 * Plans the week twice (one campaign, nothing doubled), reads it back, proves planning approves and publishes nothing,
 * refuses a record before approval, approves and records one piece, rejects, edits and regenerates another with its
 * history, leaves a night out and regenerates without it, walks an image through the asset register (a library photo
 * refused, a pending one unusable, an approved one usable, an expired one not), runs the dependency check against pages
 * served by a stand in (listing every night: approved; a page that answers 404: refused with the reason), and checks the
 * database's own refusals. Prints MADE lines for scripts/verify/social-campaign-drive-cleanup.sql. Each check prints PASS
 * or FAIL; the last line is the verdict.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as StoreModule from '@/lib/social/store'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const storeMod = (await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule }
const store = (storeMod.default ?? storeMod) as typeof StoreModule

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-campaign-drive runs on TEST only')
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
check('a TEST admin to plan and decide as', Boolean(by), admin)

try {
  /* F7: one campaign; a second press makes nothing new. */
  const first = await store.planCampaignWeek(db, { plannedBy: by, now: started })
  console.log(`MADE campaign ${first.campaignId}`)
  console.log(`first press: ${first.created} pieces, ${first.existing} existing, ${first.requests} image requests; held: ${first.held.join(' / ') || 'none'}`)
  check('Plan this week builds the campaign from TEST\'s nights', first.created > 0, first)
  const second = await store.planCampaignWeek(db, { plannedBy: by, now: new Date() })
  check(`a second press makes nothing new (${second.created} new, ${second.existing} found)`, second.created === 0 && second.campaignId === first.campaignId && second.existing === first.created, second)

  const campaign = await store.readCampaign(db, new Date())
  const pieces = campaign?.pieces ?? []
  check(`the campaign reads back with its ${pieces.length} pieces`, pieces.length === first.created, pieces.length)
  check('every piece has one audience, objective, purpose, call to action and outcome', pieces.every((p) => p.audience && p.objective && p.purpose && p.nextStep && p.outcome), pieces.map((p) => p.kind))
  check('every piece has its Instagram and Facebook versions', pieces.every((p) => p.revision.versions.instagram?.caption && p.revision.versions.facebook?.caption), null)
  const sets = pieces.filter((p) => ['week_ahead', 'weekend_carousel', 'discovery_reel'].includes(p.kind))
  check('every night in a set says why it was picked (K6)', sets.length > 0 && sets.every((p) => p.revision.picks.length === p.revision.eventIds.length && p.revision.picks.every((k) => k.reason.startsWith('Picked: '))), sets.map((p) => p.revision.picks.length))
  check('the organiser campaign is its own piece and advertises no night (J11)', pieces.some((p) => p.kind === 'organiser_campaign' && p.revision.eventIds.length === 0), pieces.map((p) => p.kind))

  /* F9: planning approved and published nothing. */
  const ids = pieces.map((p) => p.id)
  const { count: approvals } = await db.from('social_piece_approvals').select('id', { count: 'exact', head: true }).in('piece_id', ids)
  const { count: postings } = await db.from('social_piece_postings').select('id', { count: 'exact', head: true }).in('piece_id', ids)
  check('planning approved nothing and published nothing (F9)', approvals === 0 && postings === 0, { approvals, postings })

  /* F8: nothing is recorded before approval; then approve, then record. */
  const a = pieces.find((p) => p.kind === 'organiser_campaign') ?? pieces[0]
  const early = await store.recordPiecePosting(db, { pieceId: a.id, postUrl: `https://www.instagram.com/p/bp-${stamp}/`, by, now: new Date() })
  check('a record before approval is refused', early.state === 'refused', early)
  const ok = await store.approvePiece(db, { pieceId: a.id, by, now: new Date() })
  check('the piece is approved, its own state', ok.state === 'done', ok)
  await new Promise((r) => setTimeout(r, 1100))
  const went = await store.recordPiecePosting(db, { pieceId: a.id, postUrl: `https://www.instagram.com/p/bp-${stamp}/`, by, now: new Date() })
  check('after approval it is recorded as gone', went.state === 'done', went)

  /* K7: reject, edit, regenerate, each kept. */
  const b = pieces.find((p) => p.kind === 'week_ahead') ?? pieces[1]
  const rej = await store.rejectPiece(db, { pieceId: b.id, reason: 'bp drive: rejected to test the history', by, now: new Date() })
  const ed = await store.editPiece(db, { pieceId: b.id, platform: 'facebook', caption: `${b.revision.versions.facebook.caption}\n\nbp drive edit`, by, now: new Date() })
  const regen = await store.regeneratePiece(db, { pieceId: b.id, reason: 'bp drive: regenerated to test the history', by, now: new Date() })
  const afterB = (await store.readCampaign(db, new Date()))?.pieces.find((p) => p.id === b.id)
  check('reject, edit and regenerate are kept as versions and decisions (K7)', rej.state === 'done' && ed.state === 'done' && regen.state === 'done' && afterB?.revision.version === 3 && afterB.decisions.length === 3 && afterB.state === 'drafted', { rej, ed, regen, version: afterB?.revision.version, decisions: afterB?.decisions })
  const { error: oldApproval } = await db.from('social_piece_approvals').insert({ piece_id: b.id, revision: 1, approved_by: by })
  check('an approval of an older version is refused by the database', oldApproval?.code === '23514', oldApproval)

  /* K6: the founder leaves a night out; regenerating takes it out of the set. */
  const out = afterB?.revision.eventIds[0]
  if (out) {
    const ex = await store.excludeNight(db, { eventId: out, reason: 'bp drive: left out to test the override', by, now: new Date() })
    const r2 = await store.regeneratePiece(db, { pieceId: b.id, reason: 'bp drive: without the night left out', by, now: new Date() })
    const afterOut = (await store.readCampaign(db, new Date()))?.pieces.find((p) => p.id === b.id)
    check('a night left out never comes back when the piece is regenerated (K6)', ex.state === 'done' && (r2.state === 'done' ? !afterOut?.revision.eventIds.includes(out) : true), { ex, r2, ids: afterOut?.revision.eventIds })
  }

  /* K2, K3: the asset register. */
  const night = pieces.find((p) => p.revision.eventIds.length > 0)?.revision.eventIds[0] as string
  const { data: ev } = await db.from('events').select('slug').eq('id', night).maybeSingle()
  const library = await store.addAsset(db, { assetState: 'organiser_authorised', assetType: 'photo', assetUrl: 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/stock/categories/music/x.avif', sourceUrl: `https://bp-${stamp}.example.com/`, rightsHolder: 'bp drive', permissionEvidence: 'bp drive: a library photo is never usable', evidenceFile: null, eventSlug: ev?.slug as string, attributionText: 'bp drive', scope: 'social', archival: false, expiresAt: null, restrictions: null, originalFile: 'bp-drive-original.jpg', receivedOn: '2026-10-28', permittedUses: 'bp drive: EventLinqs social posts only', focal: null, sourceWidth: null, sourceHeight: null, by })
  check('a library photograph is refused by the register (K3)', library.state === 'refused', library)
  const img = `https://bp-${stamp}.example.com/organiser-photo.jpg`
  const added = await store.addAsset(db, { assetState: 'organiser_authorised', assetType: 'photo', assetUrl: img, sourceUrl: `mailto:bp-${stamp}@eventlinqs.test`, rightsHolder: 'bp drive organiser', permissionEvidence: 'Yes, you are welcome to use our event promotional material for EventLinqs listings and social posts.', evidenceFile: null, eventSlug: ev?.slug as string, attributionText: 'bp drive organiser', scope: 'social', archival: false, expiresAt: null, restrictions: null, originalFile: 'bp-drive-original.jpg', receivedOn: '2026-10-28', permittedUses: 'bp drive: EventLinqs social posts only', focal: null, sourceWidth: null, sourceHeight: null, by })
  const pending = await store.usableImages(db, [night], new Date())
  const { data: row } = await db.from('social_assets').select('id').eq('asset_url', img).maybeSingle()
  console.log(`MADE asset ${row?.id}`)
  const decided = await store.decideAsset(db, { id: row?.id as string, decision: 'approved', by, now: new Date() })
  const approved = await store.usableImages(db, [night], new Date())
  const later = await store.usableImages(db, [night], new Date(Date.now() + 400 * 86_400_000))
  check('a pending image is not usable, an approved one is (K2)', added.state === 'done' && !pending.has(night) && decided.state === 'done' && approved.get(night)?.url === img && later.get(night)?.url === img, { added, decided })
  const expiring = `https://bp-${stamp}.example.com/expiring.jpg`
  await store.addAsset(db, { assetState: 'separately_licensed', assetType: 'photo', assetUrl: expiring, sourceUrl: `https://bp-${stamp}.example.com/licence`, rightsHolder: 'bp drive licensor', permissionEvidence: 'bp drive: licensed for one day for social posts only', evidenceFile: null, eventSlug: null, attributionText: 'bp drive licensor', scope: 'social', archival: false, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), restrictions: 'Social only', originalFile: 'bp-drive-original.jpg', receivedOn: '2026-10-28', permittedUses: 'bp drive: EventLinqs social posts only', focal: null, sourceWidth: null, sourceHeight: null, by })
  const { data: exp } = await db.from('social_assets').select('id').eq('asset_url', expiring).maybeSingle()
  console.log(`MADE asset ${exp?.id}`)
  await store.decideAsset(db, { id: exp?.id as string, decision: 'approved', by, now: new Date() })
  /* A licensed photograph names no night (the photography-led rule, 20261028205501): usable on a brand piece only. */
  const { data: usableNow } = await db.rpc('social_asset_usable', { p_url: expiring, p_event: null, p_at: new Date().toISOString() })
  const { data: onANight } = await db.rpc('social_asset_usable', { p_url: expiring, p_event: night, p_at: new Date().toISOString() })
  const { data: usableLater } = await db.rpc('social_asset_usable', { p_url: expiring, p_event: null, p_at: new Date(Date.now() + 2 * 86_400_000).toISOString() })
  check('an expired licence is not usable (K2)', usableNow === true && usableLater === false, { usableNow, usableLater })
  check('a licensed photograph is never usable on a named night (the photography-led rule)', onANight === false, { onANight })

  /* J15: the dependency check, against pages served by a stand in. */
  const c = (await store.readCampaign(db, new Date()))?.pieces.find((p) => p.kind === 'weekend_carousel' || p.kind === 'discovery_reel')
  if (c) {
    const { data: evs } = await db.from('events').select('slug').in('id', c.revision.eventIds)
    const listing = `<html>${(evs ?? []).map((e) => `<a href="/events/${e.slug}">x</a>`).join('')}</html>`
    const fine = (async (u: string) => new Response(u.includes('/events/') && !u.includes('localhost') ? 'ok' : listing, { status: 200 })) as typeof fetch
    const issues = await store.pieceDependencies(db, c.id, new Date(), { siteOrigin: 'http://localhost:9', fetcher: fine })
    check(`the check passes a piece whose page lists every night (${issues.length} reasons)`, issues.length === 0, issues)
    const missing = (async () => new Response('', { status: 404 })) as typeof fetch
    const refused = await store.approvePieceChecked(db, { pieceId: c.id, by, now: new Date(), siteOrigin: 'http://localhost:9', fetcher: missing })
    check('the check refuses approval with the reason when the page answers 404 (J15)', refused.state === 'refused' && /answers 404/.test(refused.reason), refused)
  } else check('a set to check', false, 'no weekend guide or reel planned on TEST this week')

  /* The database's own refusals (C2, F8). */
  const { error: noObjective } = await db.from('social_pieces').insert({ campaign_id: first.campaignId, kind: 'week_ahead', city: `bp-${stamp}`, audience: 'attendees', objective: 'reach', purpose: 'bp', next_step: 'bp drive', outcome: 'bp drive', link: 'https://www.eventlinqs.com.au/', format: 'feed' })
  check('the database refuses a piece without one of the two objectives', noObjective?.code === '23514', noObjective)
} catch (e) {
  fails += 1
  console.log(`FAIL the drive stopped: ${e instanceof Error ? e.message : String(e)}`)
}
console.log(`MADE since ${started.toISOString()} by ${by}`)
console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${fails} check(s)`)
process.exit(fails === 0 ? 0 : 1)
