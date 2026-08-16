/**
 * PART 2: THE ORPHAN QUESTION, ON PRODUCTION. READ ONLY. WRITES NOTHING.
 *
 * The 33-organisations / 13-venues / 31-Connect-accounts figure is a TEST figure.
 * It was measured against vkapkibzokmfaxqogypq by the purge rehearsal, and TEST
 * has been written to by dozens of proof scripts that never touched production.
 * Carrying that number across to the live database would be an assumption wearing
 * a measurement's clothes. This measures production instead.
 *
 * IT ANSWERS EXACTLY THREE THINGS:
 *   1. how many organisations own ONLY seeded events
 *   2. how many of those hold a stripe_account_id
 *   3. whether those Stripe accounts are live-mode or test-mode
 *
 * WHY IT IS SAFE. Two independent layers, neither of which is a promise in a
 * comment:
 *
 *   a. The project ref is asserted before a single query runs. If the resolved
 *      URL is not production, the probe exits rather than quietly measuring the
 *      wrong database and reporting it as production.
 *   b. Every table handle is wrapped in a Proxy that THROWS on insert, update,
 *      upsert, delete and rpc. A careless edit fails loudly at the call site
 *      instead of reaching the network. This is the same guard
 *      scripts/verify/production-read-only-probe.mjs uses, kept identical on
 *      purpose so there is one shape to review rather than two.
 *
 * The credentials are NOT copied into this worktree. A .env.local pointing at
 * production sitting in the launch worktree is the exact footgun that has already
 * cost this project once, so the path is passed in and read in place.
 *
 *   node scripts/verify/production-orphan-probe.mjs --env="<path to a .env.local>"
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3).replace(/^"|"$/g, '') : undefined
}

const ENV_PATH = arg('env') ?? '.env.local'
const PROD_REF = 'gndnldyfudbytbboxesk'

const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_?.includes(PROD_REF)) {
  console.error(`This probe answers a question ABOUT PRODUCTION. ${URL_ ?? '(no URL)'} is not ${PROD_REF}.`)
  process.exit(1)
}
if (!KEY) {
  console.error(`${ENV_PATH} carries no SUPABASE_SERVICE_ROLE_KEY, so nothing can be read.`)
  process.exit(1)
}

const raw = createClient(URL_, KEY, { auth: { persistSession: false } })

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
  rpc() {
    throw new Error('READ-ONLY PROBE: refusing to rpc()')
  },
}

const out = { probedAt: new Date().toISOString(), project: PROD_REF }
console.log(`PRODUCTION (READ ONLY): ${URL_}\n`)

// ── 1. Does production even carry the seed marker ───────────────────────────
console.log('=== 1. The seed marker on production ===')
const { count: eventsTotal, error: evErr } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
if (evErr) {
  console.log(`  events: QUERY FAILED: ${evErr.message}`)
  process.exit(1)
}
const { count: seededEvents, error: seedErr } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('is_seed_data', true)
if (seedErr) {
  console.log(`  is_seed_data: QUERY FAILED: ${seedErr.message}`)
  console.log('  The column the purge keys off does not exist on production, which is itself the answer:')
  console.log('  a purge written against is_seed_data cannot run here until the migration that adds it does.')
  process.exit(1)
}
const { count: realEvents } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('is_seed_data', false)
console.log(`  events total        : ${eventsTotal ?? 0}`)
console.log(`  is_seed_data = true : ${seededEvents ?? 0}`)
console.log(`  is_seed_data = false: ${realEvents ?? 0}`)
console.log(`  neither (NULL)      : ${(eventsTotal ?? 0) - (seededEvents ?? 0) - (realEvents ?? 0)}`)
Object.assign(out, { eventsTotal, seededEvents, realEvents })

// ── 2. Which organisations own seeded events, and do they own anything else ──
console.log('\n=== 2. Organisations behind the seeded events ===')
const { data: seedRows } = await db
  .from('events')
  .select('id, slug, organisation_id, status')
  .eq('is_seed_data', true)
const { data: realRows } = await db
  .from('events')
  .select('id, organisation_id')
  .eq('is_seed_data', false)

const seededOrgIds = [...new Set((seedRows ?? []).map((e) => e.organisation_id).filter(Boolean))]
const realOrgIds = new Set((realRows ?? []).map((e) => e.organisation_id).filter(Boolean))
const seededOnlyOrgIds = seededOrgIds.filter((id) => !realOrgIds.has(id))

console.log(`  organisations owning at least one seeded event : ${seededOrgIds.length}`)
console.log(`  of those, owning ONLY seeded events            : ${seededOnlyOrgIds.length}`)
console.log(`  of those, also owning real events (KEEP)       : ${seededOrgIds.length - seededOnlyOrgIds.length}`)
Object.assign(out, {
  orgsWithSeededEvents: seededOrgIds.length,
  orgsSeededOnly: seededOnlyOrgIds.length,
})

// ── 3. Do the seeded-only organisations hold Connect accounts ───────────────
console.log('\n=== 3. Connect accounts held by the seeded-only organisations ===')
const orgs = []
// Chunked so a long IN list cannot blow the URL length limit and silently truncate.
for (let i = 0; i < seededOnlyOrgIds.length; i += 40) {
  const { data, error } = await db
    .from('organisations')
    .select('id, name, slug, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete, created_at')
    .in('id', seededOnlyOrgIds.slice(i, i + 40))
  if (error) {
    console.log(`  organisations: QUERY FAILED: ${error.message}`)
    break
  }
  orgs.push(...(data ?? []))
}
const withAccount = orgs.filter((o) => o.stripe_account_id)
console.log(`  seeded-only organisations read back : ${orgs.length}`)
console.log(`  holding a stripe_account_id         : ${withAccount.length}`)
console.log(`  holding NONE                        : ${orgs.length - withAccount.length}`)
for (const o of withAccount) {
  console.log(
    `    ${o.stripe_account_id}  charges=${o.stripe_charges_enabled} payouts=${o.stripe_payouts_enabled} ` +
      `onboarded=${o.stripe_onboarding_complete}  ${o.name}`,
  )
}
Object.assign(out, { seededOnlyOrgsRead: orgs.length, seededOnlyOrgsWithConnect: withAccount.length })

// ── 4. Live-mode or test-mode ───────────────────────────────────────────────
console.log('\n=== 4. Are those accounts live-mode or test-mode ===')
if (withAccount.length === 0) {
  console.log('  NOT APPLICABLE. No seeded-only organisation on production holds a Connect account,')
  console.log('  so there is no live-mode account to strand and the question closes here.')
  out.liveModeVerdict = 'not applicable, no seeded-only organisation holds a Connect account'
} else {
  /*
   * A `acct_` id does not carry its mode in the string, so it cannot be read off.
   * The only authority is Stripe itself: a live-mode key retrieves live-mode
   * accounts and returns resource_missing for test-mode ones, and vice versa.
   * That call needs a LIVE key, which is deliberately not in this worktree, so
   * this reports what it can prove and marks the rest UNRESOLVED rather than
   * guessing from the id.
   */
  const stripeKey = env.STRIPE_SECRET_KEY ?? ''
  const mode = stripeKey.startsWith('sk_live_') ? 'live' : stripeKey.startsWith('sk_test_') ? 'test' : 'none'
  console.log(`  key available in ${ENV_PATH}: ${mode}-mode`)
  if (mode === 'none') {
    console.log('  UNRESOLVED: no Stripe key available, so mode cannot be established from this shell.')
    out.liveModeVerdict = 'UNRESOLVED: no Stripe key available'
  } else {
    const results = []
    for (const o of withAccount) {
      const res = await fetch(`https://api.stripe.com/v1/accounts/${o.stripe_account_id}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      })
      const body = await res.json().catch(() => ({}))
      results.push({ id: o.stripe_account_id, status: res.status, code: body?.error?.code ?? null })
      console.log(`    ${o.stripe_account_id}  HTTP ${res.status}${body?.error?.code ? ` (${body.error.code})` : ''}`)
    }
    const found = results.filter((r) => r.status === 200).length
    console.log(
      `  ${found} of ${results.length} resolve under the ${mode}-mode key, so those are ${mode}-mode accounts.`,
    )
    console.log(
      `  The rest do not resolve under this key. That is NOT proof they are ${mode === 'live' ? 'test' : 'live'}-mode:`,
    )
    console.log('  a connected account also fails to resolve under a key belonging to a different platform account.')
    out.liveModeVerdict = `${found} of ${results.length} confirmed ${mode}-mode; remainder UNRESOLVED from this shell`
  }
}

// ── 5. Venues, for completeness ─────────────────────────────────────────────
console.log('\n=== 5. Venues ===')
const { count: venueTotal, error: venueErr } = await db.from('venues').select('id', { count: 'exact', head: true })
if (venueErr) console.log(`  venues query FAILED: ${venueErr.message}  (the count below is UNKNOWN, not zero)`)
const seededVenueIds = [...new Set((seedRows ?? []).map((e) => e.venue_id).filter(Boolean))]
console.log(`  venues on production: ${venueTotal ?? 0}`)
console.log(`  (venue ids are not selected above, so no venue-orphan claim is made here)`)
out.venuesTotal = venueTotal ?? 0
void seededVenueIds

// ── 6. WHEN THE MARKER SAYS ZERO, THE MARKER IS THE THING TO CHECK ──────────
/*
 * A count of zero from `is_seed_data = true` has TWO possible causes and they
 * demand opposite actions:
 *
 *   a. production genuinely carries no seeded rows, so the purge is unnecessary;
 *   b. production carries seeded rows that were never MARKED, so the purge is a
 *      no-op that reports success while the demo catalogue stays live.
 *
 * Reporting (a) without testing for (b) is the silent fail-open this project
 * keeps finding. The founder's own direct evidence, a live event page reading
 * "This organiser is still finishing their payment setup", is a claim about
 * production that a zero here cannot explain, so it is tested rather than
 * explained away.
 */
if ((seededEvents ?? 0) === 0 && (eventsTotal ?? 0) > 0) {
  console.log('\n=== 6. ZERO MARKED. What are the 48 then ===')
  const { data: allEvents, error: allEventsErr } = await db
    .from('events')
    .select('id, slug, title, status, organisation_id, created_at, start_date')
    .order('created_at', { ascending: true })
  const { data: allOrgs, error: allOrgsErr } = await db
    .from('organisations')
    .select('id, name, slug, stripe_account_id, stripe_account_country, stripe_charges_enabled, stripe_onboarding_complete, payout_status, created_at')
    .order('created_at', { ascending: true })
  /*
   * A SWALLOWED ERROR READS EXACTLY LIKE AN EMPTY TABLE, and the first run of
   * this section printed "organisations on production: 0" without checking. Zero
   * rows and a failed query are different facts with opposite consequences, so
   * the error is stated out loud before any count derived from it is believed.
   */
  if (allEventsErr) console.log(`  events query FAILED: ${allEventsErr.message}`)
  if (allOrgsErr) {
    console.log(`  organisations query FAILED: ${allOrgsErr.message}`)
    console.log('  Every organisation count below is therefore UNKNOWN, not zero.')
    out.orgsQueryError = allOrgsErr.message
  }

  const byOrg = new Map()
  for (const e of allEvents ?? []) {
    if (!byOrg.has(e.organisation_id)) byOrg.set(e.organisation_id, [])
    byOrg.get(e.organisation_id).push(e)
  }
  console.log(`  organisations on production: ${(allOrgs ?? []).length}`)
  for (const o of allOrgs ?? []) {
    const owned = byOrg.get(o.id) ?? []
    console.log(
      `    ${(o.name ?? '(no name)').slice(0, 34).padEnd(34)} events=${String(owned.length).padEnd(3)} ` +
        `connect=${o.stripe_account_id ? o.stripe_account_id : 'NONE'} country=${o.stripe_account_country ?? 'NULL'} charges=${o.stripe_charges_enabled} payout=${o.payout_status} ` +
        `onboarded=${o.stripe_onboarding_complete}`,
    )
  }
  const orphanEvents = (allEvents ?? []).filter((e) => !(allOrgs ?? []).some((o) => o.id === e.organisation_id))
  console.log(`  events whose organisation row is missing entirely: ${orphanEvents.length}`)
  console.log('\n  every event, oldest first:')
  for (const e of allEvents ?? []) {
    const org = (allOrgs ?? []).find((o) => o.id === e.organisation_id)
    console.log(
      `    ${String(e.status).padEnd(10)} ${String(e.slug).slice(0, 44).padEnd(44)} ` +
        `org=${(org?.name ?? 'MISSING').slice(0, 22).padEnd(22)} created=${String(e.created_at).slice(0, 10)}`,
    )
  }
  out.orgsOnProduction = (allOrgs ?? []).length
  out.orgsHoldingConnect = (allOrgs ?? []).filter((o) => o.stripe_account_id).length
  out.eventsWithMissingOrg = orphanEvents.length

  /*
   * THE MODE QUESTION, ASKED OF EVERY CONNECT ACCOUNT PRODUCTION ACTUALLY HOLDS,
   * not only the ones the marker called seeded. An `acct_` id does not encode its
   * mode, so the only authority is Stripe: a key retrieves the accounts of its own
   * platform, in its own mode, and returns resource_missing for everything else.
   *
   * A 200 under a TEST key is decisive and bad: it would mean the account taking
   * money on production is a test-mode account, which settles nothing. A 404 is
   * NOT the converse proof, because a live-mode account and an account belonging
   * to a different platform both 404 identically. So a 404 is reported as
   * UNRESOLVED rather than upgraded into "live".
   */
  const connected = (allOrgs ?? []).filter((o) => o.stripe_account_id)
  if (connected.length) {
    console.log('\n  --- mode of every Connect account on production ---')
    const key = env.STRIPE_SECRET_KEY ?? ''
    const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'none'
    console.log(`  key available in ${ENV_PATH}: ${mode}-mode`)
    for (const o of connected) {
      if (mode === 'none') {
        console.log(`    ${o.stripe_account_id}  UNRESOLVED (no Stripe key in this shell)`)
        continue
      }
      const res = await fetch(`https://api.stripe.com/v1/accounts/${o.stripe_account_id}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 200) {
        console.log(`    ${o.stripe_account_id}  HTTP 200 under the ${mode}-mode key: it IS a ${mode}-mode account.`)
        out.connectModeVerdict = `${o.stripe_account_id} is a ${mode}-mode account`
      } else {
        console.log(
          `    ${o.stripe_account_id}  HTTP ${res.status} (${body?.error?.code ?? 'no code'}) under the ${mode}-mode key.` +
            ` UNRESOLVED: not this platform, or not this mode. A ${mode === 'test' ? 'live' : 'test'}-mode key would be needed to say which.`,
        )
        out.connectModeVerdict = `${o.stripe_account_id} UNRESOLVED from this shell (only a ${mode}-mode key was available)`
      }
    }
  }
  out.markerVerdict =
    'is_seed_data is FALSE on every production row. Either production carries no seeded data, ' +
    'or it carries seeded data that was never marked. The listing above is the evidence for which.'
}

console.log('\n' + JSON.stringify(out, null, 2))
console.log('\nread-only probe complete. Nothing was written.')
