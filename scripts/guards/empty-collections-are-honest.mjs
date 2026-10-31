/**
 * GUARD: AN EMPTY DISCOVERY COLLECTION SAYS SO, PLAINLY, AND NOTHING POINTS AT IT.
 *
 * WHY (Lawal's directive of 31 October 2026, 17:44, section 11, verbatim in
 * C:\dev\START-16OCT\EVENTLINQS-DISCOVERY-DIRECTIVE-31OCT-1744.md): "Do not present empty community collections as if
 * they contain live events ... Where an event collection is empty, avoid large repeated promotional cards. Preserve
 * accessible navigation to all supported communities." On production the 420 community-in-city pages, and the city,
 * suburb, community, category, weekend and free-week pages, drew the same large card into an empty grid ('The first X
 * event on EventLinqs could be yours', an organiser pitch, three trust pillars), and the place pages kept their date
 * chips, a 'Browse all X events' hero button and a sticky bar all pointing at that empty grid.
 *
 * CLAUSES
 *   1  No discovery template draws the large promotional empty card (CategoryHeroEmpty) or the words 'could be yours'.
 *   2  Each discovery template draws the short honest note (EmptyCollectionNote) for its empty collection.
 *   3  Each place page (community-in-city, city, suburb) knows when it holds no event (pageIsEmpty) and then shows no
 *      date chips, no sticky bar and a hero button that leads to real events, never to the empty grid.
 *   4  Nothing anywhere in src says 'could be yours' (the class: an empty collection dressed as an invitation).
 *
 * Its drills: scripts/verify/guard-failure-drills.mjs, 'an empty community-in-city grid draws the promo card again' and
 * 'a city page points its chips at an empty grid again'.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[empty-collections-are-honest]'
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null)
const FAILURES = []
const fail = (clause, msg) => FAILURES.push(`${clause}: ${msg}`)

const DISCOVERY_TEMPLATES = [
  'src/components/templates/CommunityCityLandingPage.tsx',
  'src/components/features/community/events-by-community-grid.tsx',
  'src/components/templates/CityLandingPage.tsx',
  'src/components/templates/SuburbLandingPage.tsx',
  'src/components/templates/CategoryLandingPage.tsx',
  'src/components/templates/CategoryEventsLandingPage.tsx',
  'src/components/templates/FreeWeekLandingPage.tsx',
  'src/components/templates/WeekendLandingPage.tsx',
]
const PLACE_PAGES = DISCOVERY_TEMPLATES.slice(0, 4).filter((f) => !f.includes('events-by-community-grid'))

for (const file of DISCOVERY_TEMPLATES) {
  const src = read(file)
  if (src === null) { fail('2', `${file} is missing; a discovery template moved without this guard`); continue }
  if (/<CategoryHeroEmpty\b/.test(src)) fail('1', `${file} draws the large promotional empty card (CategoryHeroEmpty)`)
  if (/could be yours/.test(src)) fail('1', `${file} says 'could be yours' over an empty collection`)
  if (!/<EmptyCollectionNote\b/.test(src)) fail('2', `${file} no longer draws EmptyCollectionNote for its empty collection`)
}

for (const file of PLACE_PAGES) {
  const src = read(file)
  if (src === null) continue
  if (!/const pageIsEmpty = /.test(src)) { fail('3', `${file} no longer knows when it holds no event (pageIsEmpty)`); continue }
  if (!/\{pageIsEmpty \? null : \(\s*<Suspense fallback=\{null\}>\s*<DateFilterChips/.test(src)) fail('3', `${file} shows its date chips over an empty page`)
  if (!/\{pageIsEmpty \? null : \(\s*<MobileStickyBar/.test(src)) fail('3', `${file} shows its sticky bar over an empty page`)
  if (!/primaryCtaHref=\{pageIsEmpty \? '\/events' : undefined\}/.test(src)) fail('3', `${file}'s hero button points at the empty grid`)
}

let scanned = 0
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|mjs)$/.test(name)) {
      scanned += 1
      if (/could be yours/.test(readFileSync(p, 'utf8'))) fail('4', `${p.replace(/\\/g, '/')} says 'could be yours'`)
    }
  }
}
walk('src')

console.log(`${TAG} checked ${DISCOVERY_TEMPLATES.length} discovery templates, ${PLACE_PAGES.length} place pages, ${scanned} source files`)
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every empty discovery collection is one honest line and a link to real events; nothing points at it`)
