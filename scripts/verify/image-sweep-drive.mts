/**
 * THE IMAGE SWEEP, DRIVEN ON TEST (the engine plan's part D: "withdrawal pulls images from every unposted post within
 * the hour"; migration 20261028205501 and src/lib/social/store.ts sweepWithdrawnImages).
 *
 * On this week's TEST campaign (plan it first: scripts/verify/planner-demonstration.mts): two photographs of a night are
 * planted as the organiser's own, approved; two pieces carrying that night are regenerated so the planner puts the
 * photograph on them, and approved; one of them is recorded as gone. The photographs are withdrawn and the sweep runs:
 *   the unposted piece gets a new version drawn in type, with a decision written by no person;
 *   its old approval can no longer record a posting (the database refuses);
 *   the piece that had gone is untouched;
 *   a second run changes nothing.
 * Every planted row is printed as MADE; scripts/verify/image-sweep-drive-cleanup.sql removes them with this week's
 * campaign, after which the demonstration week is planned again.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/image-sweep-drive.mts
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type * as StoreModule from '@/lib/social/store'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)
const storeMod = (await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule }
const store = (storeMod.default ?? storeMod) as typeof StoreModule

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error('TEST only: pass a TEST env file')
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
const { data: admin } = await db.from('admin_users').select('id').limit(1).maybeSingle()
const by = admin?.id as string
const stamp = Date.now().toString(36)
let failed = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(detail)}`}`)
  if (!ok) failed += 1
}

const campaign = await store.readCampaign(db, new Date())
if (!campaign) throw new Error("plan this week on TEST first (scripts/verify/planner-demonstration.mts)")
console.log(`MADE since ${new Date().toISOString()} on campaign ${campaign.campaignId}`)

// A night carried by two pieces of the week: a week ahead and a partner kit of the same host.
const kit = campaign.pieces.find((p) => p.kind === 'partner_kit' && campaign.pieces.some((q) => q.kind === 'week_ahead' && q.revision.eventIds.includes(p.revision.eventIds[0])))
if (!kit) throw new Error('no night carried by both a week ahead and a partner kit this week')
const night = kit.revision.eventIds[0]
const ahead = campaign.pieces.find((q) => q.kind === 'week_ahead' && q.revision.eventIds.includes(night))!
const { data: ev } = await db.from('events').select('slug').eq('id', night).single()

const plant = async (name: string) => {
  const added = await store.addAsset(db, {
    assetState: 'organiser_authorised', assetType: 'photo', assetUrl: `https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/social/amcf-2026/amcf-hero.jpg?bp-sweep=${stamp}-${name}`,
    sourceUrl: `mailto:bp-sweep-${stamp}@eventlinqs.test`, rightsHolder: 'bp sweep drive host', permissionEvidence: 'Yes, you are welcome to use this photograph for this night on EventLinqs.',
    evidenceFile: null, eventSlug: ev?.slug as string, attributionText: 'bp sweep drive host', scope: 'social', archival: false, expiresAt: null, restrictions: null,
    originalFile: `bp-sweep-${name}.jpg`, receivedOn: '2026-10-28', permittedUses: 'bp sweep drive: social promotion of this night', focal: null, sourceWidth: 1100, sourceHeight: 733, leadRank: name === 'a' ? 1 : 2, by,
  })
  const { data: row } = await db.from('social_assets').select('id, asset_url').like('asset_url', `%bp-sweep=${stamp}-${name}`).single()
  console.log(`MADE asset ${row?.id}`)
  await store.decideAsset(db, { id: row?.id as string, decision: 'approved', by, now: new Date() })
  return { added, id: row?.id as string, url: row?.asset_url as string }
}
const a = await plant('a')
check('a whole organiser photograph is entered and approved', a.added.state === 'done', a.added)

for (const p of [ahead, kit]) {
  const r = await store.regeneratePiece(db, { pieceId: p.id, reason: 'bp sweep drive: take the night’s photograph', by, now: new Date() })
  const ap = await store.approvePiece(db, { pieceId: p.id, by, now: new Date() })
  check(`${p.kind} regenerated with the photograph and approved`, r.state === 'done' && ap.state === 'done', { r, ap })
}
const posted = await store.recordPiecePosting(db, { pieceId: kit.id, postUrl: 'sent', by, now: new Date() })
check('the partner kit is recorded as gone', posted.state === 'done', posted)
const before = await store.readCampaign(db, new Date())
const aheadBefore = before?.pieces.find((p) => p.id === ahead.id)
const kitBefore = before?.pieces.find((p) => p.id === kit.id)
check('both carry the photograph before the withdrawal', [aheadBefore, kitBefore].every((p) => p?.revision.slides.some((s) => 'photo' in s && s.photo === a.url)), { ahead: aheadBefore?.revision.version, kit: kitBefore?.revision.version })

const w = await store.withdrawAsset(db, { id: a.id, reason: 'bp sweep drive: the host asked us to stop', now: new Date() })
check('the owner withdraws it', w.state === 'done', w)
const again = await store.withdrawAsset(db, { id: a.id, reason: 'bp sweep drive: twice', now: new Date() })
check('a withdrawal is final', again.state === 'refused', again)

const swept = await store.sweepWithdrawnImages(db, new Date())
const after = await store.readCampaign(db, new Date())
const aheadAfter = after?.pieces.find((p) => p.id === ahead.id)
const kitAfter = after?.pieces.find((p) => p.id === kit.id)
check('the unposted piece gets a new version drawn in type', swept.regenerated.some((r) => r.pieceId === ahead.id) && aheadAfter?.revision.version === (aheadBefore?.revision.version ?? 0) + 1 && !aheadAfter?.revision.slides.some((s) => 'photo' in s && s.photo), { swept, version: aheadAfter?.revision.version })
check('its decision is written by no person and says why', Boolean(aheadAfter?.decisions.some((d) => d.decision === 'image_withdrawn' && d.reason.startsWith('The sweep:'))), aheadAfter?.decisions)
check('the caption no longer credits the withdrawn photograph', !aheadAfter?.revision.caption.includes('bp sweep drive host'), aheadAfter?.revision.caption)
check('the piece that had gone is untouched', kitAfter?.revision.version === kitBefore?.revision.version && !swept.regenerated.some((r) => r.pieceId === kit.id), { before: kitBefore?.revision.version, after: kitAfter?.revision.version })
check('the unposted piece is no longer approved', aheadAfter?.state !== 'approved', aheadAfter?.state)
const { data: oldApproval } = await db.from('social_piece_approvals').select('id').eq('piece_id', ahead.id).order('approved_at', { ascending: false }).limit(1).single()
const { error: postErr } = await db.from('social_piece_postings').insert({ piece_id: ahead.id, approval_id: oldApproval?.id, post_url: 'https://www.instagram.com/p/bp-sweep', posted_at: new Date().toISOString(), recorded_by: by })
check('its old approval can no longer record a posting', Boolean(postErr && /changed since that approval|withdrawn/.test(postErr.message)), postErr?.message)
const second = await store.sweepWithdrawnImages(db, new Date())
check('a second run changes nothing', second.regenerated.length === 0 && second.failed.length === 0, second)

console.log(failed === 0 ? 'DRIVE PASSED' : `DRIVE FAILED (${failed})`)
process.exitCode = failed === 0 ? 0 : 1
