/**
 * Finds the real TEST rows the guide capture drive needs: the organiser's
 * organisation, an event with orders, a seated event, and a venue that has a
 * seating chart. Prints them as JSON for scripts/verify/guides-capture.mjs.
 *
 * TEST ONLY. Hard safety stop on the production project ref.
 * Usage: node scripts/verify/guides-capture-targets.mjs
 */
import fs from 'node:fs'

const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: this is production')
if (!URL_.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json' }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

const ORGANISER_EMAIL = 'broadcast.gate.organiser@eventlinqs.com'

const users = await q(`profiles?email=eq.${ORGANISER_EMAIL}&select=id,email,full_name`)
if (users.length === 0) throw new Error(`organiser ${ORGANISER_EMAIL} not found on TEST`)
const userId = users[0].id

const orgs = await q(`organisations?owner_id=eq.${userId}&select=id,name,stripe_account_id&limit=1`)
if (orgs.length === 0) throw new Error('organiser has no organisation on TEST')
const org = orgs[0]

const events = await q(
  `events?organisation_id=eq.${org.id}&status=eq.published&select=id,title,slug,has_reserved_seating,venue_id&order=created_at.desc&limit=40`,
)

// An event with at least one order, for the refund capture.
let orderTarget = null
for (const ev of events) {
  const orders = await q(
    `orders?event_id=eq.${ev.id}&status=eq.confirmed&select=id,order_number&limit=1`,
  )
  if (orders.length > 0) {
    orderTarget = { eventId: ev.id, eventTitle: ev.title, orderId: orders[0].id }
    break
  }
}

const seatedEvent = events.find(e => e.has_reserved_seating) ?? null

// A venue with a saved seating chart, for the room studio captures.
const seatMaps = await q('seat_maps?select=id,name,venue_id&limit=20')
let venueWithChart = null
for (const map of seatMaps) {
  if (!map.venue_id) continue
  const venues = await q(`venues?id=eq.${map.venue_id}&select=id,name,organisation_id&limit=1`)
  if (venues.length > 0 && venues[0].organisation_id === org.id) {
    venueWithChart = { venueId: venues[0].id, venueName: venues[0].name, seatMapId: map.id }
    break
  }
}
// Fall back to any venue this organisation owns, so the studio still opens.
if (!venueWithChart) {
  const venues = await q(`venues?organisation_id=eq.${org.id}&select=id,name&limit=1`)
  if (venues.length > 0) venueWithChart = { venueId: venues[0].id, venueName: venues[0].name, seatMapId: null }
}

const anyPublished = events[0] ?? null

const out = {
  userId,
  organisationId: org.id,
  organisationName: org.name,
  anyPublishedEventId: anyPublished?.id ?? null,
  anyPublishedEventTitle: anyPublished?.title ?? null,
  seatedEventId: seatedEvent?.id ?? null,
  seatedEventSlug: seatedEvent?.slug ?? null,
  orderTarget,
  venueWithChart,
}
console.log(JSON.stringify(out, null, 2))
fs.writeFileSync('scripts/verify/.guides-capture-targets.json', JSON.stringify(out, null, 2))
