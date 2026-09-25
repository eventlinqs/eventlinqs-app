/**
 * THREE LANE C ROWS WHOSE NAMES CARRY A COMMA, SO THE ADMIN SEARCH BOXES CAN BE
 * DRIVEN AGAINST THE DEFECT THEY HAD.
 *
 * ============================================================================
 * WHY A FIXTURE AT ALL
 * ============================================================================
 *
 * Inside a PostgREST `or(...)` the characters `,` `.` `(` `)` are GRAMMAR. Four
 * admin reads built their filter by dropping the typed term into a template
 * literal, so a search for a name with a comma in it was parsed as MORE CLAUSES.
 * Measured against TEST before anything was changed:
 *
 *     .or(`title.ilike.%Night, Geelong%,slug.ilike.%Night, Geelong%`)
 *       -> PGRST100 failed to parse logic tree
 *
 * `listEvents`, `listOrganisations` and `listProfiles` all end
 * `if (error) throw error`, so the operator got a crashed screen. The topbar
 * search reads `res.data ?? []`, so it silently reported nothing found.
 *
 * TEST already holds events titled "... Night, Geelong", which is this
 * platform's own naming rather than an edge case. It holds NO organisation and
 * NO person whose name carries one, so the organiser screen and the user screen
 * could not be driven against the defect at all. These three rows fix that, and
 * they are lane C's by name so no other lane can mistake them for theirs.
 *
 * ============================================================================
 * WHAT IT WILL NOT DO
 * ============================================================================
 *
 *   - It refuses any project that is not TEST vkapkibzokmfaxqogypq, through the
 *     shared preflight first and then by name.
 *   - IT PUBLISHES NOTHING. The organisation is written `pending` and the event
 *     `draft` + `unlisted`, which is the rule
 *     scripts/guards/fixtures-are-not-published.mjs was written for after a lane
 *     B fixture put two soon-to-vanish URLs in the shared sitemap and refused
 *     lane A's gate. Three lanes share one TEST database and the sitemap holds
 *     its snapshot for 300 seconds. Both screens under drive list every status,
 *     so publishing would buy nothing and cost somebody else a gate run.
 *   - It ENUMERATES the creator and category from an existing event rather than
 *     naming an id.
 *   - It never prints a key or a password.
 *   - It is idempotent: fixed ids, upserted, and the auth user is looked up by
 *     its fixed address before being created.
 *   - It verifies by READING THE ROWS BACK through the same grammar the product
 *     uses, never by trusting its own writes.
 *
 * Run:
 *   node --env-file=.env.local scripts/ops/seed-admin-search-comma-fixture.mjs
 *   node --env-file=.env.local scripts/ops/seed-admin-search-comma-fixture.mjs --remove
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const TAG = '[seed-admin-search-comma-fixture]'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const PROD_REF = 'gndnldyfudbytbboxesk'

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!URL_BASE || !KEY) {
  console.error(`${TAG} REFUSED: no NEXT_PUBLIC_SUPABASE_URL or no SUPABASE_SERVICE_ROLE_KEY.`)
  process.exit(2)
}
if (URL_BASE.includes(PROD_REF)) {
  console.error(`${TAG} REFUSED: that is PRODUCTION (${PROD_REF}).`)
  process.exit(2)
}
if (!URL_BASE.includes(TEST_REF)) {
  console.error(`${TAG} REFUSED: the project is not TEST ${TEST_REF}. Nothing was written.`)
  process.exit(2)
}

const headers = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}
async function read(query) {
  const r = await rest(`/rest/v1/${query}`)
  if (!r.ok) throw new Error(`read ${query.split('?')[0]} answered ${r.status}: ${r.body.slice(0, 300)}`)
  return JSON.parse(r.body)
}
async function upsert(table, rows) {
  const r = await rest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error(`upsert ${table} answered ${r.status}: ${r.body.slice(0, 400)}`)
  return JSON.parse(r.body)
}

/* ------------------------------------------------------------------ the rows */

export const OWNER_EMAIL = 'lane-c-orfilter-owner@eventlinqs.test'
export const PERSON_NAME = 'Lane-C Smith, John'
export const ORG_ID = 'c0aac0aa-0000-4c00-8c00-000000000001'
export const ORG_NAME = 'Lane C Rock, Paper'
export const ORG_SLUG = 'lane-c-orfilter-rock-paper'
export const EVENT_ID = 'c0aac0aa-0000-4c00-8c00-000000000002'
export const EVENT_TITLE = 'Lane C Launch Night, Geelong'
export const EVENT_SLUG = 'lane-c-orfilter-launch-night-geelong'

const remove = process.argv.includes('--remove')

/** The auth user, found by its fixed address before anything is created. */
async function findAuthUser() {
  const r = await rest(`/auth/v1/admin/users?per_page=200&page=1`)
  if (!r.ok) throw new Error(`list auth users answered ${r.status}: ${r.body.slice(0, 300)}`)
  const users = JSON.parse(r.body).users ?? []
  return users.find(u => u.email === OWNER_EMAIL) ?? null
}

