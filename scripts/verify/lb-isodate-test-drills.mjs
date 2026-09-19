/**
 * THE ZONED-DATE TESTS FOR THE MARKETING, MATCHING AND PRICING SURFACES,
 * DRILLED RED.
 *
 * A test that has only ever been seen green proves nothing about the thing it
 * names. Each drill below puts one of three files back into a real broken
 * state, runs the test file that names it, and requires the NAMED test to fail.
 * Then it restores from a byte snapshot taken before the mutation and verifies
 * the restore is byte-identical.
 *
 * TWO DEFECTS ARE COVERED HERE, found in the same hour on the same screen: the
 * UTC dates, and the picker that offered the forty OLDEST events the platform
 * had ever published.
 *
 * FIVE OF THESE ARE NOT THE ORIGINAL DEFECT, AND THOSE ARE THE ONES WORTH
 * READING.
 *
 *   A FIXED +10 OFFSET is what a plausible wrong fix looks like. It gets the
 *   September case right, passes a test written only around that case, and is
 *   still wrong for five months of every year, because eastern daylight time is
 *   UTC+11. The zone has to be NAMED.
 *
 *   THE PLATFORM ZONE ON AN EVENT'S DATE is the other plausible wrong fix, and
 *   it is the more tempting one because it removes every UTC reading and reads
 *   as correct. An event's date is the EVENT's, so a Perth show is a different
 *   DAY from a Sydney one at the same instant, and the picker that offers a fee
 *   override still names the wrong night.
 *
 *   DROPPING THE NULL GUARD turns an event with no start date into 1 January
 *   1970 in a picker a fee is attached from.
 *
 * WHAT THIS DRILL DOES NOT COVER, said plainly. The two matcher surfaces
 * (src/app/admin/(authed)/matches/page.tsx and match-run-form.tsx) have no unit
 * test: one is a server component behind an admin session and the other now
 * receives an already-rendered label. They are held by the registered guard,
 * which is drilled separately, and by the driven proof at 390, 768 and 1440.
 *
 * Run: node scripts/verify/lb-isodate-test-drills.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const DATES_TEST = 'tests/unit/growth/marketing-dates-take-the-right-zone.test.ts'
const PICKER_TEST = 'tests/unit/growth/matcher-offers-an-event-you-can-still-go-to.test.ts'
const DECIDE = 'src/lib/consent/decide.ts'
const TARGETS = 'src/app/admin/(authed)/pricing/targets/route.ts'
const DOOR = 'src/lib/matching/events.ts'

const DECIDE_IMPORT = "import { formatPlatformDate } from '@/lib/dates/event-time'"
const MONTHS = "const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']"

const DRILLS = [
  {
    name: 'the consent door goes back to slicing the ISO string for the grant sentence',
    file: DECIDE,
    find:
      'reason: `granted on ${formatPlatformDate(deciding.occurredAt)} under wording ${deciding.wordingVersion}`,',
    replace:
      'reason: `granted on ${deciding.occurredAt.slice(0, 10)} under wording ${deciding.wordingVersion}`,',
    expect: 'a grant recorded at 2026-03-15T13:30:00Z is quoted as 16 Mar 2026',
    test: DATES_TEST,
  },
  {
    name: 'the consent door goes back to slicing the ISO string for the suppression sentence',
    file: DECIDE,
    find:
      'reason: `a ${blocking.scope} suppression recorded on ${formatPlatformDate(blocking.occurredAt)} stops this message`,',
    replace:
      'reason: `a ${blocking.scope} suppression recorded on ${blocking.occurredAt.slice(0, 10)} stops this message`,',
    expect: 'a suppression sentence names the Australian date it was recorded on',
    test: DATES_TEST,
  },
  {
    name: 'the platform date is guessed as a fixed +10 offset rather than named',
    file: DECIDE,
    find: DECIDE_IMPORT,
    replace:
      `${MONTHS}\n` +
      'function formatPlatformDate(iso: string): string {\n' +
      '  const d = new Date(Date.parse(iso) + 10 * 60 * 60 * 1000)\n' +
      '  return `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`\n' +
      '}',
    expect: 'a grant recorded at 2026-03-15T13:30:00Z is quoted as 16 Mar 2026',
    test: DATES_TEST,
  },
  {
    name: 'the fee-override picker goes back to slicing the stored instant',
    file: TARGETS,
    find: "const date = e.start_date ? formatEventDate(e.start_date, e.timezone) : ''",
    replace: "const date = e.start_date ? new Date(e.start_date).toISOString().slice(0, 10) : ''",
    expect: 'a Sydney evening show keeps its Sydney date, not the UTC one',
    test: DATES_TEST,
  },
  {
    name: 'the fee-override picker uses the PLATFORM zone instead of the event own zone',
    file: TARGETS,
    find: "const date = e.start_date ? formatEventDate(e.start_date, e.timezone) : ''",
    replace: "const date = e.start_date ? formatEventDate(e.start_date, 'Australia/Sydney') : ''",
    expect: 'the same instant is a DIFFERENT day in Perth, and the picker says so',
    test: DATES_TEST,
  },
  {
    name: 'the fee-override picker drops the guard on an event with no start date',
    file: TARGETS,
    find: "const date = e.start_date ? formatEventDate(e.start_date, e.timezone) : ''",
    replace: 'const date = formatEventDate(e.start_date as string, e.timezone)',
    expect: 'an event with no start date returns its organiser alone, with no stray separator',
    test: DATES_TEST,
  },
  /*
   * THE PICKER'S OWN TESTS. The second half of this item: the matcher offered
   * the forty OLDEST events the platform had ever published, under a comment
   * claiming it listed the soonest.
   *
   * THE SECOND OF THESE IS THE ONE WORTH READING. It leaves the visibility rule
   * in place and takes away only the instant handed to it. The picker still
   * behaves correctly, and the test that proves the bound was built AT A CHOSEN
   * TIME stops being able to tell, which is how a correct read quietly becomes
   * an untestable one.
   */
  {
    name: 'the matcher door goes back to spelling out its own publication predicate with no time bound',
    file: DOOR,
    test: PICKER_TEST,
    find: `  const { data } = await applyPublicEventVisibility(
    admin.from('events').select(COLUMNS).order('start_date', { ascending: true }).limit(limit),
    { now },
  )`,
    replace:
      "  const { data } = await admin.from('events').select(COLUMNS)" +
      ".eq('status', 'published').eq('visibility', 'public')" +
      ".order('start_date', { ascending: true }).limit(limit)",
    expect: 'carries a time predicate built at the instant it was asked',
  },
  {
    name: 'the matcher door keeps the rule but reads the clock itself',
    file: DOOR,
    test: PICKER_TEST,
    find: '    { now },',
    replace: '    {},',
    expect: 'carries a time predicate built at the instant it was asked',
  },
  {
    name: 'the matcher door starts offering externally ticketed events the consent never covered',
    file: DOOR,
    test: PICKER_TEST,
    find: '    { now },',
    replace: '    { now, includeExternal: true },',
    expect: 'never offers an externally ticketed event',
  },
  {
    name: 'reading one event by id picks up the time bound and a past run stops being describable',
    file: DOOR,
    test: PICKER_TEST,
    find: "  const { data } = await admin.from('events').select(COLUMNS).eq('id', id).maybeSingle()",
    replace:
      "  const { data } = await applyPublicEventVisibility(" +
      "admin.from('events').select(COLUMNS).eq('id', id), { now: new Date() }).maybeSingle()",
    expect: 'fetches the named event with no date filter',
  },
  {
    name: 'the door stops carrying the event own zone, so nothing downstream can render its date',
    file: DOOR,
    test: PICKER_TEST,
    find: "const COLUMNS = 'id, title, start_date, timezone'",
    replace: "const COLUMNS = 'id, title, start_date'",
    expect: 'asks for the event own zone in the select, not only in the type',
  },
]

