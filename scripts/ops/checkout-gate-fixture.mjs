// THE CHECKOUT GATE'S OWN PAID EVENT, ON TEST ONLY (project manager, 22 October
// 2026, 18:50).
//
// The pre-push gate's checkout-viewport step walks a real purchase on a paid
// event (scripts/verify/ux6-checkout-viewport-proof.mjs). It used to take
// whatever paid event TEST happened to hold, and on 22 October none was left:
// of 408 active tiers, 307 belonged to events that had already started, 55 to
// unpublished events, 45 to seated ones and 1 was unpriced, so the step stopped
// every push. So the gate keeps one event of its own, and this script keeps it
// fit: published, unseated, priced, UNLISTED (off every browse surface), with
// room for far more than one run uses, and dated at least MIN_DAYS_OUT ahead. It
// rolls the date forward and refills the room when either runs short.
//
// It is named as a gate fixture in its title and slug so no person mistakes it
// for a real event.
//
// Usage (the gate runs both, in this order; by hand from the worktree, TEST env):
//   node --env-file=.env.local scripts/ops/checkout-gate-fixture.mjs --ensure
//   node --env-file=.env.local scripts/ops/checkout-gate-fixture.mjs --check-public <base>
//
// TEST ONLY, checked twice: the repository preflight, then the TEST ref itself.
//
// REVERSAL, read by the machine: --check-public fails the gate when the fixture's
// slug appears on any browse surface of the build under test, or when production
// answers its page. A fixture in production is deleted by a production write
// (a dry run first, then Lawal's APPLY), never by this script.
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

export const TEST_REF = 'vkapkibzokmfaxqogypq'
export const FIXTURE_SLUG = 'gate-fixture-checkout-viewport'
export const FIXTURE_TITLE = 'Gate fixture: checkout test (TEST only, not a real event)'
export const TIER_NAME = 'Gate fixture ticket'
/** The PM's floor: the event is always at least this many days out. */
export const MIN_DAYS_OUT = 30
/** When it rolls, it rolls to this many days out, so it rolls about monthly. */
export const ROLL_TO_DAYS = 60
/** Twenty runs of the drive (three widths, two tickets each). */
export const MIN_ROOM = 120
/** What a refill leaves free. */
export const REFILL_ROOM = 1200
const PRICE_CENTS = 3000
const DAY_MS = 24 * 60 * 60 * 1000
const TAG = '[checkout-gate-fixture]'
/** Browse surfaces of the build under test the fixture must never appear on. */
export const PUBLIC_SURFACES = ['/', '/events', '/sitemap.xml', '/city/melbourne']
const PRODUCTION_ORIGIN = 'https://www.eventlinqs.com.au'

/**
 * @typedef {{ status?: string, published_at?: string, visibility?: string, seat_map_id?: null,
 *   external_ticket_url?: null, start_date?: string, end_date?: string }} EventUpdates
 * @typedef {{ is_active?: boolean, is_visible?: boolean, price?: number, max_per_order?: number,
 *   sale_start?: null, sale_end?: null, total_capacity?: number }} TierUpdates
 * @typedef {{ createEvent: boolean, eventUpdates: EventUpdates, createTier: boolean,
 *   tierUpdates: TierUpdates, reasons: string[] }} FixturePlan
 */

/**
 * What the fixture needs, from what TEST holds now. Pure, so its own test can
 * drive every branch. `event` and `tier` are the rows as read (or null).
 * @returns {FixturePlan}
 */
export function planFixture({ event, tier }, now) {
  /** @type {string[]} */
  const reasons = []
  if (!event) return { createEvent: true, eventUpdates: {}, createTier: true, tierUpdates: {}, reasons: ['no fixture event yet'] }
  /** @type {EventUpdates} */
  const eventUpdates = {}
  if (event.status !== 'published') {
    eventUpdates.status = 'published'
    eventUpdates.published_at = new Date(now).toISOString()
    reasons.push(`status was ${event.status}`)
  }
  if (event.visibility !== 'unlisted') {
    eventUpdates.visibility = 'unlisted'
    reasons.push(`visibility was ${event.visibility}`)
  }
  if (event.seat_map_id) {
    eventUpdates.seat_map_id = null
    reasons.push('it was seated')
  }
  if (typeof event.external_ticket_url === 'string' && event.external_ticket_url.trim() !== '') {
    eventUpdates.external_ticket_url = null
    reasons.push('it had an external ticket link')
  }
  const startMs = new Date(event.start_date).getTime()
  if (!Number.isFinite(startMs) || startMs - now < MIN_DAYS_OUT * DAY_MS) {
    const start = rollStart(now)
    eventUpdates.start_date = start.toISOString()
    eventUpdates.end_date = new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString()
    reasons.push(`it was under ${MIN_DAYS_OUT} days out`)
  }
  if (!tier) return { createEvent: false, eventUpdates, createTier: true, tierUpdates: {}, reasons: [...reasons, 'no fixture ticket type yet'] }
  /** @type {TierUpdates} */
  const tierUpdates = {}
  if (!tier.is_active) tierUpdates.is_active = true
  if (!tier.is_visible) tierUpdates.is_visible = true
  if (!(tier.price > 0)) tierUpdates.price = PRICE_CENTS
  if ((tier.max_per_order ?? 1) < 2) tierUpdates.max_per_order = 10
  if (tier.sale_start && new Date(tier.sale_start).getTime() > now) tierUpdates.sale_start = null
  if (tier.sale_end) tierUpdates.sale_end = null
  const held = (tier.sold_count ?? 0) + (tier.reserved_count ?? 0)
  const room = (tier.total_capacity ?? 0) - held
  if (room < MIN_ROOM) {
    tierUpdates.total_capacity = held + REFILL_ROOM
    reasons.push(`only ${room} places left`)
  }
  if (Object.keys(tierUpdates).length > 0 && !reasons.some((r) => r.startsWith('only'))) reasons.push('the ticket type had drifted from a sellable shape')
  return { createEvent: false, eventUpdates, createTier: false, tierUpdates, reasons }
}

