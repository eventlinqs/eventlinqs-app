/**
 * E51 PROOF ON TEST: BOOKEDPROOF'S ORGANISER READ AGAINST REAL ROWS.
 *
 * The unit tests pin every definition on composed rows; this proves the READ:
 * that the product's own queries (src/lib/connect/bookedproof/read.ts) find the
 * right organisation, the right listings, links, orders, tickets and refunds in
 * a real database, and that the answer carries nothing about any buyer.
 *
 * THE FIXTURE (the contract's section 6 case, every row named as a fixture,
 * TEST only, seeded once by fixed ids and reused on every later run because the
 * money-records rule keeps an event with orders from being deleted):
 *
 *   organisation  proof-fixture-bookedproof-read, contact address in MIXED CASE
 *   listing       published, PUBLIC, two of the organiser's links (instagram,
 *                 whatsapp) and the weekly digest's link
 *   older         a completed PUBLIC listing, no orders through any link
 *   draft, private  never returned
 *   unlisted      published and shared by its own link: never returned, by
 *                 address or by its page (public only, project manager,
 *                 24 October 2026, 07:05)
 *
 * NOTHING HERE IS EVER IN THE SITEMAP. A fixture must be invisible to discovery
 * for its whole life (scripts/verify/lib/sitemap-footprint.mjs), and a public
 * event is in the sitemap while its status is `published`. So the listing is
 * `completed`, which is still a listing (published once, not a draft) and is
 * off every discovery surface. The proof REFUSES TO RUN twice over: before it
 * writes, if any fixture event it would write matches the sitemap's predicate,
 * and after, if the database answers the sitemap's own questions about any
 * fixture slug with anything but nothing.
 *   orders        O1 buyer A (who paid earlier elsewhere: not first), O2 buyer B
 *                 (first; a decoy whose address differs only where B's has an
 *                 underscore paid earlier and must NOT count), O3 buyer C then
 *                 refunded, one order through the digest link only, one never
 *                 paid, O2 touched later by whatsapp (first touch holds)
 *
 * THE RED, on the real database: a LIKE pattern with B's address unescaped
 * matches the decoy too, which is why read.ts escapes it (likeExact). The proof
 * shows the unescaped match first, then that the read says B's order is first.
 *
 * Usage (bash, from the worktree):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/bookedproof-organiser-read-proof.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { SITEMAP_EVENT_MATCH, sitemapFootprint } from './lib/sitemap-footprint.mjs'

// The repository's one preflight first (scripts/guards/no-unguarded-production-write.mjs),
// then the TEST-only check below, which names the project this proof writes fixtures to.
assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/vkapkibzokmfaxqogypq/.test(url ?? '')) {
  console.error(`REFUSED: this proof writes fixtures and runs on TEST only, and NEXT_PUBLIC_SUPABASE_URL is ${url ?? 'unset'}.`)
  process.exit(2)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const { readOrganiserRows } = await import('@/lib/connect/bookedproof/read')
const { assembleResponse } = await import('@/lib/connect/bookedproof/assemble')
const { orderKey } = await import('@/lib/connect/bookedproof/signature')
/*
 * EVERY ORDER CARRIES ITS ATTRIBUTION RECORD, the fixture's too. The first run of
 * this proof (23 October 11:47) wrote seven orders with none, and main's CI went
 * red on attribution-one-record-per-order-never-billable-when-reversed, which
 * judges TEST. The product's own resolver writes each one, as checkout does.
 */
const { resolveAndStoreOrder } = await import('@/lib/attribution/store')

const SECRET = 'proof-only-secret-bookedproof-organiser-read-23-october-2026'
const ORIGIN = 'https://www.eventlinqs.com.au'
const STAND_IN_OWNER_EMAIL = 'delivered+elq-organiser-20260704d@resend.dev'

