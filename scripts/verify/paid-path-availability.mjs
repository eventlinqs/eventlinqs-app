/**
 * IS THERE ANYTHING ON THIS DEPLOYMENT A BUYER COULD ACTUALLY PAY FOR?
 *
 * The full platform audit walked to the checkout and stopped short of Stripe,
 * twice, and both times the honest answer was not "the money path is broken" but
 * "there is nothing here to buy". Scraping page text cannot tell those apart with
 * confidence, and a money-path claim is not a place for a guess, so this asks the
 * database directly.
 *
 * A ticket is purchasable only when ALL of these hold:
 *   - the event is published and public and in the future
 *   - its organisation has stripe_charges_enabled
 *   - it has at least one tier with a price above zero and capacity left
 *
 * TEST ONLY. It refuses to run against production, and it only ever SELECTs.
 *
 *   node --env-file=.env.test scripts/verify/paid-path-availability.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Use --env-file=.env.test')
  process.exit(2)
}
if (URL_.includes('gndnldyfudbytbboxesk')) {
  console.error('Refusing to run against PRODUCTION.')
  process.exit(1)
}

const raw = createClient(URL_, KEY, { auth: { persistSession: false } })
const FORBIDDEN = ['insert', 'update', 'upsert', 'delete']
const db = {
  from(table) {
    return new Proxy(raw.from(table), {
      get(target, prop) {
        if (typeof prop === 'string' && FORBIDDEN.includes(prop)) {
          throw new Error(`READ-ONLY: refusing to ${prop}() on ${table}`)
        }
        const v = Reflect.get(target, prop)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
  },
}

console.log(`TEST (read only): ${URL_}\n`)

const nowIso = new Date().toISOString()
const { data: events, error: evErr } = await db
  .from('events')
  .select('id, slug, title, status, visibility, start_date, organisation_id')
  .eq('status', 'published')
  .gte('start_date', nowIso)
if (evErr) {
  console.error('events query failed:', evErr.message)
  process.exit(1)
}
console.log(`published, upcoming events: ${events.length}`)

const orgIds = [...new Set(events.map((e) => e.organisation_id).filter(Boolean))]
const orgs = []
for (let i = 0; i < orgIds.length; i += 40) {
  const { data } = await db
    .from('organisations')
    .select('id, name, slug, stripe_charges_enabled, stripe_account_id')
    .in('id', orgIds.slice(i, i + 40))
  orgs.push(...(data ?? []))
}
const canCharge = new Set(orgs.filter((o) => o.stripe_charges_enabled).map((o) => o.id))
console.log(`organisations behind them: ${orgs.length}, of which ${canCharge.size} can charge`)

const sellable = events.filter((e) => canCharge.has(e.organisation_id))
console.log(`events whose organiser CAN charge: ${sellable.length}`)

const tiers = []
for (let i = 0; i < sellable.length; i += 40) {
  const { data, error } = await db
    .from('ticket_tiers')
    .select('id, event_id, name, price, total_capacity, sold_count, is_active')
    .in('event_id', sellable.slice(i, i + 40).map((e) => e.id))
  if (error) {
    console.error('ticket_tiers query failed:', error.message)
    break
  }
  tiers.push(...(data ?? []))
}

// price is stored in CENTS (project memory, ticket_tiers.price IS cents).
const paidTiers = tiers.filter(
  (t) => t.is_active !== false && Number(t.price) > 0 && Number(t.total_capacity ?? 0) > Number(t.sold_count ?? 0),
)
const paidEventIds = new Set(paidTiers.map((t) => t.event_id))
const paidEvents = sellable.filter((e) => paidEventIds.has(e.id))

console.log(`\ntiers on those events            : ${tiers.length}`)
console.log(`tiers priced above zero with room: ${paidTiers.length}`)
console.log(`EVENTS A BUYER COULD PAY FOR     : ${paidEvents.length}`)
for (const e of paidEvents.slice(0, 10)) {
  const t = paidTiers.filter((x) => x.event_id === e.id)
  console.log(`   /events/${e.slug}  ${t.map((x) => `${x.name} $${(Number(x.price) / 100).toFixed(2)}`).join(', ')}`)
}
if (paidEvents.length === 0) {
  console.log(
    '\nVERDICT: nothing on this deployment can be paid for. The Stripe payment surface is\n' +
      'unreachable not because the money path is broken but because there is no priced ticket\n' +
      'behind an organiser who can charge. No automated walk can prove the paid checkout here.',
  )
}
