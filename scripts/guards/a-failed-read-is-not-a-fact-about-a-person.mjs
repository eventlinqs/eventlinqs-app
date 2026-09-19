/**
 * ON THE SEND PATH, A READ THAT FAILED IS NOT A FACT ABOUT A PERSON.
 *
 * ---------------------------------------------------------------------------
 * WHY A THIRD GUARD FOR ONE SHAPE, ANSWERED BEFORE IT IS ASKED.
 *
 * Two guards already judge a discarded read error, and each stops where it
 * stops for a stated reason:
 *
 *   scripts/guards/read-failure-is-not-not-found.mjs  judges src/app files that
 *     call notFound(), because there a failed read becomes a permanent "this
 *     does not exist". Its own header says it does not judge "a read whose value
 *     feeds a list or a label", and that a helper in src/lib is invisible to it.
 *   scripts/guards/proof-reads-never-discard-their-error.mjs  judges
 *     src/lib/proof, because there a failed read becomes a printed figure that a
 *     fee is defended with. Its own header says the same shape elsewhere "is a
 *     different judgement with different stakes".
 *
 * That sentence is correct, and this guard is the answer to it rather than a
 * disagreement with it. The stakes on the send path were never measured, and
 * they are higher than either:
 *
 *   A FAILED READ HERE IS WRITTEN DOWN, ABOUT A NAMED PERSON, FOR EVER.
 *
 * `src/lib/campaigner/run.ts` records every recipient it does not send to in
 * `public.marketing_send_skip`, with a reason, and `src/lib/campaigner/read.ts`
 * counts those reasons onto /admin/campaigns. The reasons are prose a person
 * reads as evidence. On 19 September 2026, in that one file, SIX reads
 * discarded their error, and each failure had a sentence already written for it:
 *
 *   the audience chunk   "the audience row this admission points at no longer
 *                        exists"  - it exists; the read failed
 *   the token chunk      "this address has no consent record carrying an
 *                        unsubscribe token"  - they have one, granted
 *   the template read    "the step names a template that does not exist", for
 *                        EVERY recipient on the campaign, from one failed read
 *                        of a small authored table
 *   the step read        an empty sequence, so every recipient is skipped by a
 *                        pacing reason that describes a schedule, not a fault
 *   event / organisation throw "campaign X has no event or no organisation"
 *
 * Not one of those sentences is true when the cause is a failed read, and the
 * first three are written into an append-only table and counted onto a screen.
 * An organiser reading "this address has no consent record" goes and asks a
 * person to consent again who already has.
 *
 * THE SAME FILE PROVES THE AUTHOR KNEW. `run.ts:92` reads the campaign and
 * checks `campaignError` on the very next line. The rule was applied once and
 * then not repeated six times below it, which is the shape LB-ORVALUE was
 * written for: a rule kept by habit is kept until somebody copy-pastes.
 *
 * ---------------------------------------------------------------------------
 * THE RULE. In the scoped directories, an awaited PostgREST read either:
 *
 *   goes through a DOOR that decides for it - readOrThrow, readEveryRow,
 *   mustRead, mustReadEvery - each of which retries a transient fault and
 *   throws a real one; or
 *
 *   binds `error` in the SAME destructure, for the reads whose honest answer to
 *   a failure is something other than a throw.
 *
 * A destructure that binds `data` and never binds `error` is refused, because
 * that line cannot tell a failure from an absence and it publishes both as the
 * same sentence.
 *
 * WHAT IT DOES NOT CLAIM. It does not check that the handling is CORRECT, only
 * that the error is bound and named. Binding it and ignoring it is not something
 * a reader of source can distinguish from binding it and handling it.
 *
 * ---------------------------------------------------------------------------
 * THE MATCHER SEES ARRAY DESTRUCTURING, AND THAT IS NOT A DETAIL.
 *
 * The sibling guard's matcher is `const\s*\{([^}]*)\}\s*=\s*await`. It cannot
 * see
 *
 *     const [{ data: event }, { data: organisation }] = await Promise.all([...])
 *
 * which is the exact line at `src/lib/campaigner/run.ts:114`, and it is the
 * commonest way two reads are issued together in this tree. A guard whose
 * matcher cannot see the commonest spelling reports the absence of what it
 * cannot look at, which is the lesson `no-silent-row-ceiling` was written for
 * and the lesson lane A recorded on 18 September about a pattern that compiled
 * to `from s*`. Both spellings are drilled, red, in
 * scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments, lineAt } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
export const TAG = '[a-failed-read-is-not-a-fact-about-a-person]'

/**
 * THE SEND PATH, DIRECTORY BY DIRECTORY, WITH WHAT A FAILED READ BECOMES IN
 * EACH. Every one is checked to exist: a directory renamed away would otherwise
 * be scanned for nothing and reported as a pass, which is how a scanner lies.
 */
