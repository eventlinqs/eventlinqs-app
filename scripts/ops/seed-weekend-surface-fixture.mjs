/**
 * SIX LANE C EVENTS THAT MAKE /this-weekend JUDGEABLE ON A SCREEN.
 *
 * ============================================================================
 * WHY A SECOND WEEKEND FIXTURE
 * ============================================================================
 *
 * `seed-weekend-window-fixture.mjs` seeds three events for the homepage RAIL,
 * and every one of them is in Geelong on a Saturday. That is exactly right for
 * what it proves and it cannot prove any of this:
 *
 *   - that the page splits the weekend into DAYS, which needs a Sunday;
 *   - that a card is filed under the day it happens in its OWN zone, which needs
 *     an event in Perth late on a Saturday night;
 *   - that a FINISHED event has left, which needs one that has finished;
 *   - that the "where the weekend is on" strip is built from the events
 *     present, which needs more than one city.
 *
 * WHAT EACH ROW IS FOR, and none of them is filler:
 *
 *   ENDED      Saturday 08:00 to 10:00 local. It is over. `/this-weekend` must
 *              NOT show it, and neither must `/events?preset=weekend`, which
 *              until this item DID: the preset replaced the listing window
 *              instead of narrowing it, so the homepage rail dropped finished
 *              events and its own "View all" did not.
 *   SATURDAY x2 Geelong and Melbourne, evening. Two cities, one day.
 *   SUNDAY   x2 Sydney and Brisbane. The second day group.
 *   PERTH      Saturday 22:30 AWST, which is SUNDAY 00:30 in Sydney. The
 *              platform-zone window admits it and its own card reads Saturday,
 *              so it must appear under the SATURDAY heading. A heading computed
 *              in the platform zone would file it under Sunday, beside a card
 *              that says Saturday.
 *
 * ============================================================================
 * WHAT IT WILL NOT DO
 * ============================================================================
 *
 *   - It refuses any project that is not TEST vkapkibzokmfaxqogypq, through the
 *     shared preflight first and then by name.
 *   - It ENUMERATES the organisation, creator, category and six DISTINCT cover
 *     images from existing published events rather than naming any of them. Six
 *     distinct covers rather than one repeated, because a grid of one photograph
 *     six times is not a screenshot anybody can judge a layout from.
 *   - It never prints a key.
 *   - It is idempotent: fixed ids, upserted, and every instant is recomputed
 *     from the CURRENT weekend on every run.
 *   - It verifies by OBSERVING what the shared rules say about the rows it wrote,
 *     never by trusting its own writes, and it FAILS if a row is not where it was
 *     built to be.
 *
 * THEY HAVE A SHELF LIFE, stated rather than discovered: once this weekend has
 * passed the six drop out of the listing window and the page is empty again,
 * which is the page working correctly. Re-run it.
 *
 * Run:
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/ops/seed-weekend-surface-fixture.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import {
  weekendWindowUtc,
  startOfLocalDayUtcOffset,
  localDayOfWeek,
  isStillListed,
} from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { groupWeekendByDay } from '@/lib/events/weekend-days'

assertNotProduction()

const TAG = '[seed-weekend-surface-fixture]'
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

const pool = await read(
  'events?select=slug,organisation_id,created_by,category_id,cover_image_url' +
    '&status=eq.published&visibility=eq.public&cover_image_url=not.is.null&order=slug.asc&limit=200',
)
const template = pool[0]
if (!template) {
  console.error(`${TAG} REFUSED: no published event with a cover image to take an organisation from.`)
  process.exit(1)
}
/*
 * PHOTOGRAPHS, NOT POSTERS, AND THE FIRST RUN OF THIS SCRIPT PROVED WHY.
 *
 * The first version took the first six DISTINCT covers off the catalogue. Three
 * of them turned out to be portrait poster artwork with ANOTHER event's name and
 * date rendered into the pixels, so the grid showed "Northside Sound Launch
 * lane-c 0064572, Sunday 4 October" in the artwork above a card reading "Lane C
 * weekend surface, Saturday evening in Geelong, Sat 19 Sept". The screenshot was
 * unreadable as a judgement of the page, which is the only thing a fixture is
 * for. They were also 430x537 portrait inside a 16:9 media box, so the card
 * cropped them hard on top of everything else.
 *
 * `images.pexels.com` covers are unambiguously photographs of a room full of
 * people, and they are landscape, which is the shape the card is. The catalogue
 * holds fourteen distinct ones.
 */
