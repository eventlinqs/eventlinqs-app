/**
 * PRODUCTION, READ ONLY. Answers the founder's three "how bad is it on live"
 * questions and nothing else.
 *
 * This file performs SELECT only. There is no insert, update, upsert, delete
 * or rpc anywhere in it, and the client is wrapped so that calling one throws
 * rather than reaching the network. The constitution forbids writing to the
 * production database and this script is written so that a careless edit
 * fails loudly instead of quietly writing.
 *
 *   node scripts/verify/production-read-only-probe.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
if (!URL?.includes('gndnldyfudbytbboxesk')) {
  console.error(`This probe is for PRODUCTION. ${URL} is not it.`)
  process.exit(1)
}

const raw = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/** Read-only guard: any mutating verb throws before it can reach the network. */
const FORBIDDEN = ['insert', 'update', 'upsert', 'delete']
const db = {
  from(table) {
    const builder = raw.from(table)
    return new Proxy(builder, {
      get(target, prop) {
        if (typeof prop === 'string' && FORBIDDEN.includes(prop)) {
          throw new Error(`READ-ONLY PROBE: refusing to ${prop}() on ${table}`)
        }
        const value = Reflect.get(target, prop)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  },
}

console.log(`PRODUCTION (read only): ${URL}\n`)

// ---------------------------------------------------------------------------
console.log('=== 1. SEVERITY ONE: events sitting scheduled and stranded ===')
const { data: scheduled, error: schedErr } = await db
  .from('events')
  .select('id, slug, title, status, scheduled_publish_at, start_date, created_at, organisation_id')
  .eq('status', 'scheduled')
  .order('scheduled_publish_at', { ascending: true })

if (schedErr) {
  console.log('  QUERY FAILED:', schedErr.message)
} else {
  const now = Date.now()
  const stranded = (scheduled ?? []).filter(
    (e) => e.scheduled_publish_at && new Date(e.scheduled_publish_at).getTime() < now,
  )
  const pending = (scheduled ?? []).filter(
    (e) => e.scheduled_publish_at && new Date(e.scheduled_publish_at).getTime() >= now,
  )
  const noTime = (scheduled ?? []).filter((e) => !e.scheduled_publish_at)

  console.log(`  events with status='scheduled'        : ${scheduled?.length ?? 0}`)
  console.log(`  STRANDED (publish time already passed): ${stranded.length}`)
  console.log(`  pending  (publish time still ahead)   : ${pending.length}`)
  console.log(`  scheduled with no publish time set    : ${noTime.length}`)
  for (const e of [...stranded, ...pending, ...noTime]) {
    const when = e.scheduled_publish_at ?? 'NO TIME SET'
    const late =
      e.scheduled_publish_at && new Date(e.scheduled_publish_at).getTime() < now
        ? `  STRANDED ${Math.floor((now - new Date(e.scheduled_publish_at).getTime()) / 86400000)} days`
        : ''
    console.log(`    ${e.slug}  publish_at=${when}  starts=${e.start_date}${late}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== 2. Consent rows captured but unreachable (null city) ===')
const { count: grantedNullCity } = await db
  .from('marketing_consents')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'granted')
  .is('city_slug', null)
const { count: grantedTotal } = await db
  .from('marketing_consents')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'granted')
console.log(`  granted consents total          : ${grantedTotal ?? 0}`)
console.log(`  granted with NULL city_slug     : ${grantedNullCity ?? 0}   <-- can never receive a digest`)
const { data: nullCityRows } = await db
  .from('marketing_consents')
  .select('email, source, granted_at')
  .eq('status', 'granted')
  .is('city_slug', null)
  .limit(20)
for (const r of nullCityRows ?? []) {
  console.log(`    ${r.email}  source=${r.source}  granted=${r.granted_at}`)
}

// ---------------------------------------------------------------------------
console.log('\n=== 3. Did anyone ever type an address into the newsletter box ===')
for (const table of ['email_subscribers', 'newsletter_subscribers']) {
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
  if (error) {
    console.log(`  ${table}: ${error.message}`)
    continue
  }
  console.log(`  ${table}: ${count ?? 0} rows`)
  const { data: rows } = await db
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  for (const r of rows ?? []) {
    console.log(`    ${JSON.stringify(r)}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== 4. The city_primary picture on production ===')
const { count: pubTotal } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'published')
const { count: pubNullCity } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'published')
  .is('city_primary', null)
console.log(`  published events                : ${pubTotal ?? 0}`)
console.log(`  with NULL city_primary          : ${pubNullCity ?? 0}`)

// ---------------------------------------------------------------------------
console.log('\n=== 5. Share attribution: does the money leg ever fire ===')
for (const kind of ['view', 'click', 'conversion']) {
  const { count } = await db
    .from('share_link_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
  console.log(`  ${kind.padEnd(11)}: ${count ?? 0}`)
}
const { count: linkCount } = await db
  .from('share_links')
  .select('id', { count: 'exact', head: true })
console.log(`  share_links : ${linkCount ?? 0}`)

// ---------------------------------------------------------------------------
console.log('\n=== 6. Waitlist rows on production, and their consent version ===')
const { data: wl } = await db
  .from('city_waitlist_signups')
  .select('city_slug, consent_version, unsubscribed_at')
const byVersion = {}
for (const r of wl ?? []) {
  const key = `${r.consent_version}${r.unsubscribed_at ? ' (left)' : ''}`
  byVersion[key] = (byVersion[key] ?? 0) + 1
}
console.log(`  total: ${wl?.length ?? 0}`, JSON.stringify(byVersion))

// ---------------------------------------------------------------------------
console.log('\n=== 7. Feature flags on production (/admin/flags 404s) ===')
const { data: flags, error: flagErr } = await db
  .from('feature_flags')
  .select('flag, enabled, description')
  .order('flag')
if (flagErr) {
  console.log('  QUERY FAILED:', flagErr.message)
} else {
  for (const f of flags ?? []) {
    console.log(`  ${f.enabled ? 'ON ' : 'off'}  ${f.flag}`)
  }
}

console.log('\nread-only probe complete. Nothing was written.')

// ---------------------------------------------------------------------------
// Is "0 conversions" a broken leg, or simply no orders to attribute?
console.log('\n=== 8. Is there anything for a conversion to attribute to ===')
for (const t of ['orders', 'tickets']) {
  const { count, error } = await db.from(t).select('id', { count: 'exact', head: true })
  console.log(`  ${t}: ${error ? error.message : (count ?? 0)}`)
}
const { count: paidOrders } = await db
  .from('orders')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'paid')
console.log(`  orders status=paid: ${paidOrders ?? 0}`)
const { count: chargesOn } = await db
  .from('organisations')
  .select('id', { count: 'exact', head: true })
  .eq('stripe_charges_enabled', true)
const { count: orgTotal } = await db
  .from('organisations')
  .select('id', { count: 'exact', head: true })
console.log(`  organisations that can charge: ${chargesOn ?? 0} of ${orgTotal ?? 0}`)