/** ROLL_TO_DAYS ahead, on the hour, so a rolled date reads as a plain time. */
export function rollStart(now) {
  const d = new Date(now + ROLL_TO_DAYS * DAY_MS)
  d.setUTCMinutes(0, 0, 0)
  return d
}

/** Does a page body name the fixture? Its slug is the one thing every link to it carries. */
export function namesFixture(body) {
  return typeof body === 'string' && body.includes(FIXTURE_SLUG)
}

/** The organisation that may own it: one that can take money, chosen by the most tickets it has sold. */
function sellable(o) {
  return (
    Boolean(o?.stripe_account_id) &&
    o.stripe_charges_enabled === true &&
    o.stripe_payouts_enabled === true &&
    o.payout_status === 'active' &&
    typeof o.stripe_account_country === 'string' &&
    o.stripe_account_country.trim() !== ''
  )
}

function testOnly() {
  assertNotProduction()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url.includes(TEST_REF)) {
    console.error(`${TAG} REFUSED: NEXT_PUBLIC_SUPABASE_URL is not TEST (${TEST_REF}); this script never runs anywhere else`)
    process.exit(2)
  }
  if (!key) {
    console.error(`${TAG} REFUSED: SUPABASE_SERVICE_ROLE_KEY is not set`)
    process.exit(2)
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}

async function chooseOwner(db) {
  const tiers = must(
    await db
      .from('ticket_tiers')
      .select(
        'sold_count, event:events!inner(organisation_id, cover_image_url, status, organisation:organisations!inner(id, owner_id, slug, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status, stripe_account_country))',
      )
      .gt('price', 0)
      .gt('sold_count', 0)
      .limit(1000),
    'read the paid tiers that have sold',
  )
  const byOrg = new Map()
  for (const t of tiers ?? []) {
    const o = t.event?.organisation
    if (!sellable(o) || !o.owner_id) continue
    const cur = byOrg.get(o.id) ?? { org: o, sold: 0, cover: null }
    cur.sold += t.sold_count ?? 0
    if (!cur.cover && t.event.status === 'published' && t.event.cover_image_url) cur.cover = t.event.cover_image_url
    byOrg.set(o.id, cur)
  }
  const best = [...byOrg.values()].filter((c) => c.cover).sort((a, b) => b.sold - a.sold)[0]
  if (!best) throw new Error('no organisation on TEST can take money and has sold a paid ticket with a published cover to borrow')
  return best
}

