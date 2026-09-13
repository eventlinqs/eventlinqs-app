/**
 * ONE DOOR FOR A BUILD GUARD'S DATABASE READ.
 *
 * A build-time guard that reads the database over the network must do it
 * through `scripts/guards/lib/db-read.mjs`, never with its own `fetch`.
 *
 * ---------------------------------------------------------------------------
 * WHY. Twice on 13 September 2026, four hours apart, a push was blocked by a
 * guard reporting `fetch failed` as a finding.
 *
 *   The first was `curated-categories-exist`, which read the database exactly
 *   once and so could not tell a down database from a dropped packet. It was
 *   given a retry. The survey that went with that fix asked "which guards call
 *   createClient", found exactly one, and concluded the class was closed.
 *
 *   That was the wrong question, and the very next push proved it:
 *   `event-lifecycle-installed` and `community-layer-protected` failed
 *   together, both on `fetch failed`, both reaching the database by a RAW
 *   fetch that the survey never looked for. Two more guards
 *   (`door-live-published`, `ledger-append-only`,
 *   `platform-notifications-installed`) carried a byte-identical copy of the
 *   same probe and were simply waiting their turn.
 *
 * The lesson is not "retry harder". It is that a rule kept by habit is kept
 * until someone copy-pastes, and five of these were copy-pastes of each other.
 * The door is the fix; this guard is what keeps it shut.
 *
 * WORSE THAN THE FLAKINESS, and the reason this is blocking rather than a
 * lint: `event-lifecycle-installed` printed
 *
 *     event_lifecycle_guards() could not be asked (fetch failed);
 *     apply 20260906000001_... and 20260906000002_... to this project
 *
 * on a project where both migrations had been applied for a week. It described
 * a transport failure as a missing migration. The shared door cannot do that,
 * because it hands back the KIND of failure and `couldNotLook()` writes the
 * sentence.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT JUDGES. Any build-time script under scripts/guards/ that names a
 * Supabase REST path (`/rest/v1/`) must import from `./lib/db-read.mjs`. That
 * is narrow on purpose: it is the exact shape all five copies took, it is
 * decidable from source, and it cannot fire on a script that does not talk to
 * PostgREST at all.
 *
 * WHAT IT CANNOT JUDGE, said plainly. It does not see a read through some
 * other transport, it does not see `scripts/verify/` or `scripts/ops/` (those
 * are drives, not build gates, and a drive that cannot reach the database
 * fails visibly in front of a person), and it cannot tell whether a guard
 * INTERPRETS the outcome correctly once it has it. The unit test beside it
 * covers the interpretation.
 */
import { sourceFiles, readSource, lineAt } from './lib/source.mjs'

const NAME = '[one-db-read-door]'
const DOOR = 'lib/db-read.mjs'

/*
 * THE TWO DOORS, and why there are two rather than one.
 *
 * `lib/db-read.mjs` is the door written on 13 September 2026 after five
 * copy-pasted probes were found sharing one defect.
 *
 * `lib/schema-probe.mjs` is OLDER and already did the right thing: it retries
 * on FETCH_FAILED and on a gateway status, and it reports an unreachable
 * database as `unknown` rather than as a finding. Rewriting it to import the
 * newer door would be churn on a careful implementation, and churn on
 * something that works is how working things break.
 *
 * So it is exempt BY NAME, and the exemption is CHECKED rather than trusted:
 * if its retry ever disappears, the assertion below fails. An exemption nobody
 * re-examines is just a hole with a comment over it.
 */
const DOORS = ['scripts/guards/lib/db-read.mjs', 'scripts/guards/lib/schema-probe.mjs']
const EXEMPT = new Set(DOORS)

const findings = []
let scanned = 0
let readers = 0

const files = sourceFiles(process.cwd(), { extensions: ['.mjs'], subdir: 'scripts/guards' })

for (const file of files) {
  const normalised = file.replace(/\\/g, '/')
  if (EXEMPT.has(normalised)) continue
  // Comments stripped, strings kept: the REST path lives inside a template
  // literal, and this file's own prose about the banned shape must not count.
  const src = readSource(file).withStrings
  scanned++
  const rest = /\/rest\/v1\//.exec(src)
  if (!rest) continue
  readers++
  if (src.includes(DOOR) || src.includes('schema-probe.mjs')) continue
  findings.push({
    file: normalised,
    line: lineAt(src, rest.index),
    detail:
      `names a Supabase REST path but does not import ${DOOR}. A hand-rolled fetch cannot ` +
      `distinguish a dropped packet from an answer, and every guard that tried reported a ` +
      `transport failure as a finding.`,
  })
}

console.log(`${NAME} scanned ${scanned} build guard(s), ${readers} of them read the database over the network.`)

if (files.length === 0 || scanned === 0) {
  console.error(
    `${NAME} FAIL - this guard scanned nothing, so it proved nothing. ` +
      `A guard that finds zero units is a broken guard, not a pass.`,
  )
  process.exit(1)
}

/*
 * THE DOOR IS LOAD-BEARING, so its absence is a failure in its own right.
 *
 * Note what is NOT counted here. Once a guard goes through the door it stops
 * naming a REST path at all, because the door owns the path - so `readers`
 * falls towards zero as the fix succeeds, and a check on `readers` would go
 * green by everything being deleted just as readily as by everything being
 * fixed. The positive signal is how many guards IMPORT a door.
 */
const doorUsers = files.filter((f) => {
  const n = f.replace(/\\/g, '/')
  // Not this file: it names the door in order to police it, which is not use.
  if (EXEMPT.has(n) || n.endsWith('one-db-read-door.mjs')) return false
  return readSource(f).withStrings.includes(DOOR)
}).length

if (doorUsers === 0) {
  console.error(
    `${NAME} FAIL - no build guard imports ${DOOR}, and six did when this was written. ` +
      `Either the probes were deleted or the door was bypassed wholesale.`,
  )
  process.exit(1)
}

/*
 * The older door's exemption, CHECKED. It is exempt because it already retries
 * a transport failure; if that stops being true the exemption is a hole.
 */
const probe = readSource('scripts/guards/lib/schema-probe.mjs').withStrings
if (!/FETCH_FAILED/.test(probe) || !/attempt/i.test(probe)) {
  console.error(
    `${NAME} FAIL - scripts/guards/lib/schema-probe.mjs is exempt from this rule ONLY because it ` +
      `retries a transport failure itself, and it no longer appears to. Either restore the retry or ` +
      `route it through ${DOOR} and delete the exemption.`,
  )
  process.exit(1)
}

if (findings.length) {
  console.error(`\n${NAME} FAIL - ${findings.length} build guard(s) read the database without the shared door:\n`)
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n      ${f.detail}\n`)
  console.error(
    `Import callRpc, selectRest or retryTransport from ./${DOOR} and report a transport ` +
      `failure with couldNotLook(). scripts/guards/event-lifecycle-installed.mjs is the reference shape.`,
  )
  process.exit(1)
}

console.log(`${NAME} PASS - ${doorUsers} build guard(s) read the database, every one through a door that retries a dropped packet.`)