function runTest(test) {
  try {
    const out = execFileSync('npx', ['vitest', 'run', test, '--project', 'node', '--reporter=verbose'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    return { ok: true, out }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

let fired = 0
const problems = []

console.log('=== LB-ISODATE: the tests, drilled red ===\n')

for (const drill of DRILLS) {
  const before = readFileSync(drill.file)
  const text = before.toString('utf8')

  if (!text.includes(drill.find)) {
    problems.push(`STALE: ${drill.name}: the anchor is no longer in ${drill.file}`)
    console.log(`  STALE             ${drill.name}`)
    continue
  }

  writeFileSync(drill.file, text.replace(drill.find, drill.replace))
  let verdict
  try {
    const result = runTest(drill.test)
    if (result.ok) {
      verdict = 'DID NOT FAIL'
      problems.push(`${drill.name}: the suite stayed green with the defect in place`)
    } else if (!result.out.includes(drill.expect)) {
      verdict = 'WRONG TEST'
      problems.push(
        `${drill.name}: tests failed, but "${drill.expect}" was not among them. The drill may be ` +
          'breaking something other than the thing it names.',
      )
    } else {
      verdict = 'FAILS AS EXPECTED'
      fired += 1
    }
  } finally {
    writeFileSync(drill.file, before)
    if (Buffer.compare(before, readFileSync(drill.file)) !== 0) {
      problems.push(`RESTORE FAILED for ${drill.file}. The tree is dirty and must be checked by hand.`)
    }
  }
  console.log(`  ${verdict.padEnd(18)}${drill.name}`)
}

console.log('')
console.log(`=== ${fired}/${DRILLS.length} drills fired correctly ===`)

for (const test of [DATES_TEST, PICKER_TEST]) {
  const restored = runTest(test)
  console.log(`  restored ${test}: ${restored.ok ? 'GREEN' : 'STILL RED'}`)
  if (!restored.ok) problems.push(`${test} does not pass on the restored tree`)
}

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`  PROBLEM: ${p}`)
  process.exit(1)
}

console.log('\nEvery drill fired and the tree is byte-identical to where it started.')
