/**
 * NO FILLER IN AN EVENT COLLECTION (Lawal's 'EMERGENCY DISCOVERY, PHOTOGRAPHY AND PRODUCTION QUALITY CORRECTION' of
 * 31 October 2026, 17:44, the CONTROLLER's 17:55 order 1). On production the home rails, the /events popular rail, the
 * browse rails and the venues rail topped a thin track up with 'Open slot' invitation cards ('The next big night here
 * is yours', 'Performers, this stage is open', 'Know someone who runs ... nights?'), and drew three of them where a rail
 * had no event at all. A public collection draws only real published events, fewer cards when inventory is thin, and an
 * empty rail is hidden; no other filler takes its place. /gigs, the performers' own journey, keeps its own words.
 *
 * The clauses, each read from the source:
 *   1. No file under src imports an invitation card or names its fill (InvitationCard, invitationFillCount,
 *      INVITATION_ANGLE_ORDER).
 *   2. The invitation words are drawn by no public file: only /gigs and the organiser's own dashboard (whose referral
 *      panel asks a signed in organiser to invite another) may carry them.
 *   3. No file that draws a rail (SnapRail, SnapRailScroller) makes a card from a count: every card in a rail is mapped
 *      from a list of records, never from Array.from({ length }).
 *   4. The two shared event rails hide when empty: EventRailSection and RecommendedRail each return null at zero
 *      events, and EventRailSection carries no empty-state card.
 *
 * A root may be passed as the first argument, so the drill can run it against a tree holding the old fill.
 * Exits 1 naming each clause that fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[no-filler-in-event-collections]'
const ROOT = process.argv[2] ?? process.cwd()
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
/** Comments out, so a sentence that tells this history is not mistaken for the fill. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

function files(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((e) => files(join(path, e)))
}

const rel = (f) => relative(ROOT, f).split(sep).join('/')
const sources = files(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))
const FILL_NAMES = /\b(InvitationCard|invitationFillCount|INVITATION_ANGLE_ORDER)\b|invitation-card['"]/
const FILL_WORDS = /Open slot<|['"`>]\s*Open slot\b|this stage is open|Invite an organiser|night here is yours|Know someone who runs/
const PRIVATE_OR_GIGS = /^src\/(app\/gigs\/|app\/\(dashboard\)\/|components\/dashboard\/)/
const RAIL = /<SnapRail(Scroller)?\b/

let rails = 0
for (const file of sources) {
  const path = rel(file)
  const src = code(readFileSync(file, 'utf8'))
  const names = FILL_NAMES.exec(src)
  if (names) fail('1', `${path} names ${names[0]}, the invitation card fill`)
  if (!PRIVATE_OR_GIGS.test(path)) {
    const words = FILL_WORDS.exec(src)
    if (words) fail('2', `${path} draws the invitation words '${words[0].replace(/^['"`>]\s*/, '')}'`)
  }
  if (RAIL.test(src)) {
    rails += 1
    if (/Array\.from\(\s*\{\s*length\b/.test(src)) fail('3', `${path} draws a rail and makes cards from a count (Array.from({ length }))`)
  }
}

const shared = [
  ['src/components/features/home/event-rail-section.tsx', 'EventRailSection'],
  ['src/components/features/events/m5-recommended-rail.tsx', 'RecommendedRail'],
]
for (const [path, name] of shared) {
  const file = join(ROOT, path)
  if (!existsSync(file)) {
    fail('4', `${path} is missing, so ${name} cannot be judged`)
    continue
  }
  const src = code(readFileSync(file, 'utf8'))
  if (!/if \(events\.length === 0\) return null/.test(src)) fail('4', `${name} does not hide when it has no event`)
  if (/emptyTitle|emptyBody/.test(src)) fail('4', `${name} still carries an empty-state card`)
}

console.log(`${TAG} did ${sources.length} source file(s) read, ${rails} rail file(s) and ${shared.length} shared rails judged`)
declareWork('no-filler-in-event-collections', {
  did: { 'source file read': sources.length, 'rail file judged': rails, 'shared rail judged': shared.length },
  found: { 'clause failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every public collection draws real events only, and an empty rail is hidden`)
