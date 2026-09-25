/**
 * GUARD: THE OWNER'S DAILY CEILING RESETS AT A REAL MIDNIGHT, ON EVERY DAY OF
 * THE YEAR, INCLUDING THE TWO THAT ARE NOT 24 HOURS LONG.
 *
 * THE DEFECT, found on 13 September 2026 by driving the function rather than
 * reading it. `platformDayStart` in src/lib/notifications/platform-policy.ts
 * read the Sydney hour, minute and second off `now` and subtracted that many
 * seconds from the instant. That is only correct while a day is 24 hours long,
 * and twice a year in Sydney it is not:
 *
 *   4 Oct 2026 (AEDT begins, 2am becomes 3am), now = 10:00 am AEDT
 *     it returned 3 Oct 2026, 11:00:00 pm AEST, which is the WRONG DATE
 *   5 Apr 2026 (AEST returns, 3am becomes 2am), now = 10:00 am AEST
 *     it returned 5 Apr 2026, 1:00:00 am AEDT, an hour of the day missing
 *
 * Swept hourly across four years, 172 of 35,064 instants came back at a clock
 * time that was not midnight and 84 of those landed on the wrong calendar date.
 *
 * WHY IT MATTERED RATHER THAN BEING A CURIOSITY. That instant is the whole of
 * the owner's volume control: `individualSentToday` counts order notifications
 * with `sent_at >= platformDayStart(now)`, and `routeFor` cuts over to a digest
 * at PLATFORM_ORDER_ALERTS_PER_DAY. In October the window reached back into the
 * previous evening, so the owner was cut off from individual order alerts early
 * on a day they had not been told about; in April the first hour of the day did
 * not count, so the ceiling could be overrun by a full day's allowance.
 *
 * WHAT IT CHECKS. It loads the REAL exported `platformDayStart` through the
 * same alias loader the scripts use, so it judges the function the application
 * runs and not a regex over its source, and for every hour of a four year
 * window it asserts three things, each computed INDEPENDENTLY of the
 * implementation by formatting the answer back into the platform zone:
 *
 *   1. MIDNIGHT. The returned instant reads exactly 00:00:00 in
 *      PLATFORM_TIME_ZONE.
 *   2. THE SAME DAY. It falls on the same platform-zone calendar date as `now`,
 *      so the boundary can never be the previous evening.
 *   3. NEVER AHEAD OF NOW. A day cannot start after the moment inside it.
 *
 * AND IT REFUSES TO BE VACUOUS. A sweep that never crosses a transition would
 * pass against the broken implementation, so the guard counts the UTC offset
 * changes inside its own window and FAILS if it found fewer than
 * MIN_TRANSITIONS. Narrowing the window to a daylight-saving-free stretch
 * therefore breaks the guard loudly instead of quietly turning it off.
 *
 * WHAT IT COSTS, stated so nobody has to wonder later. About 11 seconds, almost
 * all of it the 35,064 real calls; loading the module is a quarter of a second.
 * That is 10 percent of the guard step and under half a percent of the push
 * gate, and it buys the only proof that holds for every hour rather than for the
 * three dates somebody thought to type.
 *
 * Proven red as well as green: scripts/verify/guard-failure-drills.mjs restores
 * the subtracting implementation and this guard fails on it.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[platform-day-boundary]'

/** The sweep. Four years crossed hourly, so both transitions are met eight times. */
export const SWEEP_FROM_UTC = Date.UTC(2025, 0, 1)
export const SWEEP_TO_UTC = Date.UTC(2029, 0, 1)
export const STEP_MS = 3600 * 1000

/**
 * Eight is what four years of Australian daylight saving actually contains, and
 * the guard demands it rather than assuming it, so a shortened window cannot
 * quietly stop testing the only case that ever failed.
 */
export const MIN_TRANSITIONS = 8

