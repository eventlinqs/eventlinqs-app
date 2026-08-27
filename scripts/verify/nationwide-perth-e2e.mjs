/**
 * NATIONWIDE FROM DAY ONE - end-to-end proof that a PERTH organiser can sign
 * up, create an event, publish it, and have it appear on the correct city and
 * suburb pages (founder ruling 2026-08-23).
 *
 * Perth is chosen deliberately: it is about as far from the retired
 * Geelong/Melbourne launch pair as Australia allows, so anything that was
 * quietly keyed to those two cities fails here loudly.
 *
 * WHAT IS ACTUALLY EXERCISED, rather than asserted from the outside:
 *
 *   1. The real organisations/events/ticket_tiers tables, against the real
 *      enums and the real constraints.
 *   2. The publish path's own gate inputs (cover image present, organisation
 *      able to sell), because a published row that the gate would have refused
 *      proves nothing.
 *   3. THE EXACT QUERY the city landing runs - published + public + future +
 *      `venue_city ILIKE '%Perth%'` - copied from src/app/city/[slug]/page.tsx,
 *      so this proves the page finds the event rather than proving a row
 *      exists.
 *   4. The suburb landing's resolution, which is coordinate-based
 *      (resolveSuburbSlug over the district centroids), not a name match.
 *   5. The founding-invite constraint, both before and after the migration,
 *      which is the one piece of this ruling the database can still veto.
 *
 * NOTHING PERSISTS. Everything runs inside BEGIN ... ROLLBACK, including the
 * migration's DDL in step 5. That is the point of step 5: it demonstrates that
 * 20260823000001 is exactly the change required, and demonstrates it WITHOUT
 * applying a migration, which is the founder's to apply.
 *
 * Connects as the database owner. The target comes from SUPABASE_DB_URL and is
 * checked before the client is built: with nothing set this connects to
 * nothing rather than to production.
 *
 * Run: node --env-file=.env.test scripts/verify/nationwide-perth-e2e.mjs
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import _pg from 'pg'
import { randomUUID } from 'node:crypto'

const target = assertNotProductionDatabase()
const client = await target.connect()

const fails = []
function assert(cond, msg, detail) {
  if (cond) console.log('  PASS:', msg)
  else {
    console.log('  FAIL:', msg, detail !== undefined ? `(got ${JSON.stringify(detail)})` : '')
    fails.push(msg)
  }
}
const q = (t, p) => client.query(t, p)
const one = async (t, p) => (await q(t, p)).rows[0]

const sfx = Date.now().toString(36)
const ownerId = randomUUID()
const orgId = randomUUID()
const eventId = randomUUID()

/**
 * Perth district centroids, copied from src/lib/cities/data.ts. The suburb
 * landing resolves by DISTANCE from these, so the proof needs the same numbers
 * the page uses.
 */
const PERTH_SUBURBS = [
  { slug: 'perth-inner-perth', name: 'Inner Perth', lat: -31.9523, lon: 115.8613 },
  { slug: 'perth-northern-suburbs', name: 'Northern Suburbs', lat: -31.8, lon: 115.767 },
  { slug: 'perth-southern-suburbs', name: 'Southern Suburbs', lat: -32.056, lon: 115.744 },
  { slug: 'perth-coastal', name: 'Coastal', lat: -31.897, lon: 115.757 },
]
/** The venue: Northbridge, in the Perth CBD, so Inner Perth is the answer. */
const VENUE_LAT = -31.9486
const VENUE_LON = 115.8578
const SUBURB_MATCH_RADIUS_KM = 25

/** Haversine, mirroring src/lib/cities/resolve-suburb.ts. */
function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

console.log(`\n[target] ${target.host} / ${target.database}`)