if (remove) {
  await rest(`/rest/v1/events?id=eq.${EVENT_ID}`, { method: 'DELETE' })
  await rest(`/rest/v1/organisations?id=eq.${ORG_ID}`, { method: 'DELETE' })
  const existing = await findAuthUser()
  if (existing) {
    await rest(`/rest/v1/profiles?id=eq.${existing.id}`, { method: 'DELETE' })
    await rest(`/auth/v1/admin/users/${existing.id}`, { method: 'DELETE' })
  }
  const left = await read(`organisations?select=id&id=eq.${ORG_ID}`)
  const leftEvent = await read(`events?select=id&id=eq.${EVENT_ID}`)
  if (left.length > 0 || leftEvent.length > 0) {
    console.error(`${TAG} REMOVAL INCOMPLETE: organisation ${left.length}, event ${leftEvent.length} still present.`)
    process.exit(1)
  }
  console.log(`${TAG} removed: the event, the organisation, the profile and the auth user.`)
  process.exit(0)
}

/* ----------------------------------------------- enumerate, never name an id */

const pool = await read(
  'events?select=organisation_id,created_by,category_id,timezone&status=eq.published&order=created_at.desc&limit=1',
)
const template = pool[0]
if (!template) {
  console.error(`${TAG} REFUSED: no published event to take a creator and a category from.`)
  process.exit(1)
}

/* ----------------------------------------------------------------- the writes */

let user = await findAuthUser()
if (!user) {
  const created = await rest('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: OWNER_EMAIL,
      // Never printed, never stored anywhere but auth. This account is never
      // signed in to: it exists so a profile row and an organisation owner can.
      password: `${crypto.randomUUID()}Aa1`,
      email_confirm: true,
    }),
  })
  if (!created.ok) throw new Error(`create auth user answered ${created.status}: ${created.body.slice(0, 300)}`)
  user = JSON.parse(created.body)
}

await upsert('profiles', [
  {
    id: user.id,
    email: OWNER_EMAIL,
    full_name: PERSON_NAME,
    display_name: PERSON_NAME,
    role: 'organiser',
    is_verified: false,
  },
])

await upsert('organisations', [
  {
    id: ORG_ID,
    name: ORG_NAME,
    slug: ORG_SLUG,
    email: OWNER_EMAIL,
    owner_id: user.id,
    // NOT 'active'. See the header: an active organisation enters the shared
    // sitemap and another lane's gate reads it after this row has gone.
    status: 'pending',
  },
])

const startsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000)
await upsert('events', [
  {
    id: EVENT_ID,
    slug: EVENT_SLUG,
    title: EVENT_TITLE,
    summary:
      'A lane C fixture whose title carries a comma, so the admin event search can be driven against the PostgREST grammar defect.',
    description:
      'A lane C fixture event. It is not a real event, it carries no tickets, and it is deliberately left as a draft.',
    organisation_id: ORG_ID,
    created_by: template.created_by,
    category_id: template.category_id,
    start_date: startsAt.toISOString(),
    end_date: new Date(startsAt.getTime() + 3 * 3600 * 1000).toISOString(),
    timezone: template.timezone ?? 'Australia/Melbourne',
    venue_name: 'The Wool Exchange',
    venue_city: 'Geelong',
    venue_state: 'VIC',
    // NOT published and NOT public, for the same reason as the organisation.
    status: 'draft',
    visibility: 'unlisted',
  },
])

/* ------------------------------------------- verify by reading, never by trust */

const DQ = String.fromCharCode(34)
/*
 * THE VALUE IS QUOTED FOR THE POSTGREST GRAMMAR AND THEN PERCENT-ENCODED FOR
 * THE URL, and the second half is not optional. The first version of this read
 * put `%Night, Geelong%` into the query string raw and the request answered 500
 * from an HTML error page rather than from PostgREST: a bare `%` in a URL is the
 * start of an escape sequence, so `%Ni` is a malformed one and the edge rejects
 * the request before the database is ever asked. A wildcard search is exactly
 * the shape that trips it.
 */
const BS = String.fromCharCode(92)
const orFilter = (column, value) => {
  // split/join rather than a regex literal, so this file carries no backslash
  // of its own and cannot be mis-edited into a different escape.
  const quoted = DQ + value.split(BS).join(BS + BS).split(DQ).join(BS + DQ) + DQ
  return encodeURIComponent(`(${column}.ilike.${quoted})`)
}

const found = {
  event: await read(`events?select=id,title&or=${orFilter('title', '%Night, Geelong%')}`),
  organisation: await read(`organisations?select=id,name&or=${orFilter('name', '%Rock, Paper%')}`),
  profile: await read(`profiles?select=id,full_name&or=${orFilter('full_name', '%Smith, John%')}`),
}

let bad = 0
for (const [what, rows] of Object.entries(found)) {
  const mine = rows.length
  if (mine === 0) {
    console.error(`${TAG} FAIL: no ${what} answers the comma search that this fixture exists to make answerable.`)
    bad += 1
  } else {
    console.log(`${TAG} ok  ${what}: ${mine} row(s) answer the comma search`)
  }
}
if (bad > 0) process.exit(1)

console.log(`${TAG} seeded. Remove with --remove.`)
