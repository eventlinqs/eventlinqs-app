/**
 * THREE LANE C EVENTS THAT MAKE THE WEEKEND RULE VISIBLE ON A SCREEN.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * The homepage rail "On this weekend" built its own Saturday-to-Sunday window
 * from `getUTCDay()` and `setUTCHours`, so on a platform whose readers are all
 * between UTC+8 and UTC+11 it ran from Saturday 10:00 to Monday 10:00 Melbourne
 * time. Both edges were wrong by the size of the offset.
 *
 * THE FIX IS PROVABLE IN A UNIT TEST AND INVISIBLE ON THE PAGE, because on the
 * day it was made the TEST catalogue held NOTHING on the current weekend: the
 * earliest future event was the following Tuesday. A rail with no events does
 * not render at all, so a screenshot of the homepage before and after the fix
 * would have been identical and would have proved nothing.
 *
 * These three events put the rule on the screen. Each one is chosen for what it
 * proves, and the two that matter are the two the old rule got WRONG:
 *
 *   DROPPED   Saturday 09:00 local, which is Friday 23:00 UTC. The old window
 *             began at Saturday 00:00 UTC, so it excluded a Saturday morning
 *             event from the weekend rail. Still listed all day, because
 *             `isStillListed` keeps an event until it has ended.
 *   TRUE      Saturday 20:00 local. Both rules agree. It is here so the rail has
 *             a member nobody can argue about.
 *   ADMITTED  Monday 09:00 local, which is Sunday 23:00 UTC. The old window ran
 *             to Monday 00:00 UTC, so it called a MONDAY MORNING event part of
 *             the weekend.
 *
 * After the fix the rail must show DROPPED and TRUE, and must NOT show ADMITTED.
 *
 * ============================================================================
 * WHAT IT WILL NOT DO
 * ============================================================================
 *
 *   - It refuses any project that is not TEST vkapkibzokmfaxqogypq, through the
 *     shared preflight first and then by name.
 *   - It ENUMERATES the organisation, creator, category and cover image from an
 *     existing lane C event rather than naming any of them, because the standing
 *     rule is that a slug, a route or an id is never guessed.
 *   - It never prints a key.
 *   - It is idempotent: fixed ids, upserted, and the three start times are
 *     recomputed from the CURRENT weekend on every run, so re-running next month
 *     moves them forward rather than leaving three stale rows behind.
 *   - It verifies by OBSERVING which of the three the shared rule selects, not
 *     by trusting its own writes.
 *
 * THEY HAVE A SHELF LIFE, and it is stated rather than discovered: once this
 * weekend has passed the three drop out of the listing window and the rail is
 * empty again. Re-run it.
 *
 * Run:
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/ops/seed-weekend-window-fixture.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { weekendWindowUtc, startOfLocalDayUtcOffset, localDayOfWeek, isStillListed, endOfLocalDayUtc } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

assertNotProduction()

const TAG = '[seed-weekend-window-fixture]'
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

async function read(query) {
  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, { headers })
  const body = await res.text()
  if (!res.ok) throw new Error(`read ${query.split('?')[0]} answered ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}
async function upsert(table, rows) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`upsert ${table} answered ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

/* ------------------------------------------------- enumerate, never guess */

const [template] = await read(
  'events?select=organisation_id,created_by,category_id,cover_image_url&status=eq.published&visibility=eq.public&slug=like.*lane-c*&cover_image_url=not.is.null&order=slug.asc&limit=1',
)
if (!template) {
  console.error(`${TAG} REFUSED: no lane-c published event with a cover image to take an organisation from. Nothing was written.`)
  process.exit(1)
}
console.log(`${TAG} template enumerated from an existing lane-c event: organisation ${template.organisation_id}`)

/* ------------------------------------ the three instants, from the shared rule */

const now = new Date()
const zone = PLATFORM_TIME_ZONE
const weekend = weekendWindowUtc(now, zone)
const day = localDayOfWeek(now, zone)
const toSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day

/** Local wall-clock `hour` on the day `offsetDays` from today, as a UTC instant. */
const atLocalHour = (offsetDays, hour) =>
  new Date(startOfLocalDayUtcOffset(now, zone, offsetDays).getTime() + hour * 3600000)

const SATURDAY_MORNING = atLocalHour(toSaturday, 9)
const SATURDAY_NIGHT = atLocalHour(toSaturday, 20)
const MONDAY_MORNING = atLocalHour(toSaturday + 2, 9)

const PLAN = [
  {
    id: 'c1a11ec0-dead-4bee-9111-000000000001',
    slug: 'lane-c-weekend-saturday-morning',
    title: 'Lane C weekend proof, Saturday morning',
    proves: 'DROPPED by the old UTC window (Saturday 09:00 local is Friday 23:00 UTC)',
    startsAt: SATURDAY_MORNING,
    shouldBeOnTheRail: true,
  },
  {
    id: 'c1a11ec0-dead-4bee-9111-000000000002',
    slug: 'lane-c-weekend-saturday-night',
    title: 'Lane C weekend proof, Saturday night',
    proves: 'a true weekend event both rules agree on',
    startsAt: SATURDAY_NIGHT,
    shouldBeOnTheRail: true,
  },
  {
    id: 'c1a11ec0-dead-4bee-9111-000000000003',
    slug: 'lane-c-weekend-monday-morning',
    title: 'Lane C weekend proof, Monday morning',
    proves: 'ADMITTED by the old UTC window (Monday 09:00 local is Sunday 23:00 UTC)',
    startsAt: MONDAY_MORNING,
    shouldBeOnTheRail: false,
  },
]

