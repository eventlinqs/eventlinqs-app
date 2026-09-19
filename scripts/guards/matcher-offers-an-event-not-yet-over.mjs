/**
 * GUARD: THE MATCHER'S EVENT PICKER IS A BOUNDED READ, THROUGH ONE DOOR.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured against TEST on 19 September 2026.
 *
 * /admin/matches composed its picker read inline: published, public,
 * `order('start_date', ascending)`, `limit(40)`, and NO BOUND ON TIME. The
 * component's own comment said "The picker lists the soonest published events".
 * It did not. Ordering every published event ascending and taking forty gives
 * the forty OLDEST the platform has ever had.
 *
 *     published + public on TEST:  101 already over, 175 still to come
 *     what the picker offered:     June 2026, every one of them finished
 *
 * The screen that decides who hears about an event could not be pointed at a
 * single event anybody could still go to, and it got worse every time a past
 * event was added. Nothing threw, nothing was empty, and forty plausible event
 * titles are exactly what a working picker looks like.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT one-visibility-source WEARING A SECOND HAT.
 *
 * That guard already refuses a hand-rolled publication predicate anywhere in
 * discovery, and it is the one that caught this door's first draft. But it
 * exempts `src/app/admin/` BY DESIGN, because the admin panel sees everything,
 * and the matcher picker is an admin screen. So the exact defect above fell
 * through the exemption and would fall through it again. Clause 2 closes that
 * hole for the matcher path specifically, without touching an exemption that is
 * correct everywhere else.
 *
 * ---------------------------------------------------------------------------
 * WHY A GUARD AND NOT ONLY THE TESTS.
 *
 * tests/unit/growth/matcher-offers-an-event-you-can-still-go-to.test.ts pins the
 * door's query. What it cannot see is the NEXT surface: a second screen, a
 * dashboard panel, a future campaign picker, composing its own `from('events')`
 * beside the door and quietly reintroducing the unbounded read. That is how the
 * defect got here in the first place, and no unit test of a door catches a
 * caller that does not use it.
 *
 * ---------------------------------------------------------------------------
 * THE TWO CLAUSES.
 *
 *   1. THE DOOR COMPOSES THE PLATFORM'S OWN VISIBILITY RULE, AT A GIVEN
 *      INSTANT. src/lib/matching/events.ts must exist, must export
 *      readMatchableEvents, and that read must call applyPublicEventVisibility
 *      and hand it a `now`. The shared rule is what carries the listing window,
 *      which keeps an event offerable until it has ACTUALLY ENDED rather than
 *      until it has started; handing it an instant is what makes the door
 *      testable at a chosen time instead of whenever the suite runs.
 *
 *      The first version of this door wrote its own `gte('end_date')` and
 *      scripts/guards/one-visibility-source.mjs refused it within the minute. It
 *      was right, and this clause records the correction rather than the first
 *      attempt.
 *
 *   2. NO LIST OF EVENTS IS READ AROUND IT. In the matcher path, a
 *      `.from('events')` whose chain does not name a single id is a LIST, and a
 *      list goes through the door. A read of ONE event by id is never this
 *      defect and is left alone: src/lib/matching/run.ts loads the scoring
 *      facts for the event it was asked about, which is a different act from
 *      offering a choice, and forcing it through a door that returns four
 *      columns would be worse code for no safety.
 *
 * WHAT IT CANNOT SEE, said plainly. It reads source text. It cannot prove the
 * instant handed to the bound is the right one, nor that the rows come back in
 * the order the screen wants; the tests beside it do that. It also judges only
 * the MATCHER path: the campaigner, the digest and the discovery surfaces read
 * events for their own reasons and are not this guard's business.
 *
 * READ AS CODE, NOT AS TEXT. Every file is passed through stripComments first,
 * because the post-mortem above quotes the very call it bans, and a guard that
 * cannot tell a post-mortem from the defect is a guard that punishes writing
 * the post-mortem.
 *
 * NO SHEBANG (a leading #! breaks Vite when a test imports this module) and no
 * git call (the build host has no git).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[matcher-picker]'
const ROOT = process.cwd()

const DOOR = 'src/lib/matching/events.ts'
const DOOR_EXPORT = 'readMatchableEvents'
/** Regex LITERALS. A pattern built in a template literal is how a guard in this tree shipped blind. */
const COMPOSES_THE_RULE = /applyPublicEventVisibility\s*\(/
const PASSES_AN_INSTANT = /\{\s*now\s*[,}]/
const READS_EVENTS = /\.from\(\s*'events'\s*\)/
/** A chain that names one id is a single-row read, not a list. */
const NAMES_ONE_ID = /\.eq\(\s*'id'/

/** Where a matcher surface lives. The door is inside the second one and is exempt by name. */
const SCOPE = ['src/app/admin/(authed)/matches', 'src/lib/matching']

const failures = []
const notes = []
let filesSwept = 0
let readsJudged = 0

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function lineOf(source, index) {
  return source.slice(0, index).split(String.fromCharCode(10)).length
}

/**
 * The whole method chain a read is written as, followed across lines.
 *
 * A supabase read is `.from(...)` then a run of lines each beginning with a
 * dot, so the chain ends at the first following line that does not. Reading a
 * fixed window of characters instead would either cut a long chain in half or
 * swallow the next statement, and both produce a verdict about the wrong code.
 */
function chainFrom(source, index) {
  const lines = source.split(String.fromCharCode(10))
  const start = lineOf(source, index) - 1
  const out = [lines[start] ?? '']
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!lines[i].trimStart().startsWith('.')) break
    out.push(lines[i])
  }
  return out.join(String.fromCharCode(10))
}