/** Ask the application's own module what midnight is, and in which zone. */
function loadUnderTest() {
  const script = [
    "import { platformDayStart } from '@/lib/notifications/platform-policy'",
    "import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'",
    `const from = ${SWEEP_FROM_UTC}, to = ${SWEEP_TO_UTC}, step = ${STEP_MS}`,
    'const answers = []',
    'for (let t = from; t < to; t += step) answers.push(platformDayStart(new Date(t)).getTime())',
    'console.log(JSON.stringify({ zone: PLATFORM_TIME_ZONE, answers }))',
  ].join('\n')
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      '--input-type=module',
      '-e',
      script,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(
      `could not load the notification policy through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 400)}`,
    )
  }
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the notification policy printed no answers: ${r.stdout.slice(0, 200)}`)
  return JSON.parse(line)
}

/**
 * The judgement, pure, so the drill can call it with a substituted answer set.
 * Returns { failures, transitions, judged }; an empty failure list is the pass.
 */
export function judgeBoundaries(zone, answers) {
  const clockIn = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const dateIn = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const partsIn = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  /** The zone's UTC offset at an instant, computed here rather than imported. */
  const offsetMinutes = (instant) => {
    const p = partsIn.formatToParts(instant)
    const get = (type) => Number(p.find((x) => x.type === type)?.value ?? '0')
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
    return Math.round((wall - instant.getTime()) / 60000)
  }

  /*
   * FAILURES ARE BUCKETED BY KIND, not truncated to the first few found.
   *
   * The three kinds happen at different times of year, and the sweep runs in
   * chronological order, so a flat "first eight" list printed only whichever
   * transition came first in the window. The shipped defect produced BOTH a
   * wrong clock in April and a WRONG DATE in October, and the wrong date is by
   * far the more alarming of the two: a report that hid it behind the other
   * would have understated the fault it exists to describe.
   */
  const buckets = {
    'not midnight': { count: 0, examples: [] },
    'a different date': { count: 0, examples: [] },
    'ahead of now': { count: 0, examples: [] },
  }
  const note = (kind, line) => {
    const b = buckets[kind]
    b.count += 1
    if (b.examples.length < 3) b.examples.push(line)
  }

  let transitions = 0
  let previousOffset = null
  let judged = 0

  for (let i = 0; i < answers.length; i += 1) {
    const now = new Date(SWEEP_FROM_UTC + i * STEP_MS)
    const start = new Date(answers[i])
    judged += 1

    const offset = offsetMinutes(now)
    if (previousOffset !== null && offset !== previousOffset) transitions += 1
    previousOffset = offset

    const clock = clockIn.format(start)
    if (clock !== '00:00:00') {
      note(
        'not midnight',
        `at ${now.toISOString()} the day started at ${clock} in ${zone}, not midnight (${start.toISOString()})`,
      )
    }
    if (dateIn.format(start) !== dateIn.format(now)) {
      note(
        'a different date',
        `at ${now.toISOString()} (${dateIn.format(now)} in ${zone}) the day started on ${dateIn.format(start)}, a different date`,
      )
    }
    if (start.getTime() > now.getTime()) {
      note('ahead of now', `at ${now.toISOString()} the day started in the future (${start.toISOString()})`)
    }
  }

  const failures = []
  let defects = 0
  for (const [kind, b] of Object.entries(buckets)) {
    if (b.count === 0) continue
    defects += b.count
    failures.push(`${b.count} instant(s) started the day on ${kind}, for example:`)
    for (const e of b.examples) failures.push(`  ${e}`)
  }

  if (transitions < MIN_TRANSITIONS) {
    defects += 1
    failures.push(
      `the sweep crossed ${transitions} daylight-saving transition(s), fewer than the ${MIN_TRANSITIONS} it must cross. ` +
        'Widen SWEEP_FROM_UTC and SWEEP_TO_UTC: a window with no transition in it cannot see the only defect this guard exists for.',
    )
  }

  return { failures, defects, transitions, judged }
}

const isMain =
  process.argv[1] && /platform-day-boundary-is-zone-correct\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const { zone, answers } = loadUnderTest()
  const { failures, defects, transitions, judged } = judgeBoundaries(zone, answers)
  declareWork('platform-day-boundary-is-zone-correct', {
    did: {
      'instant judged': judged,
      'daylight-saving transition crossed': transitions,
    },
    found: { 'day-boundary defect': defects },
  })
  console.log(`${TAG} zone: ${zone}`)
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - every one of ${judged} hourly instants across ${transitions} daylight-saving transitions starts its day at midnight in ${zone}, on that same date, never ahead of itself`,
  )
}
