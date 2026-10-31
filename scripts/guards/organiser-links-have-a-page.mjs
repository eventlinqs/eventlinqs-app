/**
 * EVERY ORGANISER LINK HAS A PAGE BEHIND IT (the CONTROLLER's 18:22 of 31 October 2026, from WINDOW 4's car 26 read
 * back: an ended EventLinqs listing said 'See upcoming events from this organiser' and linked
 * /organisers/eventlinqs-listings, which answers 404). The listings organisation has no public page (WI2 ruling A,
 * src/lib/listings/shown-organiser.ts), so no public surface may link it.
 *
 * The clauses, each read from the source:
 *   1. Every public file that builds an /organisers/<slug> link asks whether the organiser is shown: it calls
 *      shownOrganiser or isListingsOrganisation, or links a shown organiser's slug (an import alone is not asking). The reviewed exceptions are named below with
 *      their reasons, and a reviewed file that no longer builds the link is reported.
 *   2. The ended-event banner, which links whatever handle it is given, is handed the shown organiser's slug by every
 *      caller, never the raw organisation's.
 *
 * A root may be passed as the first argument for a drill. Exits 1 naming each clause that fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[organiser-links-have-a-page]'
const ROOT = process.argv[2] ?? process.cwd()
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

/** Files that build the link for a reason other than showing an event's organiser, each reviewed. */
const REVIEWED = {
  'src/app/organisers/[handle]/page.tsx': 'the organiser page names its own address; it refuses the listings organisation itself',
  'src/components/features/organisers/organiser-schema-jsonld.tsx': 'the organiser page\'s own structured data',
  'src/components/features/events/event-state-banner.tsx': 'links the handle it is given; clause 2 judges its callers',
  'src/components/features/home/featured-organisers-section.tsx': 'imported by no page',
  'src/lib/events/revalidate-event.ts': 'a path to refresh, never a link',
  'src/lib/stripe/business-profile.ts': 'an onboarded organiser\'s own Stripe profile; the listings organisation never onboards',
}
const PRIVATE = /^src\/(app\/admin\/|app\/\(dashboard\)\/)/
const BUILDS = /\/organisers\/\$\{/
const ASKS = /\bshownOrganiser\(|\bisListingsOrganisation\(|\bshown\.slug\b/

function files(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((e) => files(join(path, e)))
}

const rel = (f) => relative(ROOT, f).split(sep).join('/')
const sources = files(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))
let builders = 0
const reviewedSeen = new Set()
for (const file of sources) {
  const path = rel(file)
  if (PRIVATE.test(path)) continue
  const src = code(readFileSync(file, 'utf8'))
  if (!BUILDS.test(src)) continue
  builders += 1
  if (REVIEWED[path]) {
    reviewedSeen.add(path)
    continue
  }
  if (!ASKS.test(src)) fail('1', `${path} links /organisers/<slug> without asking whether the organiser is shown (shownOrganiser or isListingsOrganisation)`)
}
for (const path of Object.keys(REVIEWED)) {
  if (!reviewedSeen.has(path)) console.log(`${TAG} reviewed exception no longer builds the link, remove it: ${path}`)
}

let callers = 0
for (const file of sources) {
  const src = code(readFileSync(file, 'utf8'))
  for (const m of src.matchAll(/<EventStateBanner\b[\s\S]*?\/>/g)) {
    callers += 1
    const handle = /organiserHandle=\{([^}]*(?:\}[^}]*)?)\}/.exec(m[0])
    if (handle && !/shownOrganiser\(/.test(handle[1])) fail('2', `${rel(file)} hands EventStateBanner the raw organisation's slug (${handle[1].trim()})`)
  }
}

console.log(`${TAG} did ${sources.length} source file(s) read, ${builders} organiser link builder(s) and ${callers} banner caller(s) judged`)
declareWork('organiser-links-have-a-page', {
  did: { 'source file read': sources.length, 'link builder judged': builders },
  found: { 'clause failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every public organiser link has a page behind it`)