/* --------------------------------------------------------------------------
 * Clause 1: the door exists and bounds on time.
 * ------------------------------------------------------------------------ */
const doorPath = join(ROOT, DOOR)
if (!existsSync(doorPath)) {
  failures.push(
    `${DOOR} is missing. It is the one place that decides which events the matcher may be pointed ` +
      'at, and without it every caller composes its own unbounded read again.',
  )
} else {
  const door = stripComments(readFileSync(doorPath, 'utf8'))
  if (!door.includes(`export async function ${DOOR_EXPORT}`)) {
    failures.push(`${DOOR} no longer exports ${DOOR_EXPORT}.`)
  } else if (!COMPOSES_THE_RULE.test(door)) {
    failures.push(
      `${DOOR} no longer composes applyPublicEventVisibility. That call is what carries the ` +
        'listing window, and without it the picker offers the OLDEST events the platform has ever ' +
        'published, which is what it did until 19 September 2026: 101 of 276 on TEST were already ' +
        'over and the list began in June.',
    )
  } else if (!PASSES_AN_INSTANT.test(door)) {
    failures.push(
      `${DOOR} composes the visibility rule but hands it no instant. The rule then reads the clock ` +
        'itself, which is correct in production and untestable everywhere else: the bound can only ' +
        'be proven at a chosen time if the door takes one.',
    )
  } else {
    notes.push(`${DOOR} composes applyPublicEventVisibility at a given instant`)
  }
}

/* --------------------------------------------------------------------------
 * Clause 2: nothing in the matcher path reads events around the door.
 * ------------------------------------------------------------------------ */
const files = []
for (const dir of SCOPE) walk(join(ROOT, dir), files)

for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  filesSwept += 1
  if (rel === DOOR) continue
  const code = stripComments(readFileSync(abs, 'utf8'))
  let m
  const scan = new RegExp(READS_EVENTS.source, 'g')
  while ((m = scan.exec(code)) !== null) {
    readsJudged += 1
    if (NAMES_ONE_ID.test(chainFrom(code, m.index))) continue
    failures.push(
      `${rel}:${lineOf(code, m.index)} reads a LIST of events directly. Every matcher surface goes ` +
        `through ${DOOR_EXPORT} in ${DOOR}, because the bound that keeps a finished event out of ` +
        'the picker is only worth anything if there is one read to put it on.',
    )
  }
}

if (filesSwept === 0) {
  failures.push(
    'the scope matched no files at all. Either the matcher path moved or this guard is pointed at ' +
      'directories that no longer exist; a guard that sweeps nothing prints the same OK as one ' +
      'that sweeps everything.',
  )
} else {
  notes.push(`${filesSwept} file(s) swept across ${SCOPE.length} director(ies)`)
}

/*
 * THE MATCHERS PROVE THEMSELVES, on every run, for the reason recorded in
 * scripts/guards/consent-dates-are-zoned.mjs: a guard in this tree shipped with
 * a pattern that compiled to nonsense and reported PASS over the thing it
 * banned, and only the red half of a drill found it.
 */
const PROBES = [
  { pattern: COMPOSES_THE_RULE, sample: 'applyPublicEventVisibility(q, { now })', shouldMatch: true },
  { pattern: COMPOSES_THE_RULE, sample: 'publicEventVisibilitySql()', shouldMatch: false },
  { pattern: PASSES_AN_INSTANT, sample: 'applyPublicEventVisibility(q, { now })', shouldMatch: true },
  { pattern: PASSES_AN_INSTANT, sample: 'applyPublicEventVisibility(q, {})', shouldMatch: false },
  { pattern: READS_EVENTS, sample: "admin.from('events').select('id')", shouldMatch: true },
  { pattern: READS_EVENTS, sample: "admin.from('event_categories').select('id')", shouldMatch: false },
  { pattern: NAMES_ONE_ID, sample: ".eq('id', eventId)", shouldMatch: true },
  { pattern: NAMES_ONE_ID, sample: ".eq('status', 'published')", shouldMatch: false },
]
for (const probe of PROBES) {
  if (probe.pattern.test(probe.sample) !== probe.shouldMatch) {
    failures.push(
      `the matcher ${probe.pattern.source} ${probe.shouldMatch ? 'no longer matches' : 'now matches'} ` +
        `"${probe.sample}". This guard cannot be trusted until that is true again.`,
    )
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(`${TAG} ${note}`)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${failures.length} problem(s) with the matcher's event picker.`)
}

declareWork('matcher-offers-an-event-not-yet-over', {
  did: {
    'directory in the matcher path': SCOPE.length,
    'file swept': filesSwept,
    'matcher self-probe run': PROBES.length,
    'events read judged': readsJudged,
  },
  zeroIsFine: {
    'events read judged':
      'the matcher path may legitimately hold none; the file count is what proves this guard looked',
  },
  found: { 'list of events read outside the door': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(`${TAG} OK`)
