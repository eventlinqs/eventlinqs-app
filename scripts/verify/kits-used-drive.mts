/**
 * PARTNER KITS SENT VERSUS USED, DRIVEN ON TEST (the growth blueprint of 30 October 2026, section 4D, on /admin/today):
 * TEST has no kit postings at all, so "sent 0, used 0" there proves nothing about the read. This drive makes the known
 * positive and reads it through the real reader, src/lib/admin/founder-dashboard.ts:
 *
 *   1. before: the two figures as they stand;
 *   2. it records one approved TEST kit as sent now: sent rises by 1, used does not (no tap yet);
 *   3. it adds one QA tap (is_test true) on the kit's own link: used still does not rise;
 *   4. it adds one real tap: used rises by 1;
 *   5. it removes both taps, and the posting, and reads the figures back to before.
 *
 * service_role holds no DELETE on social_piece_postings (a posting is a record), so the first run on 30 October 2026
 * left its posting behind and it was removed by hand through the Management API. The drive now removes it that way
 * itself, and refuses to start without the token, so it never plants what it cannot take back:
 *
 *   scripts\ops\with-supabase-token.ps1 node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/kits-used-drive.mts
 *
 * The last line is DRIVE PASSED or DRIVE FAILED with each failed check.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as DashModule from '@/lib/admin/founder-dashboard'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) {
  console.error('kits-used-drive runs on TEST only')
  process.exit(2)
}

const managementToken = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (managementToken === '') {
  console.error('kits-used-drive needs SUPABASE_ACCESS_TOKEN (run it under scripts/ops/with-supabase-token.ps1) to remove its posting')
  process.exit(2)
}
async function removePosting(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return `not a posting id: ${id}`
  const res = await fetch('https://api.supabase.com/v1/projects/vkapkibzokmfaxqogypq/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${managementToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `delete from social_piece_postings where id = '${id}' returning id`, read_only: false }),
  })
  const body = await res.text()
  return res.ok && body.includes(id) ? null : `HTTP ${res.status} ${body.slice(0, 200)}`
}

const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const dash = unwrap((await import('@/lib/admin/founder-dashboard')) as typeof DashModule & { default?: typeof DashModule })
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })

const failed: string[] = []
const check = (name: string, ok: boolean, saw: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (saw ${JSON.stringify(saw)})`)
  if (!ok) failed.push(name)
}

async function kits(): Promise<{ sent: number | null; used: number | null }> {
  const marketing = (await dash.readFounderDashboard()).find((s) => s.key === 'marketing')
  const value = (prefix: string) => marketing?.figures.find((f) => f.label.startsWith(prefix))?.value ?? null
  return { sent: value('Partner kits sent'), used: value('Of those, used') }
}

// An approved TEST kit with its own link and no posting yet.
const { data: found, error: findErr } = await db
  .from('social_piece_approvals')
  .select('id, piece_id, approved_by, social_pieces!inner(kind, share_link_id)')
  .eq('social_pieces.kind', 'partner_kit')
  .not('social_pieces.share_link_id', 'is', null)
  .order('id', { ascending: true })
  .limit(20)
if (findErr) {
  console.log(`DRIVE FAILED could not find a kit: ${findErr.message}`)
  process.exit(1)
}
let kit: { approvalId: string; pieceId: string; approvedBy: string; linkId: string } | null = null
for (const a of found ?? []) {
  const piece = (Array.isArray(a.social_pieces) ? a.social_pieces[0] : a.social_pieces) as { share_link_id: string }
  const { count } = await db.from('social_piece_postings').select('id', { count: 'exact', head: true }).eq('piece_id', a.piece_id)
  if (count === 0) {
    kit = { approvalId: a.id, pieceId: a.piece_id, approvedBy: a.approved_by, linkId: piece.share_link_id }
    break
  }
}
if (kit === null) {
  console.log('DRIVE FAILED no approved partner kit with its own link and no posting on TEST')
  process.exit(1)
}
console.log(`kit ${kit.pieceId}, its link ${kit.linkId}`)

const planted = { posting: null as string | null, taps: [] as string[] }
const before0 = await kits()
try {
  const before = before0
  check('before: both figures counted', before.sent !== null && before.used !== null, before)

  const { data: posting, error: pErr } = await db
    .from('social_piece_postings')
    .insert({ piece_id: kit.pieceId, approval_id: kit.approvalId, post_url: 'sent', posted_at: new Date().toISOString(), recorded_by: kit.approvedBy })
    .select('id')
    .single()
  if (pErr) throw new Error(`posting: ${pErr.message}`)
  planted.posting = posting.id
  const sentNow = await kits()
  check('a kit recorded as sent counts as sent', sentNow.sent === (before.sent ?? 0) + 1, sentNow)
  check('a sent kit with no tap is not used', sentNow.used === before.used, sentNow)

  const tap = async (isTest: boolean) => {
    const { data, error } = await db.from('share_link_events').insert({ link_id: kit!.linkId, kind: 'click', is_test: isTest }).select('id').single()
    if (error) throw new Error(`tap: ${error.message}`)
    planted.taps.push(data.id)
  }
  await tap(true)
  const qa = await kits()
  check('a QA tap does not make it used', qa.used === before.used, qa)

  await tap(false)
  const used = await kits()
  check('a real tap on its own link makes it used', used.used === (before.used ?? 0) + 1, used)
} catch (err) {
  failed.push(err instanceof Error ? err.message : String(err))
} finally {
  if (planted.taps.length > 0) {
    const { error } = await db.from('share_link_events').delete().in('id', planted.taps)
    if (error) failed.push(`clean-up of the taps: ${error.message}`)
  }
  if (planted.posting) {
    const error = await removePosting(planted.posting)
    if (error) failed.push(`clean-up of the posting ${planted.posting}: ${error}`)
  }
  const after = await kits()
  const { count: left } = await db.from('share_link_events').select('id', { count: 'exact', head: true }).eq('link_id', kit.linkId)
  const { count: postings } = await db.from('social_piece_postings').select('id', { count: 'exact', head: true }).eq('piece_id', kit.pieceId)
  check('after clean-up: no tap and no posting left on the kit, the figures back to before', left === 0 && postings === 0 && after.sent === before0.sent && after.used === before0.used, { left, postings, ...after })
}

console.log(failed.length === 0 ? 'DRIVE PASSED' : `DRIVE FAILED ${failed.join('; ')}`)
process.exit(failed.length === 0 ? 0 : 1)
