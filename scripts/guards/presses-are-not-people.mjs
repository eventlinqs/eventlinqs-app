/**
 * A PRESS IS NEVER CALLED A PERSON (the PM's 02:38 of 18 November 2026, item 5; WINDOW 5A).
 *
 * The outbound presses (share_link_events kind 'outbound', a press on through to an organiser's booking page) are not
 * shown to count people: on 18 November production held 2,013 of them against 701 page views, in bursts of 217, 236 and
 * 331 a day, with a new visitor hash on 1,801 of the 2,013 rows. Four surfaces said them as people: the organiser's reach
 * page ('EventLinqs sent 12 people to your tickets'), the night report ('EventLinqs sent N people on to your booking
 * page'), the sell-through report ('N people went on from it to your booking page') and two admin lines. A number said
 * to a stranger as people is a claim, so every surface says presses until the presses are proved to count people.
 *
 * This fails the build where a line in src/ (comments stripped, strings kept) puts 'people' or 'person' beside the words
 * of a press: sent or went on or pressed, the booking page or site, 'to your tickets'; and, in post copy, a link said to
 * count who it sends (the PM's 06:39 of 18 November 2026, item 3).
 *
 * WHAT THIS CANNOT SEE, said so it is not mistaken for coverage: a sentence built across lines, or a word for people it
 * does not name ('visitors', 'fans'). The words a press is said in live in each surface; this reads them all.
 *
 * Run: node scripts/guards/presses-are-not-people.mjs
 */
import { relative, resolve } from 'node:path'
import { readSource, sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[presses-are-not-people]'
const ROOT = process.cwd()
// A press said as a movement on to a booking page or the tickets; a booking page merely named is not a press.
const PRESS = String.raw`(?:(?:on |through )?to (?:your |their |the )?(?:own )?booking (?:page|site)s?\b|to your tickets\b|to book\b|pressed (?:on|out|through)\b|went on\b|sent on\b|heading to the tickets\b)`
// A word for people as a reader reads it: never a property ('pressesOut.people' is code, not words).
const PEOPLE = String.raw`(?<![.\w])(?:people|person)\b`
const RULES = [
  new RegExp(String.raw`${PEOPLE}[^\n]{0,60}${PRESS}`, 'i'),
  // The press phrase first, the people word after it: a line needs both, in either order, close together.
  new RegExp(String.raw`${PRESS}[^\n]{0,60}${PEOPLE}`, 'i'),
  /\$\{who\}\s+to your tickets/,
  // Post copy too (the PM's 06:39 of 18 November 2026, item 3): a link or a post said to count who it sends or brings
  // ('a link that counts who it sends') is the same claim, made before the openers count is proved to count people.
  /\bcounts? (?:who|the people)\b[^\n]{0,40}\b(?:sends?|sent|brings?|brought)\b/i,
  /\bwho it (?:sends|brings)\b/i,
]

const files = sourceFiles(ROOT)
const failures = []
let read = 0
for (const file of files) {
  const rel = relative(ROOT, resolve(ROOT, file)).split('\\').join('/')
  if (!rel.startsWith('src/')) continue
  read += 1
  const lines = readSource(resolve(ROOT, file)).withStrings.split('\n')
  lines.forEach((line, i) => {
    if (RULES.some((r) => r.test(line))) failures.push(`${rel}:${i + 1} calls a press a person: ${line.trim().slice(0, 140)}`)
  })
}

declareWork('presses-are-not-people', {
  did: { 'source file': read },
  found: { failure: failures.length },
})
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} line(s) say a press on to a booking page as a person. Say presses until the presses are proved to count people.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${read} source files; no line says a press on to a booking page as a person.`)
