/**
 * GUARD: NOTHING GOES ONLINE UNLESS IT WAS VERIFIED ON ITS REAL SOURCE, AND NOTHING STAYS ONLINE AFTER IT LEAVES (Lawal,
 * 15 November 2026, 06:03: "You can never publish a listing from an old reading without verifying ... This is the last time
 * this engine will make this mistake"; his 06:50, relayed by the PM at 07:00, item 4 (a) to (g); PM-ORDER-EVENTLINQS-2-
 * LAUNCH-8NOV.md). Plan: C:\dev\START-16OCT\EL-SAME-DAY-15NOV\plan.md, version 2.
 *
 * A listed night is public only while its freshness holds (src/lib/events/public-visibility.ts, clause 5), and its freshness
 * runs from its newest agreeing read for as long as its distance allows (listing_fresh_from_reads, supabase/migrations/
 * 20261115091001). This guard fails the build on any of the ways back to the old faults:
 *   1. the cutover migration holds the rule: freshness from outcome 'confirmed' reads only, at the read's time, by its
 *      distance (30, 7 and 2 days, its own day until 06:00), none without a read; both publish functions dated from the
 *      candidate's read; a partner night with no link books on its own page; the left_source and duplicate reasons;
 *   2. no later migration writes a listing check dated from now() or current_date, or brings back listing_fresh_until_for
 *      (the 22 day rule) into a trigger;
 *   3. every listing check written from the code carries its read time (checked_at), except a path named below with its
 *      reason; public-visibility.ts still hides a listed night whose freshness has passed;
 *   4. A NIGHT THAT LEAVES ITS LIST IS HELD (item 4 (b), the BRAZJAZ fix): the collection run asks nightsThatLeft and holds
 *      what it returns; the hold walk never releases a 'left_source' or 'duplicate' hold;
 *   5. A NIGHT READ WITH NO LINK IS NEVER FREE (the PM's 07:55, the JazzLab nights): the hunt's publisher books it on its
 *      own page (huntBooking), so the hourly run never makes it walk in.
 * Drills: scripts/verify/guard-failure-drills.mjs, five, one for each way the fault comes back.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[same-day-reads]'
const MIGRATIONS = 'supabase/migrations'
const CUTOVER = '20261115091001_same_day_verification.sql'
/** A listing check written without checked_at, each with why its default (the insert's moment) is its read's moment. */
const READ_TIME_IS_THE_INSERT = {
  'src/lib/listings/collect-store.ts': {
    count: 1,
    reason: 'confirmSeries: written by the collection run that made the read, in the same run, minutes after it',
  },
}
const read = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const failures = []

// 1. The cutover migration holds the rule.
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
if (!files.includes(CUTOVER)) failures.push(`1: ${MIGRATIONS}/${CUTOVER} is missing`)
else {
  const sql = read(join(MIGRATIONS, CUTOVER))
  for (const [need, what] of [
    ["c.outcome = 'confirmed'", "freshness rests on agreeing reads only (outcome 'confirmed')"],
    ['least(c.checked_at,', 'freshness is timed at the read, never later than the day it says it read'],
    ["timestamptz '1970-01-01 00:00:00+00'", 'a night with no agreeing read is never fresh'],
    ["rd + interval '30 days' < p_start - interval '30 days'", 'a night more than 30 days out is fresh 30 days from its read'],
    ["greatest(rd + interval '7 days', p_start - interval '30 days')", 'a night 8 to 30 days out is fresh 7 days from its read'],
    ["greatest(rd + interval '2 days', p_start - interval '7 days')", 'a night 2 to 7 days out is fresh 2 days from its read'],
    ["daystart + interval '6 hours'", 'a night in its last 2 days is fresh only until 06:00 on its own day without a read that day'],
    ['(v_c.read_at at time zone v_tz)::date', "the publish functions date their check from the candidate's read"],
    ["jsonb_build_object(''url'', v_c.page_url, ''kind'', ''tickets''", 'a partner night with no link books on its own page'],
    ["'left_source'::text, 'duplicate'::text", 'the hold reasons left_source and duplicate'],
  ]) if (!sql.includes(need)) failures.push(`1: ${CUTOVER} no longer says ${what} (${need})`)
}

// 2. No later migration brings the old fault back.
for (const f of files.filter((x) => x > CUTOVER)) {
  const sql = read(join(MIGRATIONS, f))
  if (/insert\s+into\s+public\.listing_checks[\s\S]{0,600}?\b(now\(\)|current_date)\b/i.test(sql)) {
    failures.push(`2: ${f} writes a listing check dated from now() or current_date, not from its read`)
  }
  if (/listing_fresh_until_for\s*\(/.test(sql)) failures.push(`2: ${f} brings back listing_fresh_until_for, the 22 day freshness`)
}

// 3. The code: every listing check carries its read time; stale nights stay hidden.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
let inserts = 0
for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
  const text = read(f)
  const key = f.replace(/\\/g, '/')
  let missing = 0
  for (const m of text.matchAll(/from\('listing_checks'\)\s*\.insert\(/g)) {
    inserts += 1
    if (!/checked_at/.test(text.slice(m.index, m.index + 700))) missing += 1
  }
  const allowed = READ_TIME_IS_THE_INSERT[key]?.count ?? 0
  if (missing > allowed) failures.push(`3: ${key} writes a listing check without its read time (checked_at)`)
  if (allowed > 0 && missing < allowed) failures.push(`3: ${key} is excused for ${allowed} check(s) without checked_at and writes ${missing}: take it off the list`)
}
if (!read('src/lib/events/public-visibility.ts').includes('listing_fresh_until.gte.')) {
  failures.push('3: src/lib/events/public-visibility.ts no longer hides a listed night whose freshness has passed')
}

// 4. A night that leaves its list is held, and only its list releases it.
const run = read('src/lib/listings/collect-run.ts')
if (!/nightsThatLeft\(\{/.test(run) || !/store\.holdLeftSource\(/.test(run)) {
  failures.push('4: src/lib/listings/collect-run.ts no longer holds a night that has left its source\'s list (nightsThatLeft, holdLeftSource)')
}
const walkRun = read('src/lib/listings/hold-walk-run.ts')
if (!walkRun.includes("h.reason !== 'duplicate'") || !walkRun.includes("h.reason !== 'left_source'")) {
  failures.push('4: src/lib/listings/hold-walk-run.ts may release a left_source or duplicate hold, which only its list or a person may')
}

// 5. A night read with no link is never free.
const hunt = read('src/lib/listings/headline-hunt.ts')
if (!/if \(row\.links\.length === 0\) return \{ free: false, links: \[\{ url: row\.pageUrl, kind: 'tickets', price_from_cents: null/.test(hunt)) {
  failures.push('5: src/lib/listings/headline-hunt.ts huntBooking no longer books a night read with no link on its own page')
}
if (!/huntBooking\(row, today\)/.test(read('src/lib/listings/collect-store.ts'))) {
  failures.push('5: src/lib/listings/collect-store.ts publishHuntNight no longer takes its links from huntBooking')
}

if (failures.length) {
  console.error(`${TAG} FAILED`)
  for (const f of failures) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - freshness from agreeing reads only, by distance; ${inserts} listing check write(s) in the code, each with its read time or its reason; a night that leaves its list is held; a night read with no link is never free; ${files.filter((x) => x > CUTOVER).length} later migration(s)`)
