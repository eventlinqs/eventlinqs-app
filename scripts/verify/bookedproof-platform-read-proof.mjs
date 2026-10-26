/**
 * T3 PROOF ON TEST: BOOKEDPROOF'S PLATFORM READ AGAINST REAL ROWS.
 *
 * The unit tests pin the door and the rules on composed rows; this proves the
 * READ: that the product's own queries (src/lib/connect/bookedproof/platform-read.ts)
 * page the real organisations, events and paid orders, and hand over a buyer
 * ONLY where their standing consent's own wording names Bookedproof.
 *
 * THE FIXTURE is E51's (scripts/verify/bookedproof-organiser-read-proof.mjs):
 * its organisation, listings and orders by fixed ids, seeded by that proof and
 * kept on TEST because an event with orders cannot be deleted. This proof adds
 * only consent events for three of its buyers, under capture surface
 * "proof-fixture-t3", and only when the newest one for that buyer is not
 * already the one wanted, so a rerun adds nothing:
 *
 *   buyer B   granted under the facilitated_event_marketing wording that names
 *             Bookedproof: MUST be handed over
 *   buyer A   granted under wording that does not name Bookedproof: MUST NOT,
 *             and the resolver's own verdict for A is printed beside it, so the
 *             proof shows it is the named-party rule that keeps A out (the red)
 *   buyer D   granted under the Bookedproof wording, then withdrawn: MUST NOT
 *
 * Usage (bash, from the worktree):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/bookedproof-platform-read-proof.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/vkapkibzokmfaxqogypq/.test(url ?? '')) {
  console.error(`REFUSED: this proof writes consent fixtures and runs on TEST only, and NEXT_PUBLIC_SUPABASE_URL is ${url ?? 'unset'}.`)
  process.exit(2)
}
if (!serviceKey) {
  console.error('REFUSED: no SUPABASE_SERVICE_ROLE_KEY; run with --env-file=.env.local.')
  process.exit(2)
}

const { readOrganisationsPage, readEventsPage, readLedgerPage, readBuyersPage, NAMED_PARTY, CONSENT_PURPOSE } = await import(
  '@/lib/connect/bookedproof/platform-read'
)
const { recordConsentEvent } = await import('@/lib/consent/ledger')
const { filterPermittedRecipients } = await import('@/lib/consent/resolver')
const { PLATFORM_TENANT_SLUG } = await import('@/lib/consent/purposes')

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

/** E51's fixed ids, the same function its proof uses. */
const fid = (name) => {
  const h = createHash('sha256').update(`proof-fixture-bookedproof-read:${name}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const ORG = fid('org')
const EV = { listing: fid('ev-listing'), older: fid('ev-older') }
const ORDER = (key) => fid(`order-${key}`)
const BUYER = { A: 'proof.buyer_a@eventlinqs.test', B: 'proof.buyer_b@eventlinqs.test', D: 'proof.buyer_d@eventlinqs.test' }
const SURFACE = 'proof-fixture-t3'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const must = async (label, promise) => {
  const { data, error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

/* 0. The fixture exists (E51's proof seeds it). */
const org = await must('the E51 fixture organisation', db.from('organisations').select('id').eq('id', ORG).maybeSingle())
if (!org) {
  console.error(`REFUSED: E51's fixture organisation ${ORG} is not on TEST; run scripts/verify/bookedproof-organiser-read-proof.mjs first.`)
  process.exit(2)
}

/* 1. The two wordings, read from the ledger's own table, never typed here. */
const wordings = await must(
  'the consent wordings',
  db.from('consent_wordings').select('version, body, channel_scope, third_party_scope, suppression_scope').eq('purpose', CONSENT_PURPOSE),
)
const named = wordings.find((w) => w.body.includes(NAMED_PARTY))
const other = wordings.find((w) => !w.body.includes(NAMED_PARTY))
if (!named || !other) {
  console.error(`REFUSED: TEST holds no ${CONSENT_PURPOSE} wording ${named ? 'without' : 'with'} ${NAMED_PARTY}.`)
  process.exit(2)
}
console.log(`wordings: ${named.version} names ${NAMED_PARTY}, ${other.version} does not`)

/* 2. The consent fixture, written only where the newest event is not already the wanted one. */
const tenant = await must('the platform tenant', db.from('marketing_tenants').select('id').eq('slug', PLATFORM_TENANT_SLUG).single())
async function newestFor(email) {
  const rows = await must(
    `consent events for ${email}`,
    db
      .from('consent_events')
      .select('decision, wording_version, occurred_at')
      .eq('tenant_id', tenant.id)
      .eq('purpose', CONSENT_PURPOSE)
      .eq('subject_email', email)
      .order('occurred_at', { ascending: false })
      .limit(1),
  )
  return rows[0] ?? null
}
async function want(email, decision, wording) {
  const newest = await newestFor(email)
  if (newest && newest.decision === decision && newest.wording_version === wording.version) {
    console.log(`fixture: ${email} already ${decision} under ${wording.version}`)
    return
  }
  const ok = await recordConsentEvent(db, {
    email,
    purpose: CONSENT_PURPOSE,
    decision,
    wording: wording.body,
    wordingVersion: wording.version,
    channelScope: wording.channel_scope,
    thirdPartyScope: wording.third_party_scope,
    suppressionScope: wording.suppression_scope,
    captureSurface: SURFACE,
  })
  if (!ok) throw new Error(`the consent fixture for ${email} could not be written`)
  console.log(`fixture: ${email} ${decision} under ${wording.version}`)
}
await want(BUYER.B, 'granted', named)
await want(BUYER.A, 'granted', other)
const dNewest = await newestFor(BUYER.D)
if (!(dNewest && dNewest.decision === 'withdrawn')) {
  await want(BUYER.D, 'granted', named)
  await new Promise((r) => setTimeout(r, 20))
  await want(BUYER.D, 'withdrawn', named)
} else {
  console.log(`fixture: ${BUYER.D} already withdrawn`)
}

/* 3. The reads, walked page by page as Bookedproof walks them. */
async function walk(read, keyOf, found, limit = 500) {
  let after = null
  let pages = 0
  let rows = 0
  for (;;) {
    const page = await read(db, { after, limit })
    pages += 1
    rows += page.rows.length
    for (const r of page.rows) found(r)
    if (!page.next) return { pages, rows }
    if (page.next === after) throw new Error('a page repeated its cursor')
    after = page.next
    if (pages > 400) throw new Error('more than 400 pages')
  }
}

const orgRows = []
const o = await walk(readOrganisationsPage, (r) => r.id, (r) => r.id === ORG && orgRows.push(r))
check('organisations: the fixture organisation is read, paging to the end', orgRows.length === 1, `${o.rows} rows in ${o.pages} page(s)`)
check(
  'organisations: a row carries only the allow-list (no address, ABN, Stripe or payout field)',
  orgRows.length === 1 && Object.keys(orgRows[0]).sort().join(',') === 'city,created_at,event_count,id,name,slug,status,volume_cents',
  orgRows[0] ? Object.keys(orgRows[0]).sort().join(',') : 'no row',
)

const evRows = new Map()
const e = await walk(readEventsPage, (r) => r.id, (r) => (r.id === EV.listing || r.id === EV.older) && evRows.set(r.id, r))
check('events: both fixture listings are read with their tiers', evRows.size === 2 && [...evRows.values()].every((r) => r.tiers.length >= 1), `${e.rows} rows in ${e.pages} page(s)`)
const seedCount = await must('seed events', db.from('events').select('id', { count: 'exact', head: true }).eq('is_seed_data', true))
const seedIds = new Set((await must('seed ids', db.from('events').select('id').eq('is_seed_data', true).limit(1000))).map((r) => r.id))
let seedLeak = 0
await walk(readEventsPage, (r) => r.id, (r) => seedIds.has(r.id) && seedLeak++)
check('events: no seed event is read', seedLeak === 0, `${seedIds.size} seed ids checked`)
void seedCount

const ledger = new Map()
const l = await walk(readLedgerPage, (r) => r.order_id, (r) => ledger.set(r.order_id, r))
check('ledger: every paid fixture order is read (E0, O1, O2, O3, O4)', ['E0', 'O1', 'O2', 'O3', 'O4'].every((k) => ledger.has(ORDER(k))), `${l.rows} rows in ${l.pages} page(s)`)
check('ledger: the fixture order never paid (P1) is not', !ledger.has(ORDER('P1')))
const o1 = ledger.get(ORDER('O1'))
check(
  'ledger: a row carries money and no buyer field',
  !!o1 && !('email' in o1) && !('guest_email' in o1) && !('user_id' in o1) && typeof o1.platform_fee_cents === 'number',
  o1 ? Object.keys(o1).sort().join(',') : 'no row',
)

const buyers = new Map()
const b = await walk(readBuyersPage, (r) => r.email, (r) => buyers.set(r.email, r))
check(`buyers: B, granted under ${named.version} which names ${NAMED_PARTY}, is handed over`, buyers.has(BUYER.B), `${b.rows} buyers in ${b.pages} page(s)`)
const aVerdict = await filterPermittedRecipients(db, [BUYER.A], { purpose: CONSENT_PURPOSE, channel: 'email' })
console.log(`  the resolver alone for A (granted under ${other.version}): ${aVerdict.permitted.includes(BUYER.A) ? 'PERMITS' : 'refuses'}`)
check(`buyers: A, granted under ${other.version} which does not name ${NAMED_PARTY}, is NOT handed over`, !buyers.has(BUYER.A))
check('buyers: D, granted then withdrawn, is NOT handed over', !buyers.has(BUYER.D))
const bRow = buyers.get(BUYER.B)
check(
  'buyers: a row carries the first name, the consent and the orders, and nothing else',
  !!bRow && Object.keys(bRow).sort().join(',') === 'consent_given_at,consent_wording_version,email,event_ids,first_name,first_order_at,last_order_at,orders',
  bRow ? `${Object.keys(bRow).sort().join(',')}; wording ${bRow.consent_wording_version}` : 'no row',
)

const failed = results.filter((r) => !r.ok)
console.log(`===== T3 PLATFORM READ PROOF ${failed.length === 0 ? 'GREEN' : 'NOT GREEN'}: ${results.length - failed.length} of ${results.length} =====`)
process.exit(failed.length === 0 ? 0 : 1)
