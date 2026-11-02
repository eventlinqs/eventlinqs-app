/**
 * GROWTH READS SKIP THE PLATFORM (WINDOW 1's data point of 2 November 2026, 12:17; CONTROLLER 12:23 (D)).
 *
 * Migration 20261101132001 gives every organisation its organisers row, so the 'EventLinqs listings' organisation, the
 * platform's own account that holds every curated night whatever its host, has one too. Five readers counted the
 * organisers table as it stands (the funnel, the acquisition desk, the acquisition page's state counts, the daily
 * twenty and the organiser score), so the platform would have read as an organiser claimed and publishing hundreds of
 * nights, and as a host to recruit.
 *
 * Who is a real organiser is decided by src/lib/growth/platform-organiser.ts (readPlatformOrganiserIds and
 * withoutPlatformOrganisers) and nowhere else. This fails the build where a file in src/ selects from the organisers
 * table and never calls readPlatformOrganiserIds. Comments are stripped first; a write (insert, update) is not a read.
 *
 * WHAT THIS CANNOT SEE, said so it is not mistaken for coverage: SQL. growth_acquisition_facts() (20261101140001) returns
 * the platform's row too; its one caller, src/lib/growth/acquisition.ts, takes it out by this rule. A new SQL function
 * that counts organisers for a screen does the same in its caller, or leaves the listings organisation out itself.
 *
 * Run: node scripts/guards/growth-reads-skip-the-platform.mjs
 */
import { relative, resolve } from 'node:path'
import { readSource, sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[growth-reads-skip-the-platform]'
const ROOT = process.cwd()
const THE_RULE = 'src/lib/growth/platform-organiser.ts'
const SELECTS_ORGANISERS = /\.from\(\s*['"`]organisers['"`]\s*\)\s*\.select\(/g
const USES_THE_RULE = /\breadPlatformOrganiserIds\s*\(/

const files = sourceFiles(ROOT)
const failures = []
let ruleSeen = false
let readers = 0
for (const file of files) {
  const rel = relative(ROOT, resolve(ROOT, file)).split('\\').join('/')
  if (!rel.startsWith('src/')) continue
  if (rel === THE_RULE) { ruleSeen = true; continue }
  const code = readSource(resolve(ROOT, file)).withStrings
  SELECTS_ORGANISERS.lastIndex = 0
  const m = SELECTS_ORGANISERS.exec(code)
  if (m === null) continue
  readers += 1
  if (!USES_THE_RULE.test(code)) {
    const line = code.slice(0, m.index).split('\n').length
    failures.push(`${rel}:${line} reads the organisers with no readPlatformOrganiserIds: the EventLinqs listings organisation would count as an organiser. Take it out with ${THE_RULE}.`)
  }
}
if (!ruleSeen) failures.push(`${THE_RULE} is missing: the one rule for who is a real organiser is gone.`)

declareWork('growth-reads-skip-the-platform', {
  did: { 'source file': files.length, 'organisers reader': readers },
  found: { failure: failures.length },
})
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} organisers read(s) count the platform's own organisation.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${readers} organisers readers; each leaves the platform's own organisation out by ${THE_RULE}.`)