async function ensure() {
  const db = testOnly()
  const now = Date.now()
  const readEvent = async () =>
    must(
      await db
        .from('events')
        .select('id, slug, status, visibility, seat_map_id, external_ticket_url, start_date, organisation_id, organisation:organisations!inner(slug, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status, stripe_account_country)')
        .eq('slug', FIXTURE_SLUG)
        .maybeSingle(),
      'read the fixture event',
    )
  let event = await readEvent()
  const readTier = async (eventId) =>
    must(
      await db
        .from('ticket_tiers')
        .select('id, name, price, total_capacity, sold_count, reserved_count, max_per_order, is_active, is_visible, sale_start, sale_end')
        .eq('event_id', eventId)
        .eq('name', TIER_NAME)
        .maybeSingle(),
      'read the fixture ticket type',
    )
  let tier = event ? await readTier(event.id) : null
  const plan = planFixture({ event, tier }, now)

  if (plan.createEvent) {
    const owner = await chooseOwner(db)
    const start = rollStart(now)
    event = must(
      await db
        .from('events')
        .insert({
          organisation_id: owner.org.id,
          created_by: owner.org.owner_id,
          title: FIXTURE_TITLE,
          slug: FIXTURE_SLUG,
          description: 'An event the pre-push gate keeps on TEST for its checkout drive. It is not a real event and is never listed.',
          start_date: start.toISOString(),
          end_date: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
          timezone: 'Australia/Melbourne',
          event_type: 'in_person',
          venue_name: 'Gate Fixture Hall',
          venue_city: 'Melbourne',
          status: 'published',
          visibility: 'unlisted',
          published_at: new Date(now).toISOString(),
          cover_image_url: owner.cover,
        })
        .select('id, slug, status, visibility, seat_map_id, external_ticket_url, start_date, organisation_id')
        .single(),
      'create the fixture event',
    )
    console.log(`${TAG} created ${FIXTURE_SLUG} for organisation ${owner.org.slug} (sold ${owner.sold} paid tickets before)`)
  } else if (Object.keys(plan.eventUpdates).length > 0) {
    must(await db.from('events').update(plan.eventUpdates).eq('id', event.id), 'update the fixture event')
  }
  if (plan.createTier) {
    must(
      await db.from('ticket_tiers').insert({
        event_id: event.id,
        name: TIER_NAME,
        price: PRICE_CENTS,
        currency: 'AUD',
        total_capacity: REFILL_ROOM,
        min_per_order: 1,
        max_per_order: 10,
        is_active: true,
        is_visible: true,
        sort_order: 0,
      }),
      'create the fixture ticket type',
    )
  } else if (Object.keys(plan.tierUpdates).length > 0) {
    must(await db.from('ticket_tiers').update(plan.tierUpdates).eq('id', tier.id), 'update the fixture ticket type')
  }

  // Read it back and judge it by the drive's own clauses, never by the writes above.
  event = await readEvent()
  tier = event ? await readTier(event.id) : null
  const left = tier ? tier.total_capacity - tier.sold_count - tier.reserved_count : 0
  const faults = []
  if (!event) faults.push('the event is missing after the write')
  else {
    if (event.status !== 'published') faults.push('not published')
    if (event.visibility !== 'unlisted') faults.push('not unlisted')
    if (event.seat_map_id) faults.push('seated')
    if (new Date(event.start_date).getTime() - now < MIN_DAYS_OUT * DAY_MS) faults.push(`under ${MIN_DAYS_OUT} days out`)
    if (!sellable(event.organisation)) faults.push('its organisation cannot take money')
  }
  if (!tier) faults.push('the ticket type is missing after the write')
  else if (!(tier.price > 0) || left < MIN_ROOM || !tier.is_active || !tier.is_visible) faults.push(`ticket type not sellable (price ${tier.price}, ${left} left)`)
  if (faults.length > 0) {
    console.error(`${TAG} FAIL: ${faults.join('; ')}`)
    process.exit(1)
  }
  const note = plan.reasons.length ? `fixed: ${plan.reasons.join('; ')}` : 'nothing to fix'
  console.log(`${TAG} PASS: ${FIXTURE_SLUG} is published, unlisted, unseated, starts ${event.start_date.slice(0, 10)}, ${left} places at ${tier.price} cents (${note})`)
}

async function checkPublic(base) {
  if (!base) {
    console.error(`${TAG} REFUSED: --check-public needs the base URL of the build under test`)
    process.exit(2)
  }
  const db = testOnly()
  const event = must(
    await db.from('events').select('slug, organisation:organisations!inner(slug)').eq('slug', FIXTURE_SLUG).maybeSingle(),
    'read the fixture event',
  )
  const surfaces = [...PUBLIC_SURFACES]
  if (event?.organisation?.slug) surfaces.push(`/organisers/${event.organisation.slug}`)
  const shown = []
  for (const path of surfaces) {
    const res = await fetch(new URL(path, base), { redirect: 'follow' }).catch(() => null)
    if (!res) {
      shown.push(`${path} could not be read`)
      continue
    }
    if (res.status >= 400) continue
    if (namesFixture(await res.text())) shown.push(`${path} lists it`)
  }
  let production = 'not judged (no answer)'
  const prod = await fetch(`${PRODUCTION_ORIGIN}/events/${FIXTURE_SLUG}`, { redirect: 'manual' }).catch(() => null)
  if (prod) {
    production = `HTTP ${prod.status}`
    if (prod.status === 200) shown.push(`production answers /events/${FIXTURE_SLUG} with 200; delete it there by a production write (dry run, then Lawal's APPLY)`)
  }
  if (shown.length > 0) {
    console.error(`${TAG} FAIL: the fixture is visible where it must never be: ${shown.join('; ')}`)
    process.exit(1)
  }
  console.log(`${TAG} PASS: on none of ${surfaces.join(', ')}; production ${production}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2]
  const run = mode === '--ensure' ? ensure() : mode === '--check-public' ? checkPublic(process.argv[3]) : null
  if (!run) {
    console.error(`${TAG} usage: --ensure | --check-public <base>`)
    process.exit(2)
  }
  run.catch((error) => {
    console.error(`${TAG} FAIL: ${error.message}`)
    process.exit(1)
  })
}
