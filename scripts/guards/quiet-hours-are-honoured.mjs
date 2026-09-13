/**
 * GUARD: THE QUIET HOURS THE USER SETS ARE ACTUALLY CONSULTED BEFORE A SEND.
 *
 * THE DEFECT, found on 13 September 2026 by reading the alert engine against
 * the screen that configures it. /account/notifications says in plain words that
 * nothing arrives inside your quiet hours. The window is collected by that
 * screen, validated by /api/notifications/prefs, stored on notification_prefs,
 * and READ BY THE DISPATCHER ON EVERY SEND - and no code anywhere consulted it.
 * `isWithinQuietHours` had existed in src/lib/notifications/policy.ts since the
 * alert engine landed, was exhaustively unit tested, and the only thing that
 * ever called it was its own test file. A user who asked for silence between
 * 10pm and 7am was pushed at 3am regardless.
 *
 * That is two defects at once: a control that does nothing, which the Definition
 * of Done calls a defect by name, and a promise on a shipped surface that was
 * not true.
 *
 * WHAT IT CHECKS, in two clauses, because either one alone is defeatable.
 *
 * 1. THE DECISION, EXECUTED. It loads the REAL exported `isQuietNow` through the
 *    same alias loader the scripts use and runs it across every hour of three
 *    days in the launch zone - an ordinary day and BOTH daylight-saving
 *    transitions - for a wrap-around window and a daytime one, comparing each
 *    answer with an expectation computed INDEPENDENTLY here from the zone's own
 *    hour. It also asserts the two properties a cron depends on: a zone the
 *    runtime cannot resolve must not throw, and an unset window is never quiet.
 *
 * 2. THE CALLERS, INSTALLED. Every module that reads the quiet-hours columns off
 *    notification_prefs must either consult the decision or appear in EXEMPT
 *    below WITH ITS REASON, which is printed on every run. The exemption that
 *    exists today is not a loophole, it is a finding: dispatchMarketplaceAlert
 *    is called from a server action with nothing behind it to run again, so
 *    holding a message there would destroy it rather than defer it. That is
 *    written down here so the next person meets the reasoning instead of the
 *    silence.
 *
 * AND IT REFUSES TO BE VACUOUS. It fails if the sweep judged fewer than
 * MIN_JUDGED hours, if the sweep never saw BOTH a quiet answer and a loud one,
 * if it crossed no daylight-saving transition, or if it can find no reader of
 * the columns at all.
 *
 * WHAT IT COSTS. Under two seconds: one module load through the loader, then
 * arithmetic and a directory scan.
 *
 * Proven red as well as green in scripts/verify/guard-failure-drills.mjs: one
 * drill takes the call back out of the dispatcher, the other makes the decision
 * read the platform clock instead of the user's.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[quiet-hours]'

export const POLICY = 'src/lib/notifications/policy.ts'
export const DECISION = 'isQuietNow'
/** The column that marks a module as a reader of the window. */
export const COLUMN = 'quiet_hours_start'
/** The launch zone, where both transitions and the wrap-around window live. */
export const ZONE = 'Australia/Sydney'
/** An ordinary day, the day daylight saving begins, and the day it ends. */
export const DAYS = ['2026-09-13', '2026-10-04', '2027-04-04']
/** Three days of hours. Equal to what DAYS holds, so narrowing DAYS fails here. */
export const MIN_JUDGED = 72
export const MIN_TRANSITIONS = 2

/**
 * Modules that read the window but must NOT act on it, each with the reason.
 *
 * A reason here is a claim about behaviour, so it says what would happen rather
 * than that somebody decided it.
 */
export const EXEMPT = new Map([
  [
    'src/lib/marketplace/notify.ts',
    "dispatched from a server action (src/app/actions/gigs.ts) with no cron behind it, so a held message is never reconsidered and holding would DELETE it rather than defer it. Deferring marketplace messages needs somewhere to hold them, which is a schema change and therefore the founder's to apply.",
  ],
  [
    'src/app/api/notifications/prefs/route.ts',
    'the screen that stores the window. It decides nothing about a send.',
  ],
  [
    'src/lib/notifications/policy.ts',
    'the decision itself.',
  ],
  [
    'src/components/notifications/channel-prefs.tsx',
    'the form that collects the window in the browser. It sends nothing.',
  ],
  [
    'src/types/database.ts',
    'the generated schema types. It is a description of the columns, not a reader of them.',
  ],
])