const local = d =>
  new Intl.DateTimeFormat('en-AU', {
    timeZone: zone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)

console.log(`${TAG} weekend window (shared rule): ${local(weekend.from)} to ${local(weekend.to)} ${zone}`)

await upsert(
  'events',
  PLAN.map(p => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: `A lane C fixture. Exists to prove the weekend rail reads the clock in the right zone: ${p.proves}.`,
    description:
      'A lane C fixture event for the weekend-window proof. It is not a real event and carries no tickets.',
    organisation_id: template.organisation_id,
    created_by: template.created_by,
    category_id: template.category_id,
    cover_image_url: template.cover_image_url,
    thumbnail_url: template.cover_image_url,
    start_date: p.startsAt.toISOString(),
    /*
     * EACH FIXTURE ENDS AT THE LAST INSTANT OF ITS OWN LOCAL DAY, and both the
     * shape and the reason took two attempts to get right.
     *
     * The first version gave each event a three-hour end_date, which read as
     * realistic and broke the proof: by the time the drive ran, the Saturday
     * 09:00 event had ENDED, `isStillListed` correctly dropped it, and the rail
     * showed one event where two were expected. The drive caught it, and the
     * verification at the bottom of this file now asks the listing window as
     * well as the weekend window so it cannot happen again silently.
     *
     * The obvious second attempt was `end_date: null`, which is what the
     * founder's rule of 16 August 2026 describes: an event with no end_date
     * stays listed until the end of its calendar day in its OWN zone, so "a
     * 09:00 event stays listed all day and drops overnight". The database
     * refused it with a 23502: `events.end_date` is NOT NULL, so that branch of
     * `listingUntil` is reachable only by rows older than the constraint.
     *
     * So the rule is written out instead of relied on. `endOfLocalDayUtc` is the
     * same function `listingUntil` uses for the null case, which makes this the
     * founder's rule stated explicitly rather than a second opinion about it.
     */
    end_date: new Date(endOfLocalDayUtc(p.startsAt, zone).getTime() - 1000).toISOString(),
    timezone: zone,
    event_type: 'in_person',
    venue_name: 'The Wool Exchange',
    venue_city: 'Geelong',
    venue_state: 'VIC',
    venue_country: 'Australia',
    status: 'published',
    visibility: 'public',
    published_at: new Date().toISOString(),
    is_age_restricted: false,
    is_free: true,
    is_seed_data: true,
  })),
)

/* ----------------------------------------------------- verify by observing */

const written = await read(
  `events?select=slug,start_date,end_date,timezone&id=in.(${PLAN.map(p => p.id).join(',')})&order=start_date.asc`,
)
if (written.length !== PLAN.length) {
  console.error(`${TAG} FAIL: wrote ${PLAN.length} row(s) and can read back ${written.length}.`)
  process.exit(1)
}

/*
 * TWO QUESTIONS, NOT ONE, AND THE SECOND ONE IS THE ONE THIS SCRIPT GOT WRONG.
 *
 * The first version asked only "is this instant inside the weekend window" and
 * reported OK on three fixtures, one of which had already ENDED and could
 * therefore never appear on any rail. The drive found it. A fixture that cannot
 * be seen is not a fixture, so the listing window is asked as well, using the
 * platform's own `isStillListed` rather than a second opinion about it.
 */
let wrong = 0
for (const p of PLAN) {
  const row = written.find(r => r.slug === p.slug)
  const t = Date.parse(row.start_date)
  const inWindow = t >= weekend.from.getTime() && t <= weekend.to.getTime()
  const listed = isStillListed(row, now)
  const onRail = inWindow && listed
  const ok = onRail === p.shouldBeOnTheRail
  if (!ok) wrong += 1
  console.log(
    `${TAG}   ${local(new Date(row.start_date))}  in window: ${String(inWindow).padEnd(5)}  ` +
      `still listed: ${String(listed).padEnd(5)}  on the rail: ${String(onRail).padEnd(5)}  ` +
      `${ok ? 'as intended' : 'NOT AS INTENDED'}  (${p.proves})`,
  )
}

if (wrong > 0) {
  console.error(
    `${TAG} FAIL: ${wrong} of ${PLAN.length} fixture(s) are not where they were built to be. ` +
      `A fixture inside the weekend window that has already ENDED is invisible on every rail, ` +
      `which is a broken fixture and not a broken platform.`,
  )
  process.exit(1)
}
console.log(`${TAG} OK: ${PLAN.length} fixture(s) written; the weekend rule and the listing window agree on all three.`)
