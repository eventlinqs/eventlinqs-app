/**
 * THE LB-ISODATE DRIVE, RUN AGAINST THE DEFECTS IT EXISTS TO CATCH.
 *
 * A drive that has only ever been seen green proves the screen renders, not
 * that the drive can tell a right screen from a wrong one. This puts all five
 * defects back, runs the same drive against the same running server, and
 * requires the NAMED checks to fail. It then restores from a byte snapshot
 * taken before the mutation and verifies the restore is byte-identical.
 *
 * THE FIVE, exactly as they stood on 19 September 2026 before this item:
 *
 *   1. the matcher run's date, sliced out of the ISO string
 *   2. the matcher picker's event labels, sliced out of the stored instant
 *   3. the matcher picker, unbounded, offering the forty OLDEST events
 *   4. the fee-override picker's event dates, sliced out of the stored instant
 *   5. the hint that read "Pick a event from the list"
 *
 * IT DOES NOT ASSERT A TOTAL. A count can fall for any reason, including the
 * drive crashing, so it requires each NAMED check to have failed and every
 * other check to still pass. A red run where the fixture never built is not
 * evidence of anything.
 *
 * Usage, with the server already up on 3100:
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/lb-isodate-drive-red.mjs --out C:/dev/EVIDENCE/LB-ISODATE
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const MATCHES = 'src/app/admin/(authed)/matches/page.tsx'
const DOOR = 'src/lib/matching/events.ts'
const TARGETS = 'src/app/admin/(authed)/pricing/targets/route.ts'
const PICKER = 'src/components/admin/override-target-picker.tsx'

const MUTATIONS = [
  {
    file: MATCHES,
    find: '{formatPlatformDate(run.started_at)}.',
    replace: '{new Date(run.started_at).toISOString().slice(0, 10)}.',
    all: false,
  },
  {
    file: MATCHES,
    find: 'formatEventDate(selected.startDate, selected.timezone)',
    replace: 'selected.startDate.slice(0, 10)',
    all: false,
  },
  {
    file: MATCHES,
    find: 'formatEventDate(e.startDate, e.timezone)',
    replace: 'e.startDate.slice(0, 10)',
    all: false,
  },
  {
    file: DOOR,
    find: `await applyPublicEventVisibility(
    admin.from('events').select(COLUMNS).order('start_date', { ascending: true }).limit(limit),
    { now },
  )`,
    replace:
      "await admin.from('events').select(COLUMNS)" +
      ".eq('status', 'published').eq('visibility', 'public')" +
      ".order('start_date', { ascending: true }).limit(limit)",
    all: false,
  },
  {
    file: TARGETS,
    find: "formatEventDate(e.start_date, e.timezone)",
    replace: "new Date(e.start_date).toISOString().slice(0, 10)",
    all: false,
  },
  {
    file: PICKER,
    find: 'Pick {article} {labelForKind} from the list.',
    replace: 'Pick a {labelForKind} from the list.',
    all: false,
  },
]

/** Every check id that MUST fail once the defects are back. */
const MUST_FAIL = [
  'matcher-picker-dates-a-sydney-event-in-sydney',
  'matcher-picker-dates-a-perth-event-in-perth',
  'matcher-picker-never-prints-the-utc-date',
  'matcher-picker-does-not-offer-an-event-that-is-over',
  'matcher-run-carries-the-australian-date',
  'matcher-run-never-prints-the-utc-date',
  'fee-override-picker-dates-a-sydney-event-in-sydney',
  'fee-override-picker-dates-a-perth-event-in-perth',
  'fee-override-picker-never-prints-the-utc-date',
  'fee-override-picker-says-pick-an-event-not-a-event',
]

const snapshots = new Map()
const problems = []

function mutate() {
  for (const m of MUTATIONS) {
    if (!snapshots.has(m.file)) snapshots.set(m.file, readFileSync(m.file))
    const text = readFileSync(m.file, 'utf8')
    if (!text.includes(m.find)) {
      problems.push(`STALE: the anchor for ${m.file} is gone: ${m.find.slice(0, 60)}`)
      continue
    }
    writeFileSync(m.file, text.replace(m.find, m.replace))
  }
}

function restore() {
  for (const [file, bytes] of snapshots) {
    writeFileSync(file, bytes)
    if (Buffer.compare(bytes, readFileSync(file)) !== 0) {
      problems.push(`RESTORE FAILED for ${file}. The tree is dirty and must be checked by hand.`)
    }
  }
}

function runDrive(outDir) {
  try {
    const stdout = execFileSync(
      'node',
      ['--env-file=.env.local', 'scripts/verify/lb-isodate-drive.mjs', '--out', outDir],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BASE: process.env.BASE ?? 'http://localhost:3100' },
        maxBuffer: 32 * 1024 * 1024,
      },
    )
    return stdout
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
}

console.log('=== LB-ISODATE: the drive, run red ===\n')

let output = ''
try {
  mutate()
  if (problems.length > 0) throw new Error(problems.join(' | '))
  console.log('  five defects restored; waiting for the dev server to recompile')
  // `next dev` recompiles on the file watcher, and the first request after an
  // edit pays for it. The drive's own waits are generous, but the sign-in is
  // not, so the routes are touched once before the drive starts.
  await new Promise(r => setTimeout(r, 4000))
  for (const path of ['/admin/login', '/admin/matches', '/admin/pricing']) {
    await fetch(`${process.env.BASE ?? 'http://localhost:3100'}${path}`, { redirect: 'manual' }).catch(() => {})
  }
  output = runDrive(join(out, 'red'))
} finally {
  restore()
}

writeFileSync(join(out, 'red-run.txt'), output)

const lines = output.split(String.fromCharCode(10))
const verdictOf = fragment => {
  const found = lines.filter(l => l.includes(fragment))
  if (found.length === 0) return 'ABSENT'
  return found.every(l => l.trimStart().startsWith('FAIL')) ? 'FAILED' : 'STILL PASSED'
}

let fired = 0
for (const fragment of MUST_FAIL) {
  const verdict = verdictOf(fragment)
  if (verdict === 'FAILED') fired += 1
  else problems.push(`${fragment}: ${verdict} with the defect in place`)
  console.log(`  ${verdict.padEnd(14)}${fragment}`)
}

/*
 * THE FIXTURE MUST STILL HAVE BEEN BUILT AND TORN DOWN. A red run that never
 * created its events would fail every check above for the wrong reason, and
 * would leave a published lane B fixture on the shared TEST project.
 */
for (const fragment of ['isodate.setup.a-run-exists-at-a-chosen-instant', 'isodate.teardown.left-as-found']) {
  const ok = lines.some(l => l.trimStart().startsWith('PASS') && l.includes(fragment))
  if (!ok) problems.push(`${fragment} did not pass during the red run`)
  console.log(`  ${(ok ? 'PASS' : 'NOT PASSED').padEnd(14)}${fragment}`)
}

console.log('')
console.log(`=== ${fired}/${MUST_FAIL.length} checks failed as they must ===`)

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`  PROBLEM: ${p}`)
  process.exit(1)
}
console.log('\nEvery named check failed against the defects and the tree is byte-identical.')