/** A fixed UUID for a fixture name, so a rerun finds what the first run made. */
const fid = (name) => {
  const h = createHash('sha256').update(`proof-fixture-bookedproof-read:${name}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

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

const CONTACT = 'Proof.Fixture.Organiser@EventLinqs.test'
const BUYER = {
  A: 'Proof.Buyer_A@eventlinqs.test',
  B: 'proof.buyer_b@eventlinqs.test',
  C: 'proof.buyer_c@eventlinqs.test',
  D: 'proof.buyer_d@eventlinqs.test',
  DECOY: 'proof.buyerxb@eventlinqs.test',
}

const ORG = fid('org')
const EV = {
  listing: fid('ev-listing'),
  older: fid('ev-older'),
  draft: fid('ev-draft'),
  private: fid('ev-private'),
  unlisted: fid('ev-unlisted'),
}
const SLUG = {
  listing: 'proof-fixture-bookedproof-read-listing',
  older: 'proof-fixture-bookedproof-read-older',
  draft: 'proof-fixture-bookedproof-read-draft',
  private: 'proof-fixture-bookedproof-read-private',
  unlisted: 'proof-fixture-bookedproof-read-unlisted',
}
const TIER = { listing: fid('tier-listing'), older: fid('tier-older') }
const LINK = { ig: fid('link-ig'), wa: fid('link-wa'), digest: fid('link-digest') }
// The platform's code format (SHARE_CODE_RE in src/lib/broadcast/share-codes.ts: ten base62 characters), so
// each fixture's /e/ address is one the short-link route would accept.
const CODE = { ig: 'pfbpIG0001', wa: 'pfbpWA0001', digest: 'pfbpDG0001' }

const ORDERS = [
  // id, event, buyer, qty, retained, paid at, link touches, final status
  { key: 'E0', event: 'older', buyer: 'A', qty: 1, fee: 180, paid: '2026-10-01T09:00:00Z', touches: [], status: 'confirmed' },
  { key: 'DECOY', event: 'older', buyer: 'DECOY', qty: 1, fee: 180, paid: '2026-09-20T09:00:00Z', touches: [], status: 'confirmed' },
  { key: 'O1', event: 'listing', buyer: 'A', qty: 1, fee: 180, paid: '2026-10-15T09:00:00Z', touches: [['ig', '2026-10-15T09:00:00Z']], status: 'confirmed' },
  {
    key: 'O2', event: 'listing', buyer: 'B', qty: 2, fee: 360, paid: '2026-10-16T09:00:00Z',
    touches: [['ig', '2026-10-16T09:00:00Z'], ['wa', '2026-10-16T10:00:00Z']], status: 'confirmed',
  },
  { key: 'O3', event: 'listing', buyer: 'C', qty: 4, fee: 720, paid: '2026-10-17T09:00:00Z', touches: [['ig', '2026-10-17T09:00:00Z']], status: 'refunded', refundedAt: '2026-10-19T09:00:00Z' },
  { key: 'O4', event: 'listing', buyer: 'D', qty: 1, fee: 180, paid: '2026-10-18T09:00:00Z', touches: [['digest', '2026-10-18T09:00:00Z']], status: 'confirmed' },
  { key: 'P1', event: 'listing', buyer: 'D', qty: 3, fee: 540, paid: null, touches: [['ig', '2026-10-18T10:00:00Z']], status: 'pending' },
]
const oid = (key) => fid(`order-${key}`)

async function seed() {
  const owner = await must(
    'the stand-in owner',
    db.from('profiles').select('id').eq('email', STAND_IN_OWNER_EMAIL).maybeSingle(),
  )
  if (!owner) throw new Error(`no TEST profile ${STAND_IN_OWNER_EMAIL} to own the fixture organisation`)
  const existing = await must('the fixture organisation', db.from('organisations').select('id').eq('id', ORG).maybeSingle())
  console.log(`fixture: ${existing ? 'reusing' : 'creating'} organisation ${ORG}`)

  const up = (table, rows) => must(`seed ${table}`, db.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true }))

  const event = (key, over) => ({
    id: EV[key],
    organisation_id: ORG,
    created_by: owner.id,
    slug: SLUG[key],
    title: `Proof fixture: Bookedproof read (${key})`,
    start_date: '2026-12-05T09:00:00Z',
    end_date: '2026-12-05T13:00:00Z',
    status: 'published',
    visibility: 'public',
    published_at: '2026-10-05T00:00:00Z',
    ...over,
  })
  const events = [
    event('listing', { status: 'completed' }),
    event('older', { start_date: '2026-10-10T09:00:00Z', end_date: '2026-10-10T13:00:00Z', status: 'completed', published_at: '2026-09-01T00:00:00Z' }),
    event('draft', { status: 'draft', published_at: null }),
    event('private', { visibility: 'private' }),
    event('unlisted', { visibility: 'unlisted' }),
  ]
  const inSitemap = events.filter((e) => Object.entries(SITEMAP_EVENT_MATCH).every(([k, v]) => e[k] === v))
  if (inSitemap.length > 0) {
    console.error(`REFUSED: ${inSitemap.map((e) => e.slug).join(', ')} would be in the sitemap (${JSON.stringify(SITEMAP_EVENT_MATCH)}); nothing was written`)
    process.exit(2)
  }

  await up('organisations', [{ id: ORG, owner_id: owner.id, name: 'Proof Fixture Bookedproof Read', slug: 'proof-fixture-bookedproof-read', email: CONTACT }])
  await up('events', events)
  /*
   * Rows seeded before 24 October are unlisted and published, and the upsert
   * above leaves an existing row alone. So each fixture event is brought to its
   * seeded visibility and status here, both in ONE write, so no fixture is ever
   * public and published at the same moment.
   */
  for (const e of events) {
    const current = await must(`fixture event ${e.slug}`, db.from('events').select('visibility, status').eq('id', e.id).single())
    if (current.visibility === e.visibility && current.status === e.status) continue
    await must(`bring ${e.slug} to its seeded shape`, db.from('events').update({ visibility: e.visibility, status: e.status }).eq('id', e.id))
    console.log(`fixture: ${e.slug} was ${current.visibility}/${current.status}, now ${e.visibility}/${e.status}`)
  }
  await up('ticket_tiers', [
    { id: TIER.listing, event_id: EV.listing, name: 'Proof fixture general admission', total_capacity: 500, price: 3000, currency: 'AUD' },
    { id: TIER.older, event_id: EV.older, name: 'Proof fixture general admission', total_capacity: 500, price: 3000, currency: 'AUD' },
  ])
  await up('share_links', [
    { id: LINK.ig, event_id: EV.listing, channel: 'instagram', code: CODE.ig, created_at: '2026-10-06T00:00:00Z' },
    { id: LINK.wa, event_id: EV.listing, channel: 'whatsapp', code: CODE.wa, created_at: '2026-10-07T00:00:00Z' },
    { id: LINK.digest, event_id: EV.listing, channel: 'digest', code: CODE.digest, created_at: '2026-10-08T00:00:00Z' },
  ])

  for (const o of ORDERS) {
    const id = oid(o.key)
    await up('orders', [{
      id,
      order_number: `PFBP-${o.key}`,
      event_id: EV[o.event],
      organisation_id: ORG,
      guest_email: BUYER[o.buyer],
      guest_name: `Proof Buyer ${o.buyer}`,
      status: 'pending',
      subtotal_cents: 3000 * o.qty,
      total_cents: 3000 * o.qty + o.fee,
      platform_fee_cents: o.fee,
      currency: 'AUD',
    }])
    await up('order_items', [{
      id: fid(`item-${o.key}`),
      order_id: id,
      item_type: 'ticket',
      item_name: 'Proof fixture general admission',
      ticket_tier_id: TIER[o.event],
      quantity: o.qty,
      unit_price_cents: 3000,
      total_cents: 3000 * o.qty,
    }])
    if (o.touches.length > 0) {
      await up('share_link_events', o.touches.map(([link, at], i) => ({
        id: fid(`conv-${o.key}-${i}`), link_id: LINK[link], kind: 'conversion', order_id: id, occurred_at: at,
      })))
    }
    const now = await must(`order ${o.key}`, db.from('orders').select('status').eq('id', id).single())
    if (o.paid && now.status === 'pending') {
      await must(`confirm ${o.key}`, db.from('orders').update({
        status: 'confirmed',
        confirmed_at: o.paid,
        destination_account_id: 'acct_proof_fixture_bookedproof',
        platform_fee_retained_cents: o.fee,
        organiser_amount_due_cents: 3000 * o.qty,
        destination_recorded_at: o.paid,
      }).eq('id', id).eq('status', 'pending'))
    }
    if (o.status === 'refunded') {
      await up('refunds', [{
        id: fid(`refund-${o.key}`), order_id: id, organisation_id: ORG, amount_cents: 3000 * o.qty + o.fee, currency: 'AUD',
        initiator: 'organiser', reason: 'other', status: 'completed', processed_at: o.refundedAt, created_at: o.refundedAt,
      }])
      await must(`refund ${o.key}`, db.from('orders').update({ status: 'refunded' }).eq('id', id).eq('status', 'confirmed'))
    }
    const { data: record } = await db.from('marketing_attribution').select('order_id').eq('order_id', id).maybeSingle()
    if (!record) {
      const stored = await resolveAndStoreOrder(id)
      if (!stored) throw new Error(`order ${o.key} could not be given its attribution record`)
    }
  }
}

function walk(value, path, planted, out) {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, planted, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, planted, out)
  else if (typeof value === 'string') for (const p of planted) if (value.toLowerCase().includes(p.toLowerCase())) out.push(`${path} carries ${p}`)
}

async function read(since) {
  const request = {
    emails: [CONTACT.toLowerCase(), 'nobody-proof@eventlinqs.test'],
    pages: [
      { page: `${ORIGIN}/events/${SLUG.listing}`, slug: SLUG.listing },
      { page: `${ORIGIN}/events/${SLUG.draft}`, slug: SLUG.draft },
      { page: `${ORIGIN}/events/${SLUG.unlisted}`, slug: SLUG.unlisted },
    ],
    since,
  }
  const rows = await readOrganiserRows(request)
  return assembleResponse({ ...request, rows, secret: SECRET, origin: ORIGIN, now: new Date() })
}

await seed()

const footprint = await sitemapFootprint(db, { organisationSlugs: ['proof-fixture-bookedproof-read'], eventSlugs: Object.values(SLUG) })
if (footprint.length > 0) {
  console.error(`REFUSED: the fixtures are in the sitemap: ${footprint.join(', ')}. A fixture is invisible to discovery for its whole life (scripts/verify/lib/sitemap-footprint.mjs); nothing was read.`)
  process.exit(2)
}
check("the fixtures put nothing in the sitemap, asked with the sitemap's own questions", true)

const recorded = await must(
  'the fixture orders\' attribution records',
  db.from('marketing_attribution').select('order_id').in('order_id', ORDERS.map((o) => oid(o.key))),
)
check('every fixture order carries its attribution record, as every order must', recorded.length === ORDERS.length, `${recorded.length} of ${ORDERS.length}`)

// THE RED: B's address as an unescaped LIKE pattern also matches the decoy.
const loose = await must(
  'the unescaped pattern',
  db.from('orders').select('id').is('user_id', null).ilike('guest_email', BUYER.B).not('confirmed_at', 'is', null),
)
check('RED: an unescaped underscore matches the decoy buyer on this database', loose.some((r) => r.id === oid('DECOY')), `${loose.length} rows`)

const body = await read(null)
const [org, nobody, page, draftPage, unlistedPage] = body.organisers
check('entries come one per address then one per page, in order', body.organisers.length === 5 && org.email === CONTACT.toLowerCase() && page.page?.endsWith(SLUG.listing))
check('a mixed-case contact address is found by its lower-cased form', org.found === true && org.listed === true)
check('an address that is no organiser carries nothing else', JSON.stringify(nobody) === JSON.stringify({ email: 'nobody-proof@eventlinqs.test', found: false }))
check('a draft page is not found', JSON.stringify(draftPage) === JSON.stringify({ page: `${ORIGIN}/events/${SLUG.draft}`, found: false }))
check('public only: an unlisted page is not found', JSON.stringify(unlistedPage) === JSON.stringify({ page: `${ORIGIN}/events/${SLUG.unlisted}`, found: false }))
check("a page's entry names the organisation, never its address", page.found === true && page.organisation_name === 'Proof Fixture Bookedproof Read' && !('email' in page))

const ids = (org.listings ?? []).map((l) => l.event_id)
check('listings are the published, public events, newest first; never the draft, the private or the unlisted one', JSON.stringify(ids) === JSON.stringify([EV.listing, EV.older]), ids.join(','))
const listing = org.listings?.[0] ?? {}
const older = org.listings?.[1] ?? {}
check("only the organiser's own links: instagram and whatsapp, never the digest", JSON.stringify(listing.share_links?.map((l) => l.code)) === JSON.stringify([CODE.ig, CODE.wa]))
check('share link addresses are the /e/ short links', listing.share_links?.[0]?.url === `${ORIGIN}/e/${CODE.ig}`)
const keys = listing.orders?.map((o) => o.order_key) ?? []
check('orders: the three paid through the instagram link, oldest first; not the digest one, not the unpaid one',
  JSON.stringify(keys) === JSON.stringify(['O1', 'O2', 'O3'].map((k) => orderKey(SECRET, oid(k)))))
check('first touch: O2 is credited to instagram, the whatsapp link reads zero',
  listing.orders?.every((o) => o.share_code === CODE.ig))
check('tickets are the issued ticket rows: 1, 2 and 4', JSON.stringify(listing.orders?.map((o) => o.tickets)) === JSON.stringify([1, 2, 4]))
check('O3 is reversed; O1 and O2 are not', JSON.stringify(listing.orders?.map((o) => o.reversed)) === JSON.stringify([false, false, true]))
check('buyer A paid earlier elsewhere (not first); B is first despite the decoy; C is first',
  JSON.stringify(listing.orders?.map((o) => o.buyer_first_paid_order)) === JSON.stringify([false, true, true]))
check('the sums count only the orders not reversed: 3 tickets, 540 cents', listing.tickets_through_share_links === 3 && listing.fee_through_share_links_cents === 540)
check('paid_at is the confirmed moment', listing.orders?.[0]?.paid_at === '2026-10-15T09:00:00.000Z')
check('currency comes from the ledger', listing.currency === 'AUD')
check('the older listing has no orders through links and sums to zero, priced in its tier currency',
  older.orders?.length === 0 && older.tickets_through_share_links === 0 && older.currency === 'AUD')

const s1 = (await read(new Date('2026-10-16T12:00:00Z'))).organisers[0].listings[0]
check('since limits orders to those paid or reversed after it, and leaves the sums whole',
  JSON.stringify(s1.orders.map((o) => o.order_key)) === JSON.stringify([orderKey(SECRET, oid('O3'))]) && s1.tickets_through_share_links === 3)
const s2 = (await read(new Date('2026-10-18T12:00:00Z'))).organisers[0].listings[0]
check('a refund after since brings a paid-before order back, reversed', s2.orders.length === 1 && s2.orders[0].reversed === true)
const s3 = (await read(new Date('2026-10-20T00:00:00Z'))).organisers[0].listings[0]
check('nothing paid or reversed after since: no orders, sums still whole', s3.orders.length === 0 && s3.fee_through_share_links_cents === 540)

const leaks = []
walk(body, '$', [...Object.values(BUYER), ...ORDERS.map((o) => oid(o.key)), ...ORDERS.map((o) => `PFBP-${o.key}`), 'Proof Buyer'], leaks)
check('no buyer address, name, order id or order number appears anywhere in the answer', leaks.length === 0, leaks.slice(0, 3).join('; '))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
