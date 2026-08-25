/**
 * AN EVENT PAGE CAN NEVER SHIP WITHOUT ITS STRUCTURED DATA.
 *
 * Founder brief, 23 August 2026: "Guard it, so an event page can never ship
 * without valid structured data."
 *
 * WHAT THIS GUARD CAN AND CANNOT SEE, stated plainly so nobody mistakes it for
 * more than it is:
 *
 *   IT CAN see that the event page still RENDERS the schema component, that the
 *   component still exists and still exports the pure payload builder, and that
 *   the page still feeds it the lineup. Those are the wiring failures. Every one
 *   of them is a silent deletion: the page keeps rendering, the tests that do
 *   not look at markup keep passing, and the pages simply stop being eligible.
 *
 *   IT CANNOT judge whether the payload is VALID for a given event. That is not
 *   a source-text question, and pretending otherwise would produce a guard that
 *   greps for property names and passes on an empty string. Validity is proven
 *   against Google's published required set in
 *   tests/unit/seo/event-structured-data.test.ts, which runs the real payload
 *   builder through the same validator the deployed-site audit uses
 *   (scripts/verify/event-structured-data-audit.mjs).
 *
 * So: this guard holds the WIRING, the unit test holds the CONTENT, and the
 * audit script holds the DEPLOYED TRUTH. All three are needed and none of them
 * replaces another.
 *
 * The rules being protected are Google's, cited in the audit script's header
 * (fetched 2026-08-23): name, startDate and location are REQUIRED for an event
 * page to be eligible for the event experience at all.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

const EVENT_PAGE = 'src/app/events/[slug]/page.tsx'
const EMITTER = 'src/components/features/events/event-schema-jsonld.tsx'
const PAYLOAD_TEST = 'tests/unit/seo/event-structured-data.test.ts'
const AUDIT = 'scripts/verify/event-structured-data-audit.mjs'

/** Strips line and block comments so a mention in prose is not a match. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//'))
    .join('\n')
}

const failures = []
const scanned = []

function read(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    failures.push(`${rel} does not exist. The event structured-data path is broken.`)
    return null
  }
  const raw = readFileSync(abs, 'utf8')
  scanned.push(`${rel} (${raw.split('\n').length} lines)`)
  return code(raw)
}

const page = read(EVENT_PAGE)
const emitter = read(EMITTER)
read(PAYLOAD_TEST)
read(AUDIT)

if (page !== null) {
  if (!/<EventSchemaJsonLd\b/.test(page)) {
    failures.push(
      `${EVENT_PAGE} does not render <EventSchemaJsonLd>. Every event page would ` +
        `ship with no Event structured data and become ineligible for Google's ` +
        `event experience, with no other symptom.`,
    )
  }
  if (!/performers=\{/.test(page)) {
    failures.push(
      `${EVENT_PAGE} no longer passes \`performers\` to <EventSchemaJsonLd>. The ` +
        `lineup is loaded on this page already; not passing it is exactly the ` +
        `defect the 23 August 2026 audit found on 36 of 36 production pages.`,
    )
  }
}

if (emitter !== null) {
  if (!/export function buildEventSchemaPayload\b/.test(emitter)) {
    failures.push(
      `${EMITTER} no longer exports buildEventSchemaPayload. The payload would ` +
        `stop being testable, and ${PAYLOAD_TEST} could no longer prove validity.`,
    )
  }
  if (!/export function EventSchemaJsonLd\b/.test(emitter)) {
    failures.push(`${EMITTER} no longer exports EventSchemaJsonLd.`)
  }
  // The three REQUIRED properties, by name, in the payload builder.
  for (const required of ['name:', 'startDate:', 'location:']) {
    if (!emitter.includes(required)) {
      failures.push(
        `${EMITTER} no longer sets \`${required}\`. Google lists name, startDate ` +
          `and location as REQUIRED; without all three the page is not eligible.`,
      )
    }
  }
  // The empty-string regression that shipped once already.
  if (/venue_\w+\s*\?\?\s*''/.test(emitter)) {
    failures.push(
      `${EMITTER} writes an empty string for an absent venue field (\`?? ''\`). ` +
        `An empty string is a positive claim that the value is empty, not an ` +
        `absent optional. Use compact() and omit the key.`,
    )
  }
}

console.log('[event-structured-data] what this guard scanned:')
for (const s of scanned) console.log(`    - ${s}`)
console.log(
  '[event-structured-data] checks: page renders the emitter, page passes the ' +
    'lineup, emitter exports the builder and the component, the three REQUIRED ' +
    'properties are set, and no venue field is emitted as an empty string.',
)
console.log(
  '[event-structured-data] NOT checked here (by design): whether a given ' +
    `payload is valid. That is ${PAYLOAD_TEST}, which runs the real builder ` +
    `through the validator in ${AUDIT}.`,
)

if (failures.length) {
  console.error('\n[event-structured-data] FAIL')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

declareWork('event-structured-data', {
  did: { 'wiring point checked': scanned.length },
  found: { break: 0 },
})
console.log('[event-structured-data] PASS - the event structured-data path is wired end to end.')
