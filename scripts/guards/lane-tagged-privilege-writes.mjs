/**
 * A SCRIPT THAT GRANTS A PRIVILEGE ON SHARED TEST MAY ONLY DO IT TO ITS OWN
 * LANE'S ROWS.
 *
 * WHY THIS EXISTS, written from the incident rather than from a principle.
 *
 * 14 September 2026. `scripts/verify/fo1-founding-offer-drive.mjs` enumerates
 * every sellable paid event on TEST and grants founding terms to one of them,
 * exercises the offer, then revokes. It took the FIRST candidate. Three lanes
 * share TEST vkapkibzokmfaxqogypq, and on the day it was read the candidate
 * list was:
 *
 *     8 x Refund Proof Presents ...     lane A's refund fixtures
 *     4 x Northside Sound lane-c ...    lane C's fixtures
 *     2 x Lane B FO1 Founding ...       lane B's own
 *
 * So lane B's drive had been granting and revoking founding terms on other
 * lanes' rows, and seven of lane A's refund fixtures were found holding
 * founding windows nobody in lane A had granted.
 *
 * THE DAMAGE IS NOT ETIQUETTE. A founding window sets the platform fee to
 * ZERO, and a zero keep is refused at the payment step today
 * (`application-fee.ts`, the BORDER in REVIEW-QUEUE-B.md). A window left on
 * another lane's CHARGE fixture makes that lane's proof fail at Stripe for a
 * reason that is nowhere in that lane's tree, which is the most expensive kind
 * of failure there is: one whose cause is not in the place you are looking.
 *
 * WHAT IT CHECKS. For every file under `scripts/` that calls one of the
 * privilege RPCs below, the file must ALSO restrict its subject with a lane
 * tag: a literal `lane-b`, `lane-a` or `lane-c` used in a test, filter or
 * refusal. The rule is that a row says on sight whose it is and a script
 * proves the row is its own before it writes.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, so the gap is on the record. It does
 * not prove the tag is applied to the RIGHT value, and it cannot: that is what
 * the drive's own `fo1.setup.both-rows-are-lane-b` check and
 * `scripts/verify/fo1-target-collision-drill.mjs` are for, and they run against
 * the real database where this guard only reads text. It also does not police
 * ordinary writes to rows a script CREATED in the same run, because a script
 * that builds its own fixture and writes to it is the behaviour this guard
 * wants, not the behaviour it is stopping.
 *
 * THE RPC LIST IS PRINTED ON EVERY RUN with the number of callers each one has,
 * so it cannot rot into an unexamined list: an entry matching nothing says so.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SCRIPTS = join(ROOT, 'scripts')
const TAG = '[lane-tagged-privilege-writes]'

/**
 * RPCs that hand a row something valuable. Adding one here is the whole cost of
 * covering it.
 *
 * `admin_set_founding_waiver` grants or revokes a Founding Organiser window,
 * which is the platform fee set to zero for six months. It is the one the
 * incident was about.
 */
export const PRIVILEGE_RPCS = ['admin_set_founding_waiver']

/**
 * A lane tag used as a PREDICATE: a regex literal like `/lane-b/i`, or a lane
 * string handed to includes, startsWith, indexOf or a comparison.
 *
 * NAMING A ROW `lane-b-something` IS NOT A RESTRICTION, and the second version
 * of this guard could not tell those apart either. The FO1 offer drive names
 * every row it creates `lane-b-...` and always did, including on the morning it
 * was granting founding windows to lane A's fixtures: eleven lane tags in its
 * code, ten of them names and exactly one of them a filter. A guard satisfied
 * by the names would have passed that file too.
 *
 * So the tag has to be being ASKED A QUESTION WITH, not just printed.
 */
const LANE_PREDICATE = [
  /\/[^/\n]*lane-\[?[abc]/i,
  /(?:includes|startsWith|indexOf|endsWith)\s*\(\s*['"`][^'"`\n]*lane-[abc]/i,
  /[=!]==?\s*['"`]lane-[abc]/i,
]

export function callsPrivilegeRpc(text) {
  return PRIVILEGE_RPCS.filter(name => new RegExp(`rpc\\(\\s*['"\`]${name}['"\`]`).test(text))
}

/**
 * COMMENTS ARE NOT A RESTRICTION, and the first version of this guard could not
 * tell the difference. It searched the whole file, so a paragraph EXPLAINING
 * that three lanes share TEST satisfied it just as well as a filter that acts
 * on it. Every file this guard judges is one that writes about lanes at length,
 * so that version would have passed the exact file it was written to catch.
 *
 * The comments are stripped first and the tag must survive in the CODE.
 */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

export function restrictsToItsOwnLane(text) {
  const code = stripComments(text)
  return LANE_PREDICATE.some(re => re.test(code))
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(mjs|js|ts)$/.test(entry)) out.push(full)
  }
  return out
}

function main() {
  const files = walk(SCRIPTS)
  const problems = []
  const callersOf = Object.fromEntries(PRIVILEGE_RPCS.map(n => [n, 0]))
  let checked = 0

  for (const full of files) {
    const text = readFileSync(full, 'utf8')
    const used = callsPrivilegeRpc(text)
    if (used.length === 0) continue
    checked += 1
    for (const name of used) callersOf[name] += 1
    if (!restrictsToItsOwnLane(text)) {
      problems.push(
        `${relative(ROOT, full).replace(/\\/g, '/')}: calls ${used.join(', ')} and never restricts its ` +
          `subject to a lane. Three lanes share TEST, and this RPC sets a platform fee to zero.`,
      )
    }
  }

  console.log(`${TAG} privilege RPCs, printed every run on purpose:`)
  for (const name of PRIVILEGE_RPCS) {
    const n = callersOf[name]
    console.log(`${TAG}   ${name}: ${n} caller(s)${n === 0 ? '  STALE: it matches nothing now, delete it or say why it stays' : ''}`)
  }

  declareWork('lane-tagged-privilege-writes', {
    did: { 'script read': files.length, 'script granting a privilege': checked },
    found: { 'privilege write that names no lane': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL - ${problems.length} script(s) grant a privilege on shared TEST without saying whose row it is:`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  A founding window sets the platform fee to zero, and a zero keep is refused')
    console.error('  at the payment step. Left on another lane\'s charge fixture it makes that')
    console.error('  lane\'s proof fail at Stripe for a reason that is not in that lane\'s tree.')
    console.error('  Filter the subject to rows tagged for this lane, or build your own.')
    process.exitCode = 1
    return
  }
  console.log(`${TAG} PASS - ${checked} of ${files.length} script(s) grant a privilege, and every one restricts its subject to its own lane.`)
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()

export { main }