const covers = []
const seen = new Set()
for (const row of pool) {
  if (!/(^|\.)pexels\.com$/.test(new URL(row.cover_image_url).host)) continue
  if (seen.has(row.cover_image_url)) continue
  seen.add(row.cover_image_url)
  covers.push(row.cover_image_url)
}
if (covers.length < 6) {
  console.error(
    `${TAG} REFUSED: only ${covers.length} distinct photographic cover(s) to draw on, 6 are needed. ` +
      `A poster carrying another event's name is not a fixture anybody can judge a layout from.`,
  )
  process.exit(1)
}

/*
 * AND EVERY ONE OF THEM IS FETCHED BEFORE IT IS WRITTEN. A blank tile in a
 * screenshot is either a broken image or a harness that captured too early, and
 * those are opposite problems with opposite fixes. Verifying here removes one of
 * the two answers before the question can be asked.
 */
for (const url of covers.slice(0, 6)) {
  const res = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' } })
  if (!res.ok) {
    console.error(`${TAG} REFUSED: a chosen cover answered ${res.status}. Nothing was written.`)
    process.exit(1)
  }
}
console.log(
  `${TAG} enumerated from ${pool.length} published event(s): organisation ${template.organisation_id}, ` +
    `${covers.length} distinct photographic cover(s) available, each fetched`,
)

/* ------------------------------------- the instants, from the shared rule */

const now = new Date()
const zone = PLATFORM_TIME_ZONE
const weekend = weekendWindowUtc(now, zone)
const day = localDayOfWeek(now, zone)
const toSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day

/** Local wall clock `hour`:`minute` on the day `offsetDays` from today, as UTC. */
const at = (offsetDays, hour, minute = 0) =>
  new Date(startOfLocalDayUtcOffset(now, zone, offsetDays).getTime() + (hour * 60 + minute) * 60000)

/**
 * The Perth row is built from PERTH's clock, not the platform's, which is the
 * whole point of it. Perth is UTC+8 year round, so Saturday 22:30 there is
 * 14:30 UTC, which is Sunday 00:30 in Sydney.
 */
const perthSaturdayLate = new Date(at(toSaturday, 0).getTime() + (22 * 60 + 30 + 120) * 60000)

const PLAN = [
  {
    id: 'c1a11ec0-dead-4bee-9222-000000000001',
    slug: 'lane-c-weekend-surface-ended',
    title: 'Lane C weekend surface, the morning that has been and gone',
    proves: 'a FINISHED weekend event must not be listed by the preset either',
    startsAt: at(toSaturday, 8),
    endsAt: at(toSaturday, 10),
    city: 'Geelong',
    state: 'VIC',
    venue: 'The Wool Exchange',
    timezone: zone,
    onThePage: false,
  },
  {
    id: 'c1a11ec0-dead-4bee-9222-000000000002',
    slug: 'lane-c-weekend-surface-sat-geelong',
    title: 'Lane C weekend surface, Saturday evening in Geelong',
    proves: 'the Saturday group',
    startsAt: at(toSaturday, 18),
    endsAt: at(toSaturday, 23),
    city: 'Geelong',
    state: 'VIC',
    venue: 'The Wool Exchange',
    timezone: zone,
    onThePage: true,
  },
  {
    id: 'c1a11ec0-dead-4bee-9222-000000000003',
    slug: 'lane-c-weekend-surface-sat-melbourne',
    title: 'Lane C weekend surface, Saturday night in Melbourne',
    proves: 'a second city on the same day, for the city strip',
    startsAt: at(toSaturday, 21),
    endsAt: at(toSaturday + 1, 2),
    city: 'Melbourne',
    state: 'VIC',
    venue: 'Brunswick Ballroom',
    timezone: zone,
    onThePage: true,
  },
  {
    id: 'c1a11ec0-dead-4bee-9222-000000000004',
    slug: 'lane-c-weekend-surface-sun-sydney',
    title: 'Lane C weekend surface, Sunday morning in Sydney',
    proves: 'the Sunday group exists at all',
    startsAt: at(toSaturday + 1, 10),
    endsAt: at(toSaturday + 1, 14),
    city: 'Sydney',
    state: 'NSW',
    venue: 'The Corner Hotel',
    timezone: zone,
    onThePage: true,
  },
  {
    id: 'c1a11ec0-dead-4bee-9222-000000000005',
    slug: 'lane-c-weekend-surface-sun-brisbane',
    title: 'Lane C weekend surface, Sunday afternoon in Brisbane',
    proves: 'a fourth city, and a second Sunday card',
    startsAt: at(toSaturday + 1, 15),
    endsAt: at(toSaturday + 1, 19),
    city: 'Brisbane',
    state: 'QLD',
    venue: 'The Tivoli',
    timezone: 'Australia/Brisbane',
    onThePage: true,
  },
  {
    id: 'c1a11ec0-dead-4bee-9222-000000000006',
    slug: 'lane-c-weekend-surface-perth-late-saturday',
    title: 'Lane C weekend surface, late Saturday in Perth',
    proves: 'Saturday 22:30 in Perth is Sunday in Sydney, and the card says Saturday',
    startsAt: perthSaturdayLate,
    endsAt: new Date(perthSaturdayLate.getTime() + 3 * 3600000),
    city: 'Perth',
    state: 'WA',
    venue: 'The Rechabite',
    timezone: 'Australia/Perth',
    onThePage: true,
  },
]