/** Ask the application's own module what it thinks, hour by hour. */
function loadUnderTest() {
  const script = [
    "import { isQuietNow, localHourFor } from '@/lib/notifications/policy'",
    `const days = ${JSON.stringify(DAYS)}`,
    `const zone = ${JSON.stringify(ZONE)}`,
    'const answers = []',
    'for (const day of days) {',
    '  for (let h = 0; h < 24; h += 1) {',
    // Judge real instants across the whole UTC day, so the transition hours are
    // met as they actually occur rather than as a wall clock imagines them.
    '    const at = new Date(`${day}T${String(h).padStart(2, "0")}:30:00.000Z`)',
    '    answers.push({',
    '      at: at.toISOString(),',
    '      hour: localHourFor(zone, at),',
    '      wrap: isQuietNow({ quiet_hours_start: 22, quiet_hours_end: 7, timezone: zone }, at),',
    '      day: isQuietNow({ quiet_hours_start: 9, quiet_hours_end: 17, timezone: zone }, at),',
    '      unset: isQuietNow({ quiet_hours_start: null, quiet_hours_end: null, timezone: zone }, at),',
    '      unknownZone: isQuietNow({ quiet_hours_start: 22, quiet_hours_end: 7, timezone: "Somewhere/Nowhere" }, at),',
    '    })',
    '  }',
    '}',
    'console.log(JSON.stringify({ zone, answers }))',
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
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
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

/** Clause 1, pure, so the drill can substitute an answer set. */
export function judgeDecisions(zone, answers) {
  const failures = []
  const hourIn = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' })
  const partsIn = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const offsetMinutes = (instant) => {
    const p = partsIn.formatToParts(instant)
    const get = (type) => Number(p.find((x) => x.type === type)?.value ?? '0')
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
    return Math.round((wall - instant.getTime()) / 60000)
  }

  let judged = 0
  let quiet = 0
  let loud = 0
  let transitions = 0
  let previousOffset = null

  for (const a of answers) {
    judged += 1
    const at = new Date(a.at)
    const offset = offsetMinutes(at)
    if (previousOffset !== null && offset !== previousOffset) transitions += 1
    previousOffset = offset

    // The hour, computed here rather than taken from the module under test.
    const expectedHour = Number(hourIn.format(at))
    if (a.hour !== expectedHour) {
      failures.push(`at ${a.at} the module read hour ${a.hour} in ${zone}, which is actually ${expectedHour}`)
    }
    const expectedWrap = expectedHour >= 22 || expectedHour < 7
    const expectedDay = expectedHour >= 9 && expectedHour < 17
    if (a.wrap !== expectedWrap) {
      failures.push(
        `at ${a.at} (${expectedHour}:30 in ${zone}) a 10pm to 7am window answered ${a.wrap}, expected ${expectedWrap}`,
      )
    }
    if (a.day !== expectedDay) {
      failures.push(
        `at ${a.at} (${expectedHour}:30 in ${zone}) a 9am to 5pm window answered ${a.day}, expected ${expectedDay}`,
      )
    }
    if (a.unset !== false) {
      failures.push(`at ${a.at} a user with NO quiet hours was judged quiet, which would silence them for ever`)
    }
    if (typeof a.unknownZone !== 'boolean') {
      failures.push(`at ${a.at} an unresolvable timezone did not yield a decision: ${JSON.stringify(a.unknownZone)}`)
    }
    if (a.wrap) quiet += 1
    else loud += 1
  }

  if (judged < MIN_JUDGED) {
    failures.push(
      `the sweep judged ${judged} hour(s), fewer than the ${MIN_JUDGED} this guard must judge. A guard that judges almost nothing is not a guard.`,
    )
  }
  if (quiet === 0 || loud === 0) {
    failures.push(
      `the sweep saw ${quiet} quiet hour(s) and ${loud} loud one(s); it must see both, or a decision stuck on one answer would pass.`,
    )
  }
  if (transitions < MIN_TRANSITIONS) {
    failures.push(
      `the sweep crossed ${transitions} daylight-saving transition(s), fewer than the ${MIN_TRANSITIONS} it must cross. The window is read off a wall clock, so the days that clock jumps are the days it can be wrong.`,
    )
  }
  return { failures, judged, quiet, loud, transitions }
}

/** Every .ts file under src, so the scan cannot miss a new dispatcher. */
function sourceFiles() {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.tsx?$/.test(entry)) found.push(full)
    }
  }
  walk(join(ROOT, 'src'))
  return found
}

/** Clause 2, pure. Every reader of the window either acts on it or is exempt. */
export function judgeReaders(files) {
  const failures = []
  const readers = []
  const exempted = []
  for (const { path, source } of files) {
    if (!source.includes(COLUMN)) continue
    readers.push(path)
    if (source.includes(`${DECISION}(`)) continue
    const reason = EXEMPT.get(path)
    if (reason) {
      exempted.push({ path, reason })
      continue
    }
    failures.push(
      `${path} reads ${COLUMN} off notification_prefs and never consults ${DECISION}(). ` +
        'Either it must honour the window the account screen promises, or it must be listed in EXEMPT in this guard with the reason it cannot.',
    )
  }
  if (readers.length === 0) {
    failures.push(
      `no file under src reads ${COLUMN}. Either the preference was removed, or this scan has stopped finding the code it judges.`,
    )
  }
  return { failures, readers, exempted }
}

const isMain = process.argv[1] && /quiet-hours-are-honoured\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const { zone, answers } = loadUnderTest()
  const decisions = judgeDecisions(zone, answers)
  const files = sourceFiles().map((full) => ({
    path: relative(ROOT, full).replace(/\\/g, '/'),
    source: readFileSync(full, 'utf8'),
  }))
  const readers = judgeReaders(files)
  const failures = [...decisions.failures, ...readers.failures]

  declareWork('quiet-hours-are-honoured', {
    did: {
      'hour judged through the real decision': decisions.judged,
      'source file read': files.length,
      'reader of the quiet-hours window judged': readers.readers.length,
    },
    found: { 'send path ignoring the window': failures.length },
  })
  console.log(
    `${TAG} ${zone}: ${decisions.quiet} quiet hour(s), ${decisions.loud} loud, ${decisions.transitions} daylight-saving transition(s) crossed`,
  )
  console.log(`${TAG} readers: ${readers.readers.join(', ')}`)
  for (const e of readers.exempted) console.log(`${TAG} EXEMPT ${e.path}: ${e.reason}`)
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - the window is read on the user's own clock and every send path either honours it or says why it cannot`,
  )
}