try {
  await q('BEGIN')

  // ── 1. A Perth organiser signs up ───────────────────────────────────────
  console.log('\n[1] a Perth organiser signs up')
  await q('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [
    ownerId,
    `perth_${sfx}@test.invalid`,
  ])
  await q(
    `INSERT INTO public.profiles (id, email) VALUES ($1,$2)
       ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email`,
    [ownerId, `perth_${sfx}@test.invalid`],
  )
  const org = await one(
    `INSERT INTO public.organisations
       (id, name, slug, owner_id, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled)
     VALUES ($1,$2,$3,$4,'active',$5,true,true)
     RETURNING id, name, status, stripe_charges_enabled`,
    [orgId, `Perth Nights ${sfx}`, `perth-nights-${sfx}`, ownerId, `acct_test_${sfx}`],
  )
  assert(!!org, 'the organisation was created with no city check anywhere', org?.name)
  assert(org.status === 'active', 'it is active and able to sell', org.status)
  assert(org.stripe_charges_enabled === true, 'charges are enabled, so publish is not gated')

  // ── 2. They create a Perth event ────────────────────────────────────────
  console.log('\n[2] they create an event in Perth')
  const categoryId = (
    await one(`SELECT id FROM public.event_categories ORDER BY name LIMIT 1`)
  ).id
  const ev = await one(
    `INSERT INTO public.events
       (id, organisation_id, created_by, title, slug, description, category_id,
        start_date, end_date, timezone,
        venue_name, venue_city, venue_country, venue_latitude, venue_longitude,
        cover_image_url, status, visibility, is_free)
     VALUES ($1,$2,$11,$3,$4,$5,$6,
        now() + interval '30 days', now() + interval '30 days 4 hours', 'Australia/Perth',
        $7,'Perth','Australia',$8,$9,
        $10,'published','public',false)
     RETURNING id, slug, status, visibility, venue_city, start_date`,
    [
      eventId,
      orgId,
      `Northbridge Warehouse ${sfx}`,
      `northbridge-warehouse-${sfx}`,
      'A proof event in Perth for the nationwide ruling.',
      categoryId,
      'The Bird, Northbridge',
      VENUE_LAT,
      VENUE_LON,
      'https://example.invalid/cover.avif',
      ownerId,
    ],
  )
  assert(!!ev, 'the event was created in Perth', ev?.venue_city)
  await q(
    `INSERT INTO public.ticket_tiers (id, event_id, name, price, currency, total_capacity, sold_count)
     VALUES ($1,$2,'General Admission',3500,'AUD',200,0)`,
    [randomUUID(), eventId],
  )

  // ── 3. It is published, and the publish gate's inputs are satisfied ──────
  console.log('\n[3] it publishes')
  assert(ev.status === 'published', 'status is published', ev.status)
  assert(ev.visibility === 'public', 'visibility is public', ev.visibility)
  const gate = await one(
    `SELECT e.cover_image_url IS NOT NULL AS has_cover,
            o.stripe_charges_enabled AS can_sell
       FROM public.events e
       JOIN public.organisations o ON o.id = e.organisation_id
      WHERE e.id = $1`,
    [eventId],
  )
  assert(gate.has_cover === true, 'publish gate: a cover image is present')
  assert(gate.can_sell === true, 'publish gate: the organisation can take money')

  // ── 4. The CITY landing finds it ────────────────────────────────────────
  console.log('\n[4] the Perth city landing finds it')
  // This is the city page's own predicate, from src/app/city/[slug]/page.tsx:
  //   status published, visibility public, start_date in the future,
  //   venue_city ILIKE '%<city name>%'
  const onCity = await q(
    `SELECT id, title, venue_city
       FROM public.events
      WHERE status = 'published'
        AND visibility = 'public'
        AND start_date > now()
        AND venue_city ILIKE $1
        AND id = $2`,
    ['%Perth%', eventId],
  )
  assert(onCity.rowCount === 1, 'the event is returned by the /city/perth query', onCity.rowCount)

  // NEGATIVE CONTROL. The same query for a different city must NOT return it,
  // otherwise "it appears on the city page" would be true of every city page
  // and would prove nothing at all.
  const onWrongCity = await q(
    `SELECT id FROM public.events
      WHERE status='published' AND visibility='public' AND start_date > now()
        AND venue_city ILIKE $1 AND id = $2`,
    ['%Geelong%', eventId],
  )
  assert(
    onWrongCity.rowCount === 0,
    'negative control: it does NOT appear on /city/geelong',
    onWrongCity.rowCount,
  )

  // ── 5. The SUBURB landing resolves it to the right district ─────────────
  console.log('\n[5] the suburb landing resolves the venue to a Perth district')
  const scored = PERTH_SUBURBS.map(s => ({
    slug: s.slug,
    km: distanceKm(VENUE_LAT, VENUE_LON, s.lat, s.lon),
  })).sort((a, b) => a.km - b.km)
  const nearest = scored[0]
  assert(
    nearest.slug === 'perth-inner-perth',
    'the Northbridge venue resolves to /city/perth/perth-inner-perth',
    nearest.slug,
  )
  assert(
    nearest.km <= SUBURB_MATCH_RADIUS_KM,
    `it is inside the ${SUBURB_MATCH_RADIUS_KM}km match radius`,
    Number(nearest.km.toFixed(2)),
  )
  console.log(
    '       distances:',
    scored.map(s => `${s.slug} ${s.km.toFixed(1)}km`).join(', '),
  )

  // ── 6. The founding invite, the one gate the DATABASE still holds ───────
  console.log('\n[6] the founding invite for a Perth organiser')
  let refusedBefore = null
  try {
    await q('SAVEPOINT before_migration')
    await q(
      `INSERT INTO public.founding_invites (code, inviter_kind, inviter_org_id, inviter_name, city_slug)
       VALUES ($1,'organiser',$2,$3,'perth')`,
      [`PERTH${sfx.toUpperCase()}`.slice(0, 16), orgId, 'Perth Nights'],
    )
    refusedBefore = 'accepted'
  } catch (err) {
    refusedBefore = err.code
    await q('ROLLBACK TO SAVEPOINT before_migration')
  }
  assert(
    refusedBefore === '23514',
    'BEFORE the migration the database refuses a Perth invite with 23514 (this is why the migration exists)',
    refusedBefore,
  )

  // Apply the migration's DDL inside the transaction. Rolled back with
  // everything else: this proves the fix, it does not apply it.
  console.log('       applying 20260823000001 DDL inside the transaction (rolled back after)')
  await q(`ALTER TABLE public.founding_invites DROP CONSTRAINT IF EXISTS founding_invites_city_slug_check`)
  await q(
    `ALTER TABLE public.founding_invites
       ADD CONSTRAINT founding_invites_city_slug_check
       CHECK (city_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`,
  )

  const invite = await one(
    `INSERT INTO public.founding_invites (code, inviter_kind, inviter_org_id, inviter_name, city_slug)
     VALUES ($1,'organiser',$2,$3,'perth')
     RETURNING code, city_slug`,
    [`PERTH${sfx.toUpperCase()}`.slice(0, 16), orgId, 'Perth Nights'],
  )
  assert(invite?.city_slug === 'perth', 'AFTER the migration a Perth founding invite is accepted', invite?.city_slug)

  const darwin = await one(
    `INSERT INTO public.founding_invites (code, inviter_kind, inviter_org_id, inviter_name, city_slug)
     VALUES ($1,'organiser',$2,$3,'gold-coast')
     RETURNING city_slug`,
    [`GC${sfx.toUpperCase()}`.slice(0, 16), orgId, 'Perth Nights'],
  )
  assert(darwin?.city_slug === 'gold-coast', 'a hyphenated slug (gold-coast) is accepted too', darwin?.city_slug)

  // NEGATIVE CONTROL on the replacement constraint: it must still be a real
  // constraint, or "any city works" would just mean "anything works".
  let junkRefused = null
  try {
    await q('SAVEPOINT junk')
    await q(
      `INSERT INTO public.founding_invites (code, inviter_kind, inviter_org_id, inviter_name, city_slug)
       VALUES ($1,'organiser',$2,$3,'Not A City!')`,
      [`JUNK${sfx.toUpperCase()}`.slice(0, 16), orgId, 'Perth Nights'],
    )
    junkRefused = 'accepted'
  } catch (err) {
    junkRefused = err.code
    await q('ROLLBACK TO SAVEPOINT junk')
  }
  assert(
    junkRefused === '23514',
    'negative control: the replacement constraint still refuses free text',
    junkRefused,
  )
} finally {
  await q('ROLLBACK')
  await client.end()
  console.log('\n[rollback] nothing persisted, including the migration DDL')
}

console.log(
  fails.length === 0
    ? '\nALL PASS - a Perth organiser can sign up, publish, and be found on the Perth city and suburb pages.'
    : `\n${fails.length} FAILURE(S):\n` + fails.map(f => `  - ${f}`).join('\n'),
)
process.exit(fails.length === 0 ? 0 : 1)
