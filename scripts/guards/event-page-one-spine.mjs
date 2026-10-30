/**
 * EVERY EVENT PAGE CARRIES THE SAME SECTIONS IN THE SAME ORDER. A build-failing guard (the CONTROLLER's 10:05 of
 * 31 October 2026, car 22, window 6; window 3 builds the section spine it reads).
 *
 * WHY THIS EXISTS. On 31 October Michael's ticketed event page showed its map and the AMCF page showed none: a free walk
 * in event left the main template at src/app/events/[slug]/page.tsx ('if (isWalkIn(event)) return <WalkInEventPage ...'),
 * and its own template had been written without a map. Two templates drift; a visitor to one admission state silently
 * lost a section the other kept.
 *
 * WHAT IT HOLDS, reading the source of every event template:
 *   1. each shared section is drawn exactly once: hero, facts, map, getting-there, organiser, marked either as
 *      <EventSection name="..."> (window 3's spine) or by a literal data-event-section="..." attribute, or drawn by a
 *      shared component that marks them itself (<EventVenueSection>: map, then getting-there, checked in its own file);
 *   2. in that order, in every template;
 *   3. none of them behind an admission-state test (isWalkIn, isExternallyTicketed, eventIsPaid, isOrganiserSellable or a
 *      cta.state comparison opened as a JSX condition just before the marker): only the action block may differ by
 *      admission state;
 *   4. FOLD (OFF until the controller rules fold now or after): the main page returns no other page template early.
 *
 * WHAT IT CANNOT SEE: a section drawn by a component it does not name, or a test written further than 300 characters
 * before a marker. It reads the markers the spine writes, rather than guessing at every way a section could be drawn.
 *
 * Run: node scripts/guards/event-page-one-spine.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[event-page-one-spine]'

const MAIN = 'src/app/events/[slug]/page.tsx'
const TEMPLATES = [MAIN, 'src/components/events/walk-in/walk-in-event-page.tsx']
const SECTIONS = ['hero', 'facts', 'map', 'getting-there', 'organiser']
const ADMISSION_TESTS = /\b(isWalkIn|isExternallyTicketed|eventIsPaid|isOrganiserSellable)\s*\(|\bcta\.state\b/
const FOLD = false
// A shared component that draws several sections itself (window 3's spine): where a template draws it, the template
// draws those sections, in the order the component marks them; the component is read and checked on its own.
const COMPOSITES = [
  { tag: '<EventVenueSection', file: 'src/components/events/event-page/event-venue-section.tsx', sections: ['map', 'getting-there'] },
]

const faults = []
let read = 0
let checked = 0

/** Every place the section is marked, by either form, or by a shared component that draws it. */
function marksOf(text, name) {
  const forms = [`<EventSection name="${name}"`, `data-event-section="${name}"`]
  const at = []
  for (const form of forms) {
    for (let i = text.indexOf(form); i !== -1; i = text.indexOf(form, i + 1)) at.push(i)
  }
  // A component tag counts only as a whole name: <EventVenueSection, never <EventVenueSectionGone.
  for (const c of COMPOSITES) {
    if (!c.sections.includes(name)) continue
    for (const m of text.matchAll(new RegExp(`${c.tag}(?![A-Za-z0-9_])`, 'g'))) at.push(m.index)
  }
  return at.sort((a, b) => a - b)
}

/** True when an admission-state test opens a JSX condition in the 300 characters before `at`. */
function behindAdmission(text, at) {
  const before = text.slice(Math.max(0, at - 300), at)
  const opener = Math.max(before.lastIndexOf('&& ('), before.lastIndexOf('? ('))
  if (opener === -1) return false
  return ADMISSION_TESTS.test(before.slice(Math.max(0, opener - 160), opener + 4))
}

for (const rel of TEMPLATES) {
  const path = join(ROOT, rel)
  if (rel !== MAIN && !existsSync(path)) continue // folded into the one page: nothing left to read
  let text
  try {
    text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    read++
  } catch (err) {
    faults.push(`${rel} could not be read (${err.code ?? err.message}); a guard that read less than its files cannot pass`)
    continue
  }
  let last = -1
  let lastName = null
  for (const name of SECTIONS) {
    checked++
    const marks = marksOf(text, name)
    if (marks.length === 0) {
      faults.push(`${rel} draws no '${name}' section (no <EventSection name="${name}"> or data-event-section="${name}")`)
      continue
    }
    if (marks.length > 1) faults.push(`${rel} draws the '${name}' section ${marks.length} times; each shared section once`)
    // Two sections drawn by one shared component sit at the same place; the component's own order is checked below.
    const sameComposite = COMPOSITES.some((c) => c.sections.includes(name) && c.sections.includes(lastName))
    if (marks[0] < last || (marks[0] === last && !sameComposite)) faults.push(`${rel} draws '${name}' out of order; the order is ${SECTIONS.join(', ')}`)
    last = Math.max(last, marks[0])
    lastName = name
    for (const at of marks) {
      if (behindAdmission(text, at)) faults.push(`${rel} draws '${name}' behind an admission-state test; only the action may differ`)
    }
  }
  if (FOLD && rel === MAIN && /return\s*<\s*[A-Z]\w*EventPage\b/.test(text)) {
    faults.push(`${rel} returns another event template early; every admission state renders through the one page`)
  }
}

for (const c of COMPOSITES) {
  let text
  try {
    text = readFileSync(join(ROOT, c.file), 'utf8').replace(/\r\n/g, '\n')
    read++
  } catch {
    // Not built yet: a template drawing it then fails above, since the tag is missing; nothing more to judge here.
    continue
  }
  let last = -1
  for (const name of c.sections) {
    checked++
    const at = []
    for (const form of [`<EventSection name="${name}"`, `data-event-section="${name}"`]) {
      for (let i = text.indexOf(form); i !== -1; i = text.indexOf(form, i + 1)) at.push(i)
    }
    if (at.length !== 1) faults.push(`${c.file} marks '${name}' ${at.length} time(s); its sections are each marked once`)
    else if (at[0] < last) faults.push(`${c.file} marks '${name}' out of order; it draws ${c.sections.join(', ')}`)
    else last = at[0]
  }
}

console.log(`${TAG} read ${read} file(s), checked ${checked} section mark(s); fold clause ${FOLD ? 'ON' : 'OFF'}`)

if (faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${faults.length} fault(s):`)
  for (const f of faults) console.error(`    ${f}`)
  console.error('')
  console.error("  On 31 October Michael's event page showed its map and the AMCF page showed none, because the")
  console.error('  walk-in template was drawn on its own. Every event page draws hero, facts, map, getting there')
  console.error('  and organiser, once each, in that order; only the action block differs by admission state.')
  process.exit(1)
}

declareWork('event-page-one-spine', {
  did: { 'file read': read, 'section mark checked': checked },
  found: { fault: 0 },
  zeroIsFine: { fault: 'every event template drawing the five shared sections once, in order, is the goal state' },
  exitOnZero: false,
})

console.log(`${TAG} PASS - every event template draws ${SECTIONS.join(', ')} once each, in that order.`)
process.exit(0)
