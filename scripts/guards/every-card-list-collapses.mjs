/**
 * GUARD: EVERY LIST OF EVENT CARDS SHOWS A LISTING ONCE.
 *
 * WHY: the CONTROLLER's 1 November 2026 03:21 (P1-a); WINDOW 6's 04:00 read of live: 288 extra cards on 35 pages, the
 * same listing drawn twice in one section (venue pages' 'Upcoming events at <venue>' 167, category grids 89, the four
 * city browse grids 32). Car 29 fixed the home page; the class is every file that draws EventCard. A recurring
 * listing's later nights belong on its one card (its also-on line, src/lib/events/one-card-per-event.ts).
 *
 * CLAUSES
 *   1  Every file under src that draws <EventCard CALLS collapseListings, oneCardPerEvent or notAlreadyListed; an
 *      import alone is not a collapse (the drill proved a mention-only check passed an uncollapsed list).
 *   2  A file exempted below draws exactly one EventCard and maps no list into it; the exemption names why.
 *
 * Test: tests/unit/events/every-card-list-collapses.test.ts. Drill: scripts/verify/guard-failure-drills.mjs,
 * 'a community grid draws its events without collapsing a listing to one card'.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[every-card-list-collapses]'
const COLLAPSES = /\b(collapseListings|oneCardPerEvent|notAlreadyListed)\(/
const ONE_CARD_ONLY = {
  'src/components/templates/OrganisersLandingPage.tsx': 'one example card beside the words that describe it, never a list',
}

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(name)) files.push(p.replace(/\\/g, '/'))
  }
}
walk('src')

const failures = []
let drawing = 0
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const cards = (src.match(/<EventCard\b/g) ?? []).length
  if (cards === 0) continue
  drawing += 1
  if (file in ONE_CARD_ONLY) {
    if (cards !== 1 || /\.map\([^)]*\)\s*=>\s*\(?\s*<EventCard/.test(src)) failures.push(`2: ${file} is exempt as one card but draws ${cards} or maps a list`)
    continue
  }
  if (!COLLAPSES.test(src)) failures.push(`1: ${file} draws EventCard and never collapses a listing (collapseListings)`)
}
for (const file of Object.keys(ONE_CARD_ONLY)) if (!files.includes(file)) failures.push(`2: the exemption names ${file}, which is gone`)

console.log(`${TAG} checked ${files.length} source files, ${drawing} draw EventCard`)
if (failures.length) {
  console.error(`${TAG} FAILED`)
  for (const f of failures) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every list of event cards shows a listing once`)