export const SCOPE = [
  ['src/lib/campaigner', 'a permanent skip row and a counted reason on /admin/campaigns'],
  ['src/lib/consent', 'a send decision, and the sentence stored beside it as evidence'],
  ['src/lib/matching', 'an empty candidate list, which reads as "nobody matched"'],
  ['src/lib/attribution', 'an order credited to nobody, silently, in the figures a fee rests on'],
  ['src/lib/audience', 'a smaller audience, printed as the audience'],
]

/**
 * A DIRECTORY THIS GUARD DELIBERATELY DOES NOT SCAN, because another registered
 * guard already does, and two guards over one directory is how a directory ends
 * up covered by neither. Checked to still exist for the same reason as SCOPE.
 */
export const HELD_ELSEWHERE = [
  ['src/lib/proof', 'scripts/guards/proof-reads-never-discard-their-error.mjs'],
]

/**
 * THE DOORS. A read routed through one of these has no destructure here to
 * judge, which is the point: the decision is taken once, in one module, and
 * every caller inherits it.
 *
 * Spelled as an explicit alternation rather than a prefix match, so a fifth
 * door has to be added here deliberately rather than inherited by naming.
 */
export const DOORS = ['readOrThrow', 'readEveryRow', 'mustRead', 'mustReadEvery']

/**
 * THE REGISTER OF DELIBERATE EXCEPTIONS, dated, with the reason, printed on
 * every run. An exception nobody can see is an exception nobody re-argues, and
 * an entry that stops matching is reported as STALE so the list cannot rot into
 * something no one re-reads.
 */
export const REGISTER = [
  {
    file: 'src/lib/consent/digest-city.ts',
    since: '2026-09-19',
    why:
      'its own header states the contract: "It NEVER throws. A consent that could not be scoped ' +
      'must not fail a purchase." Its fallback, null, means "no local digest", which is an honest ' +
      'answer rather than a false one, and a throw here would lose a consent over a blink.',
  },
]

const EXT = /\.(ts|tsx)$/

function filesUnder(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (EXT.test(entry)) out.push(full)
    }
  }
  walk(dir)
  return out
}

/**
 * Split a destructure list into its bound names, keeping the KEY rather than
 * the alias: `data: event, error: eventError` binds `data` and `error`.
 */
function keysOf(list) {
  return list
    .split(',')
    .map((part) => part.trim().split(':')[0].trim())
    .filter(Boolean)
}

/**
 * Every awaited destructure of a supabase-shaped response in one file.
 *
 * BOTH SPELLINGS, and the array one is the reason this function exists rather
 * than a regex at the call site:
 *
 *   const { data, error } = await ...
 *   const [{ data: a }, { data: b, error: bErr }] = await Promise.all([...])
 *
 * An array pattern is reported as one finding PER ELEMENT that binds `data`, so
 * a line holding one good read and one bad read fails for the bad one and names
 * which element it was.
 */
export function awaitedDestructures(src) {
  const code = stripComments(src)
  const out = []

  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*await\b/g)) {
    const binds = keysOf(m[1])
    if (!binds.includes('data')) continue
    out.push({ shape: 'object', binds, element: null, line: lineAt(src, m.index), handled: binds.includes('error') })
  }

  for (const m of code.matchAll(/(?:const|let|var)\s*\[([^[\]]*)\]\s*=\s*await\b/g)) {
    const line = lineAt(src, m.index)
    let element = 0
    for (const inner of m[1].matchAll(/\{([^{}]*)\}/g)) {
      element += 1
      const binds = keysOf(inner[1])
      if (!binds.includes('data')) continue
      out.push({ shape: 'array', binds, element, line, handled: binds.includes('error') })
    }
  }

  return out
}

/**
 * THE MATCHER IS ASKED A QUESTION IT KNOWS THE ANSWER TO, BEFORE IT IS TRUSTED
 * WITH THE TREE.
 *
 * Both of this guard's counters can come back zero while it prints PASS: a
 * scope that scans nothing (held by the existsSync check in main) and a matcher
 * that matches nothing. The second has no natural symptom at all - a blind
 * matcher reports "every one binds its error" about a file whose every read
 * drops it - and it is not hypothetical: on 18 September 2026 a guard in this
 * tree shipped with `${'\\'}s` inside a template literal, where it is not a
 * recognised escape, so the pattern compiled to `from s*` and printed a
 * confident PASS over the file it was written for.
 *
 * So the probe carries one of each spelling, good and bad, and the guard
 * REFUSES rather than reporting on a tree it cannot see.
 */
export const CALIBRATION_PROBE = [
  "const { data: a } = await x.from('t').select('c').maybeSingle()",
  "const { data: b, error: bErr } = await x.from('t').select('c').maybeSingle()",
  "const [{ data: c }, { data: d, error: dErr }] = await Promise.all([p, q])",
].join('\n')