const local = (d, z = zone) =>
  new Intl.DateTimeFormat('en-AU', {
    timeZone: z,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)

console.log(`${TAG} weekend window (shared rule): ${local(weekend.from)} to ${local(weekend.to)} ${zone}`)
console.log(`${TAG} now: ${local(now)} ${zone}`)

await upsert(
  'events',
  PLAN.map((p, i) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: `A lane C fixture for the weekend surface. It exists to prove one thing: ${p.proves}.`,
    description:
      'A lane C fixture event for the /this-weekend proof. It is not a real event and carries no tickets.',
    organisation_id: template.organisation_id,
    created_by: template.created_by,
    category_id: template.category_id,
    cover_image_url: covers[i % covers.length],
    thumbnail_url: covers[i % covers.length],
    start_date: p.startsAt.toISOString(),
    end_date: p.endsAt.toISOString(),
    timezone: p.timezone,
    event_type: 'in_person',
    venue_name: p.venue,
    venue_city: p.city,
    venue_state: p.state,
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
  `events?select=id,slug,title,start_date,end_date,timezone,venue_city,cover_image_url` +
    `&id=in.(${PLAN.map(p => p.id).join(',')})&order=start_date.asc`,
)
if (written.length !== PLAN.length) {
  console.error(`${TAG} FAIL: wrote ${PLAN.length} row(s) and can read back ${written.length}.`)
  process.exit(1)
}

let wrong = 0
for (const p of PLAN) {
  const row = written.find(r => r.slug === p.slug)
  const t = Date.parse(row.start_date)
  const inWindow = t >= weekend.from.getTime() && t <= weekend.to.getTime()
  const listed = isStillListed(row, now)
  const onPage = inWindow && listed
  const ok = onPage === p.onThePage
  if (!ok) wrong += 1
  console.log(
    `${TAG}   ${local(new Date(row.start_date), p.timezone).padEnd(22)} ${p.timezone.padEnd(19)} ` +
      `in window: ${String(inWindow).padEnd(5)}  still listed: ${String(listed).padEnd(5)}  ` +
      `on the page: ${String(onPage).padEnd(5)}  ${ok ? 'as intended' : 'NOT AS INTENDED'}  (${p.proves})`,
  )
}

/*
 * AND THE GROUPING IS ASKED OF THE SHIPPED FUNCTION, not re-derived here.
 * A fixture that proves the day split has to be checked with the code that does
 * the day split, or it is a second opinion about the thing under test.
 */
const visible = written.filter(r => {
  const t = Date.parse(r.start_date)
  return t >= weekend.from.getTime() && t <= weekend.to.getTime() && isStillListed(r, now)
})
const days = groupWeekendByDay(visible)
console.log(`${TAG} the shipped grouping sees ${days.length} day(s):`)
for (const d of days) {
  console.log(`${TAG}   ${d.heading.padEnd(24)} ${d.events.length} event(s): ${d.events.map(e => e.venue_city).join(', ')}`)
}
if (days.length < 2) {
  console.error(
    `${TAG} FAIL: the fixture produced ${days.length} day group(s) and the whole point of it is two. ` +
      `A page that cannot show a Saturday and a Sunday cannot be judged for whether it splits them.`,
  )
  wrong += 1
}
const saturday = days.find(d => d.heading.startsWith('Saturday'))
if (!saturday || !saturday.events.some(e => e.venue_city === 'Perth')) {
  console.error(
    `${TAG} FAIL: the Perth row is not in the Saturday group. It starts at ` +
      `${local(perthSaturdayLate, 'Australia/Perth')} in Perth and ${local(perthSaturdayLate)} in Sydney, ` +
      `and the page files a card under the day it happens in its OWN zone.`,
  )
  wrong += 1
}

if (wrong > 0) {
  console.error(`${TAG} FAIL: ${wrong} check(s) are not where they were built to be.`)
  process.exit(1)
}
console.log(
  `${TAG} OK: ${PLAN.length} fixture(s) written, ${visible.length} visible on the page across ` +
    `${days.length} day(s), and the one that has ended is not among them.`,
)
