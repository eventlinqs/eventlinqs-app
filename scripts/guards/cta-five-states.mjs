/**
 * THE FIVE EVENT STATES SAY ONE THING EVERYWHERE (the release checklist of 28 October 2026, section E, release
 * blocking: E1 to E8). src/lib/events/cta.ts is the one call to action; tests/unit/events/cta-five-states.test.ts drives
 * all five states through every surface and runs in the gate's suite. This guard holds the shape that suite relies on:
 *
 * 1. Every surface asks the one function. The Launch Kit (kit-artefacts.ts and its poster), the captions, the social
 *    card, the social planner, the event page's panel and hero, and the outside button's label each reach ctaFor, by
 *    importing it or the broadcast price line built on it. A surface that stops asking is how a second rule appears.
 * 2. The states' own words are written once. "View tickets at", "Free · just turn up", "Free · register first" and
 *    "Free, registration required" appear in src only in src/lib/events/cta.ts, and the old outside wording "Get
 *    tickets on" nowhere (E4: "View tickets at <provider>").
 * 3. Never free because no price is stored (E6): no display surface falls back to "Free entry" when a price is
 *    missing (a `?? 'Free entry'`).
 *
 * It reads the tree, never the database.
 */
import { join } from 'node:path'
import { readSource, sourceFiles, lineAt } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[cta-five-states]'
const ROOT = process.cwd()
const HOME = 'src/lib/events/cta.ts'

/** Each surface, and the import that shows it asks the one function. */
const SURFACES = [
  ['src/lib/broadcast/kit-artefacts.ts', /from '@\/lib\/broadcast\/price-line'/],
  ['src/app/api/organiser/events/[id]/poster/route.ts', /from '@\/lib\/broadcast\/price-line'/],
  ['src/lib/broadcast/price-line.ts', /from '@\/lib\/events\/cta'/],
  ['src/lib/broadcast/captions.ts', /from '@\/lib\/events\/cta'/],
  ['src/lib/social/plan.ts', /from '@\/lib\/events\/cta'/],
  ['src/lib/listings/ticket-panel.ts', /from '@\/lib\/events\/cta'/],
  ['src/lib/listings/outbound.ts', /from '@\/lib\/events\/cta'/],
  ['src/app/events/[slug]/page.tsx', /from '@\/lib\/events\/cta'/],
]
const OWN_WORDS = ['View tickets at', 'Free · just turn up', 'Free · register first', 'Free, registration required']
const RETIRED = ['Get tickets on']
const FREE_FALLBACK = /\?\?\s*['"`]Free entry['"`]/

const failures = []
const sources = sourceFiles(ROOT)
const byRel = new Map(sources.map((f) => [f.replace(/\\/g, '/'), f]))

if (!byRel.has(HOME)) failures.push(`${HOME} is missing: the one call to action has moved or gone`)

for (const [rel, asks] of SURFACES) {
  const file = byRel.get(rel)
  if (!file) {
    failures.push(`${rel} is missing; a surface the checklist names has moved, so this list must follow it`)
    continue
  }
  const { withStrings } = readSource(join(ROOT, file))
  if (!asks.test(withStrings)) failures.push(`${rel} no longer asks the one call to action (${asks.source})`)
}

let scanned = 0
for (const [rel, file] of byRel) {
  scanned += 1
  const { withStrings } = readSource(join(ROOT, file))
  if (rel !== HOME) {
    for (const words of OWN_WORDS) {
      const at = withStrings.indexOf(words)
      if (at !== -1) failures.push(`${rel}:${lineAt(withStrings, at)} writes "${words}", which only ${HOME} may write`)
    }
  }
  for (const words of RETIRED) {
    const at = withStrings.indexOf(words)
    if (at !== -1) failures.push(`${rel}:${lineAt(withStrings, at)} says "${words}"; an outside event's action is "View tickets at <provider>" (E4)`)
  }
  const m = FREE_FALLBACK.exec(withStrings)
  if (m) failures.push(`${rel}:${lineAt(withStrings, m.index)} falls back to "Free entry" when no price is stored (E6)`)
}

declareWork('cta-five-states', { did: { 'source file': scanned, surface: SURFACES.length }, found: { failure: failures.length } })
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS: ${SURFACES.length} surfaces ask ${HOME}; the states' words are written only there; no "Free entry" fallback in ${scanned} files.`)
