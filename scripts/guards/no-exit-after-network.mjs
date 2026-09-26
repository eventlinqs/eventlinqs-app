/**
 * GUARD: no process.exit in a gate or guard path that does network work.
 *
 * WHY (founder ruling, 25 September 2026; PLATFORM-FIX-1 Task 5). On Windows,
 * calling process.exit() while a network handle is still closing aborts Node:
 *
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *     file src\win\async.c, line 94
 *
 * and the process ends with 3221226505 instead of the code it asked for
 * (nodejs/node#56645, https://github.com/nodejs/node/issues/56645). It was seen
 * on 25 September 2026 in the pre-push gate and in a script. A guard that
 * CRASHES instead of failing is a guard whose next reader goes looking for a
 * bug in Node (scripts/guards/machine-callers-reachable.mjs recorded the same
 * crash from its own drill). The fix FIX-159C used, and this guard holds: set
 * process.exitCode and let the process end once its handles have closed.
 *
 * WHAT IT JUDGES. The entry points the pre-push gate and the guards run: every
 * `node scripts/...` in the prebuild, postbuild and guards chains, every guard
 * run-guards.mjs registers, every file in scripts/guards, the pre-push gate
 * itself and every script it names. For each, the relative-import closure is
 * followed (scripts/guards/lib/build-time-scripts.mjs, the same closure the
 * upload guards use). An entry does NETWORK WORK when a file in its closure
 * calls fetch, createClient, a pg Client or Pool, http(s).request or
 * net.connect, or imports node:http(s), net, tls, dgram, undici,
 * @supabase/supabase-js, pg, ws or postgres. In every file of such a closure:
 *
 *   A. no `process.exit(` in code. Strings and comments are blanked first, so
 *      a child script written out as text, or a comment explaining this very
 *      rule, is not a call;
 *   B. every declareWork(...) call passes `exitOnZero: false`, because the
 *      library's default ends the process with process.exit(1) when a count
 *      is zero (scripts/lib/work-report.mjs), which is the same crash one hop
 *      away.
 *
 * THE REGISTER. A call that is genuinely safe is listed below by file and
 * exact line text, with its reason. A registered file that gains another exit
 * still fails, and an entry that no longer matches is printed as rot.
 *
 * WHAT IT CANNOT SEE, said plainly: a dynamic import of a computed path, and
 * network work done by a CHILD process (the child has its own handles and its
 * own exit, which is exactly why spawning is safe). It over-approximates on
 * purpose: an exit that runs before any network call in a network-capable
 * process is still refused, because "before" is a property of today's control
 * flow and the next edit moves it.
 *
 * Run: node scripts/guards/no-exit-after-network.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importClosure, runnableEntries } from './lib/build-time-scripts.mjs'
import { normaliseEol, stripComments, stripNonCode } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TAG = '[no-exit-after-network]'
const GATE = 'scripts/ops/pre-push-gate.mjs'

const NETWORK_CALL = /\bfetch\s*\(|\bcreateClient\s*\(|\bnew\s+(?:pg\.)?(?:Client|Pool)\s*\(|\bhttps?\.(?:request|get)\s*\(|\bnet\.connect\s*\(/
/*
 * ONE import statement: bindings made only of names, braces, commas, `*`, `as`
 * and whitespace, so the match cannot run from one import across the file to a
 * string that happens to spell `from 'pg'` (this codebase has no semicolons to
 * stop it, and the first version of this pattern did exactly that).
 */
