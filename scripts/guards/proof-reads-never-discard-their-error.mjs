/**
 * ON THE PROOF PAGE, A READ THAT FAILED NEVER BECOMES A FIGURE.
 *
 * WHY THIS SURFACE AND NOT EVERY SURFACE. `src/lib/proof/` gathers the rows the
 * campaign proof page rests on, and that page exists to defend a fee with
 * numbers. Its own stated law, written into GA5 and into the page header, is
 * that a figure which cannot name its source renders as WORDS and never as a
 * zero or a dash. A discarded read error breaks exactly that law, silently, and
 * it is the one place in this tree where a silent zero is an invoice.
 *
 * WHAT WENT WRONG, found by driving on 15 September 2026. GA5's drive reported
 * `desktop-1440.with-sales.renders` failing with the leading number at 0 pixels.
 * The server log gave the cause, and it was not the page:
 *
 *     TypeError: fetch failed
 *       cause: ConnectTimeoutError (attempted 172.64.149.246:443, timeout: 10000ms)
 *     GET /admin/campaigns/<id>/proof 404 in 42s
 *
 * The laptop could not reach Supabase for about a minute. Every read in
 * read.ts was written `const { data } = await admin...`, dropping `error`:
 *
 *   the CAMPAIGN read returned null, the page called notFound(), and a reader
 *   was told the campaign does not exist because a socket did not open;
 *   the ORDERS read would have returned `[]`, which downstream is not an error
 *   at all. It is zero revenue, printed as a figure.
 *
 * THE RULE. In `src/lib/proof/`, a supabase read either:
 *   goes through `mustRead(...)`, which retries the transient and THROWS when it
 *   persists, so the page answers 500 and says ask again; or
 *   destructures `error` alongside `data` and handles it in the same block, for
 *   the reads whose honest answer to a failure is to WITHHOLD rather than to
 *   500 (the money ledger is the only one today).
 *
 * A bare `const { data ... } = await` with no `error` in the same destructure is
 * refused, because that line cannot tell a failure from an absence and both of
 * its answers are printed as truth.
 *
 * WHAT IT DOES NOT CLAIM. It does not check that the handling is CORRECT, only
 * that the error is bound and mentioned. It does not read any other directory:
 * the same shape elsewhere is a different judgement with different stakes, and a
 * guard that fires on every supabase read in the tree is a guard somebody
 * switches off.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments, lineAt } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const DIR = join(ROOT, 'src', 'lib', 'proof')
const TAG = '[proof-reads-never-discard-their-error]'

/**
 * Every `const { ... } = await` destructure of a supabase-shaped result in a
 * file, as `{ binds, line, handled }`.
 *
 * `handled` is true when `error` is bound in the SAME destructure. Binding it
 * and ignoring it is not something a reader of source can tell from binding it
 * and handling it, so the rule stops at the binding and says so above.
 */
export function awaitedDestructures(src) {
  const code = stripComments(src)
  const out = []
  for (const m of code.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\b/g)) {
    const binds = m[1]
      .split(',')
      .map((p) => p.trim().split(':')[0].trim())
      .filter(Boolean)
    if (!binds.includes('data')) continue
    out.push({ binds, line: lineAt(src, m.index), handled: binds.includes('error') })
  }
  return out
}

/**
 * Is this read routed through a door that refuses on an error? Those
 * destructure nothing: they take the rows directly, because the door has
 * already thrown.
 *
 * THERE ARE TWO DOORS AND THEY ARE THE SAME DOOR. `mustReadEvery` arrived on
 * 19 September 2026 when the reads that feed a printed figure were paged, so a
 * 1,000-row ceiling could no longer quietly shrink the revenue this page
 * publishes. It wraps `readEveryRow` and throws the same `ProofReadFailed`, so
 * a read through it satisfies this guard for the same reason.
 *
 * Counted with an explicit alternation rather than a prefix match, so a third
 * name has to be added here deliberately rather than inherited by spelling.
 */
export function readsThroughMustRead(src) {
  return [...stripComments(src).matchAll(/\b(?:mustRead|mustReadEvery)\s*\(/g)].length
}

/** What one file does wrong. Exported so the drill and the unit test can call it. */
export function judgeFile(name, src) {
  const problems = []
  for (const d of awaitedDestructures(src)) {
    if (d.handled) continue
    problems.push(
      `${name}:${d.line} destructures { ${d.binds.join(', ')} } from an await and never binds \`error\`. ` +
        'On this surface a failed read becomes a printed figure or a 404, and neither is true. ' +
        'Route it through mustRead, which throws, or bind `error` and handle it where the honest answer is to withhold.',
    )
  }
  return problems
}

function main() {
  if (!existsSync(DIR)) {
    console.error(`${TAG} src/lib/proof is gone, and this guard exists for it. Delete the guard or restore the directory.`)
    process.exit(1)
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith('.ts')).sort()
  const problems = []
  let destructures = 0
  let routed = 0

  for (const f of files) {
    const src = readFileSync(join(DIR, f), 'utf8')
    destructures += awaitedDestructures(src).length
    routed += readsThroughMustRead(src)
    problems.push(...judgeFile(f, src))
  }

  declareWork('proof-reads-never-discard-their-error', {
    did: { 'proof file read': files.length, 'awaited destructure judged': destructures, 'read routed through mustRead': routed },
    found: { 'read that discards its error': problems.length },
  })

  if (problems.length > 0) {
    console.error(`${TAG} a read on the proof surface cannot tell a failure from an absence:`)
    for (const p of problems) console.error(`${TAG}   ${p}`)
    process.exit(1)
  }
  console.log(`${TAG} PASS: ${files.length} file(s), ${routed} read(s) through mustRead, ${destructures} destructure(s), every one binds its error`)
}

if (process.argv[1] && process.argv[1].endsWith('proof-reads-never-discard-their-error.mjs')) main()