/** @returns a sentence naming what the matcher failed to see, or null when it is sound. */
export function calibrationFault() {
  const found = awaitedDestructures(CALIBRATION_PROBE)
  const object = found.filter((f) => f.shape === 'object')
  const array = found.filter((f) => f.shape === 'array')
  if (object.length !== 2) return `it saw ${object.length} of the 2 object destructures in its own probe`
  if (array.length !== 2) return `it saw ${array.length} of the 2 array elements in its own probe`
  if (object.filter((f) => f.handled).length !== 1) return 'it cannot tell a bound `error` from a missing one in an object destructure'
  if (array.filter((f) => f.handled).length !== 1) return 'it cannot tell a bound `error` from a missing one in an array destructure'
  return null
}

/** How many reads in this file are routed through a door. Reported, never required. */
export function readsThroughADoor(src) {
  const code = stripComments(src)
  return DOORS.reduce(
    (total, door) => total + [...code.matchAll(new RegExp(`\\b${door}\\s*\\(`, 'g'))].length,
    0,
  )
}

/** What one file does wrong. Exported so the drill and the unit test call the same judgement. */
export function judgeFile(name, src, becomes) {
  const problems = []
  for (const d of awaitedDestructures(src)) {
    if (d.handled) continue
    const where = d.shape === 'array' ? ` (element ${d.element} of an array destructure)` : ''
    problems.push(
      `${name}:${d.line}${where} destructures { ${d.binds.join(', ')} } from an await and never binds \`error\`. ` +
        `On this path a failed read becomes ${becomes}. ` +
        `Route it through one of ${DOORS.join(', ')}, or bind \`error\` and answer it here.`,
    )
  }
  return problems
}

function main() {
  const fault = calibrationFault()
  if (fault) {
    console.error(`${TAG} REFUSING: the calibration probe was not read correctly - ${fault}.`)
    console.error(`${TAG} A matcher that cannot see its own probe reports the absence of what it never looked at.`)
    process.exit(1)
  }

  const problems = []
  const registered = new Set(REGISTER.map((r) => r.file.split('/').join(sep)))
  const matchedRegister = new Set()
  let filesScanned = 0
  let destructures = 0
  let routed = 0
  let exempted = 0

  for (const [dir, holder] of HELD_ELSEWHERE) {
    if (!existsSync(join(ROOT, dir))) {
      console.error(`${TAG} ${dir} is gone and ${holder} is the guard that holds it. Reconcile the two rather than leaving neither.`)
      process.exit(1)
    }
    if (!existsSync(join(ROOT, holder))) {
      console.error(`${TAG} ${dir} is excluded here because ${holder} holds it, and that guard is gone. Widen SCOPE or restore the guard.`)
      process.exit(1)
    }
  }

  for (const [dir, becomes] of SCOPE) {
    const full = join(ROOT, dir)
    if (!existsSync(full)) {
      console.error(`${TAG} ${dir} is in this guard's scope and does not exist. A scope that scans nothing reports a pass.`)
      process.exit(1)
    }
    for (const file of filesUnder(full)) {
      filesScanned += 1
      const name = relative(ROOT, file).split(sep).join('/')
      const src = readFileSync(file, 'utf8')
      const found = awaitedDestructures(src)
      destructures += found.length
      routed += readsThroughADoor(src)
      if (registered.has(relative(ROOT, file))) {
        matchedRegister.add(name)
        exempted += found.filter((d) => !d.handled).length
        continue
      }
      problems.push(...judgeFile(name, src, becomes))
    }
  }

  console.log(`${TAG} the register of deliberate exceptions, ${REGISTER.length} entr${REGISTER.length === 1 ? 'y' : 'ies'}:`)
  for (const entry of REGISTER) {
    const state = matchedRegister.has(entry.file) ? 'in scope' : 'STALE, it matches no scanned file'
    console.log(`${TAG}   ${entry.file} (since ${entry.since}, ${state})`)
    console.log(`${TAG}     ${entry.why}`)
  }

  declareWork('a-failed-read-is-not-a-fact-about-a-person', {
    did: {
      'send-path file read': filesScanned,
      'awaited destructure judged': destructures,
      'read routed through a door': routed,
      'registered exception': REGISTER.length,
    },
    found: { 'read that discards its error': problems.length, 'destructure exempted by the register': exempted },
  })

  if (REGISTER.some((entry) => !matchedRegister.has(entry.file))) {
    console.error(`${TAG} a register entry no longer matches a scanned file. Delete it or correct its path.`)
    process.exit(1)
  }

  if (problems.length > 0) {
    console.error(`${TAG} a read on the send path cannot tell a failure from an absence:`)
    for (const p of problems) console.error(`${TAG}   ${p}`)
    process.exit(1)
  }

  console.log(
    `${TAG} PASS: ${filesScanned} file(s) across ${SCOPE.length} director${SCOPE.length === 1 ? 'y' : 'ies'}, ` +
      `${routed} read(s) through a door, ${destructures} destructure(s), every one binds its error`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('a-failed-read-is-not-a-fact-about-a-person.mjs')) main()