const NETWORK_IMPORT =
  /(?:^|\n)\s*import\s+(?:[\w$*{},\s]+?\s+from\s+)?['"](?:node:)?(?:https?|net|tls|dgram|undici|@supabase\/supabase-js|pg|ws|postgres)['"]/
const EXIT_CALL = /\bprocess\s*\.\s*exit\s*\(/g

/**
 * Calls that are safe, by file and exact code text, with the reason.
 */
export const REGISTER = [
  {
    file: 'scripts/lib/work-report.mjs',
    code: 'if (exitOnZero) process.exit(1)',
    count: 2,
    reason:
      'the library default. Clause B requires every declareWork call in a network path to pass exitOnZero: false, so in those paths these two lines never run.',
  },
]

export function doesNetworkWork(text) {
  const src = normaliseEol(text)
  return NETWORK_CALL.test(stripNonCode(src)) || NETWORK_IMPORT.test(stripComments(src))
}

/** Clause A: every process.exit call in code, with its line. */
export function exitCalls(text) {
  const code = stripNonCode(normaliseEol(text))
  const lines = code.split('\n')
  const raw = normaliseEol(text).split('\n')
  const out = []
  lines.forEach((line, i) => {
    EXIT_CALL.lastIndex = 0
    if (EXIT_CALL.test(line)) out.push({ line: i + 1, text: raw[i].trim() })
  })
  return out
}

/** Clause B: every declareWork(...) call whose arguments do not pass exitOnZero: false. */
export function declareWorkWithoutOptOut(text) {
  const code = stripComments(normaliseEol(text))
  const out = []
  const re = /\bdeclareWork\s*\(/g
  for (const m of code.matchAll(re)) {
    if (/function\s+$/.test(code.slice(Math.max(0, m.index - 12), m.index))) continue
    let depth = 0
    let end = -1
    for (let k = m.index + m[0].length - 1; k < code.length; k += 1) {
      if (code[k] === '(') depth += 1
      else if (code[k] === ')') {
        depth -= 1
        if (depth === 0) {
          end = k
          break
        }
      }
    }
    const args = code.slice(m.index, end === -1 ? undefined : end)
    if (!/\bexitOnZero\s*:\s*false\b/.test(args)) out.push({ line: code.slice(0, m.index).split('\n').length })
  }
  return out
}

/** The entry points the gate and the guards run. */
export function entryPoints(root = ROOT) {
  const out = new Set(runnableEntries(root))
  const gatePath = join(root, GATE)
  if (existsSync(gatePath)) {
    out.add(GATE)
    for (const m of readFileSync(gatePath, 'utf8').matchAll(/scripts\/[A-Za-z0-9_./-]+\.mjs/g)) {
      if (existsSync(join(root, m[0]))) out.add(m[0])
    }
  }
  return [...out].sort()
}

/** The whole ruling. `read` is injectable so the test can hand it a tree. */
export function judge(root = ROOT, { entries = entryPoints(root), read = (f) => readFileSync(join(root, f), 'utf8'), register = REGISTER } = {}) {
  const findings = []
  const networkEntries = []
  const judged = new Set()
  const netCache = new Map()
  const isNet = (f) => {
    if (!netCache.has(f)) netCache.set(f, doesNetworkWork(read(f)))
    return netCache.get(f)
  }
  const registered = new Map()
  for (const entry of entries) {
    const closure = importClosure(root, [entry]).filter((f) => /\.(mjs|js|cjs)$/.test(f))
    const net = closure.filter(isNet)
    if (net.length === 0) continue
    networkEntries.push(entry)
    for (const file of closure) {
      if (judged.has(file)) continue
      judged.add(file)
      const text = read(file)
      for (const call of exitCalls(text)) {
        const entryReg = register.find((r) => r.file === file && call.text.includes(r.code))
        if (entryReg) {
          registered.set(file, (registered.get(file) ?? 0) + 1)
          continue
        }
        findings.push(
          `${file}:${call.line} calls process.exit in a process that does network work (entry ${entry}, network in ${net[0]}). ` +
            'Set process.exitCode and return; exiting while a socket closes aborts Node on Windows (nodejs/node#56645).',
        )
      }
      for (const call of declareWorkWithoutOptOut(text)) {
        findings.push(
          `${file}:${call.line} calls declareWork without exitOnZero: false in a process that does network work (entry ${entry}). ` +
            'Its default ends the process with process.exit(1); pass exitOnZero: false and set process.exitCode from its return.',
        )
      }
    }
  }
  const rot = []
  for (const r of register) {
    const seen = registered.get(r.file) ?? 0
    if (seen > r.count) findings.push(`${r.file} holds ${seen} registered exit(s) and the register allows ${r.count}`)
    if (seen === 0) rot.push(`${r.file}: "${r.code}" is registered and no network path reaches it any more; delete the entry`)
  }
  return { findings, rot, entries: entries.length, networkEntries, filesJudged: judged.size }
}

function main() {
  const { findings, rot, entries, networkEntries, filesJudged } = judge()
  for (const r of REGISTER) console.log(`${TAG} register: ${r.file} "${r.code}" x${r.count}: ${r.reason}`)
  for (const r of rot) console.log(`${TAG} ROT ${r}`)
  const worked = declareWork('no-exit-after-network', {
    did: { 'entry point read': entries, 'network entry point judged': networkEntries.length, 'file judged': filesJudged },
    found: { 'exit call in a network path': findings.length },
    exitOnZero: false,
  })
  if (!worked) return 1
  if (findings.length > 0) {
    console.error(`${TAG} FAIL - ${findings.length} exit(s) that can tear a closing socket down on Windows:`)
    for (const f of findings) console.error(`    ${f}`)
    return 1
  }
  console.log(`${TAG} PASS - ${networkEntries.length} of ${entries} gate and guard entry points do network work, and none of the ${filesJudged} files they load calls process.exit.`)
  return 0
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) process.exitCode = main()
