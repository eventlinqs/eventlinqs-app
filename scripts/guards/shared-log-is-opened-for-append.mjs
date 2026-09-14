/**
 * A DESCRIPTOR HANDED TO A CHILD PROCESS IS OPENED FOR APPEND, NEVER TRUNCATING.
 *
 * WHY THIS EXISTS, written from the incident rather than from a principle.
 *
 * `startGateServer` opens one file and hands that descriptor to the server, the
 * Upstash stub and any extra process a step needs. The drives then read the same
 * file as an INBOX, because `EMAIL_TRANSPORT=console` prints every message the
 * server sends. Two of them also WRITE to it: `d2-recovery-proof.mjs` and
 * `d2-waitlist-proof.mjs` run the recovery engine as a subprocess, capture its
 * mail as a string, and `appendFileSync` it in so the engine's messages land in
 * the same inbox as the server's.
 *
 * That is two writers with INDEPENDENT FILE OFFSETS. A descriptor opened 'w'
 * carries its own offset, and that offset moves only when its owner writes. An
 * append always writes at end of file. So every append moved the end of the file
 * PAST the server's stale offset, and the server's next line was written ON TOP
 * of the message the harness had just added.
 *
 * WHAT IT COST. On 13 September 2026 the D2 recovery proof at 768 reported "the
 * sequence is three messages and stops there" as a FAILURE with two messages in
 * the inbox, and the one it could not find was message one to the person who
 * stayed. The database held the send (`recovery_sends`, `d2-stayed-...#1 ->
 * entry 11587`). The engine's own sweep reported `sent: 3`. The server log held
 * the wreckage: a line reading `ww.eventlinqs.com.au/events/...` with
 * `[email:console] link    https://w` simply gone from the front of it. The same
 * drive passed at 390 and at 1440 in the same run, because whether a line is
 * destroyed depends on where the stale offset happens to point.
 *
 * THE PROPERTY THAT MAKES THIS WORTH A GUARD. The damage lands in the harness's
 * OWN evidence, so it reads as a product defect. A session can spend a day
 * chasing a message the product sent correctly, and every artefact it looks at
 * agrees with it. Nothing in a code review can see it either: `openSync(p, 'w')`
 * beside `stdio: ['ignore', fd, fd]` is the ordinary way to log a child.
 *
 * WHY THE RULE IS FLAT, AND STAYS FLAT. The honest narrow rule would be "opened
 * truncating AND something else writes to that path", which needs a judgement at
 * every call site about who else might write there. That judgement is exactly
 * what was made, reasonably, when the gate server's log was opened 'w': nothing
 * else wrote to it at the time, and a drive added an append months later. So the
 * rule here asks nothing of the reader: a descriptor that can reach a child is
 * opened for append. It costs nothing when there is one writer, because
 * `openStepLog` truncates first, and it cannot be got wrong later.
 *
 * WHAT IT CHECKS. Every file under the scanned roots that hands a `stdio` option
 * to a child is read for `openSync` calls, and each is required to use an append
 * mode ('a' or 'a+'). A truncating or positional mode ('w', 'w+', 'r+') fails,
 * named with its file and line.
 *
 * WHAT IT CANNOT SEE, stated plainly rather than left to be discovered. It
 * matches a QUOTED LITERAL mode. A call whose mode is a variable
 * (`openSync(path, mode)`) is invisible to it, and so is a descriptor obtained
 * any other way, such as a `WriteStream`'s `fd`. Neither shape exists in this
 * tree today; both are named here so the gap is on the record rather than in
 * somebody's memory.
 *
 * THE REVIEWED BASELINE is printed on every run and reports entries that no
 * longer match, so it cannot rot into an unexamined allowlist.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/**
 * `--root <dir>` points the scan at a scratch tree, which is how the drill in
 * tests/unit/guards/shared-log-is-opened-for-append.test.ts makes this guard go
 * red without writing an offending call site into the repository. Three build
 * lanes share this machine and a drill that mutates the tree mutates it for all
 * of them. With no flag it scans this repository, which is what prebuild does.
 */
const rootFlag = process.argv.indexOf('--root')
const SCRATCH = rootFlag === -1 ? null : process.argv[rootFlag + 1]
const ROOT = SCRATCH ?? join(HERE, '..', '..')

const ROOTS = SCRATCH ? ['.'] : ['scripts', 'tests', '.githooks']
const EXTENSIONS = ['.mjs', '.js', '.cjs', '.ts', '.tsx']

/** Modes whose writes go to the end of the file, which is the whole point. */
const APPEND_MODES = new Set(['a', 'a+', 'as', 'as+', 'ax', 'ax+'])

/**
 * Files exempt, each with a stated reason. Printed every run.
 */
const BASELINE = [
  /*
   * This guard is NOT in its own baseline, and that is deliberate. It was, until
   * codeOnly() landed and the entry stopped matching anything: the only quotes
   * of `openSync(path, 'w')` in this file are prose in the header above and the
   * detector's own regex, neither of which is a call site. An allowlist entry
   * that excuses a file nothing is wrong with is how an allowlist becomes a list
   * nobody reads, so it was deleted rather than kept "just in case". If a real
   * truncating open is ever written into this file, the guard fails on itself,
   * which is correct.
   */
  {
    file: 'tests/unit/guards/shared-log-is-opened-for-append.test.ts',
    reason:
      'the drill for this guard. It writes a TRUNCATING call site into a scratch file on '
      + 'purpose, to make the guard go red, so its source necessarily contains the exact '
      + 'string this scanner looks for.',
  },
  {
    file: 'tests/unit/ops/step-log-survives-a-second-writer.test.ts',
    reason:
      'the NEGATIVE CONTROL for openStepLog. It opens a descriptor the old truncating way '
      + 'on purpose, in a temp directory, to prove that the mode really does destroy a second '
      + "writer's lines on this platform. Removing that call would leave the positive test "
      + 'passing for a reason nobody had checked.',
  },
]

/** Directories the scan could not open. Reported; never silently empty. */
const unreadable = []
/** Paths listed by the walk that no longer existed when the read came. */
const vanished = []

/**
 * A directory this guard cannot read is a directory it cannot judge, so the
 * failure is said out loud rather than returned as an empty list. A scanner that
 * swallows a read error reports PASS for a tree it never opened, which is the
 * vacuous-green shape this repository has been caught by before.
 */
function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    unreadable.push({ dir, why: error instanceof Error ? error.message : String(error) })
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)))
const baselineFiles = new Set(BASELINE.map((b) => b.file))
const matchedBaseline = new Set()
const offenders = []
let withStdio = 0
let opens = 0

// openSync(<anything up to the mode>, '<mode>')
const OPEN = /\bopenSync\s*\(\s*([^,()]*(?:\([^()]*\))?[^,()]*),\s*['"`]([a-z+]+)['"`]\s*\)/g

/**
 * Comments out, code in.
 *
 * Written after this guard's FIRST run reported its own header as an offender:
 * openStepLog's doc comment explains the defect by quoting `openSync(path, 'w')`
 * in prose, and a scanner that reads prose as a call site cries wolf on the one
 * file that documents the rule. A guard that cries wolf is a guard someone stops
 * reading, which is the failure mode `no-inherited-git-env.mjs` already records.
 *
 * Line comments are only stripped when the `//` opens one: a `//` inside
 * `https://` is preceded by a colon and is left alone, so a URL in a string
 * cannot swallow the rest of its line. Newlines are preserved so the line
 * numbers this guard reports stay the line numbers in the file.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, before) => before + ' '.repeat(m.length - before.length))
}

for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/')
  /*
   * A FILE THAT VANISHED BETWEEN ENUMERATION AND READ IS NOT A VIOLATION, AND
   * IT IS NOT AN UNREADABLE TREE EITHER. The two are separated deliberately.
   *
   * 14 September 2026: this guard took the whole suite red inside the push gate
   * with a raw node:fs stack ("expected 'node:fs:484 return binding.rea...' to
   * contain 'PASS'"), and passed on its own moments later. It scans 1102 files
   * under scripts, tests and .githooks, and several guard tests under tests/
   * write scratch files into the tree and delete them again. Run those in a
   * parallel vitest worker while this scan is between its walk and its read and
   * readFileSync throws ENOENT on a path that existed when it was listed.
   *
   * Swallowing that would be the vacuous green this file's own header warns
   * about, so the vanished paths are COUNTED AND NAMED. But failing on them
   * would be worse than useless: there is no file there to break the rule, and a
   * gate that goes red on its own concurrency teaches people to re-run until it
   * is green, which is how a real failure gets clicked past. Anything that is
   * not ENOENT is still a tree this guard cannot read, and still fails.
   */
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      vanished.push(rel)
      continue
    }
    unreadable.push({ dir: rel, why: error instanceof Error ? error.message : String(error) })
    continue
  }
  const source = codeOnly(raw)
  // Only files that can hand a descriptor to a child are in scope. A script that
  // opens a file for its own use and starts nothing cannot produce this defect.
  if (!/\bstdio\s*:/.test(source)) continue
  withStdio += 1
  if (baselineFiles.has(rel)) {
    if (OPEN.test(source)) matchedBaseline.add(rel)
    OPEN.lastIndex = 0
    continue
  }
  let m
  OPEN.lastIndex = 0
  while ((m = OPEN.exec(source)) !== null) {
    opens += 1
    const mode = m[2]
    if (APPEND_MODES.has(mode)) continue
    if (mode.startsWith('r') && !mode.includes('+')) continue // read only, writes nothing
    const line = source.slice(0, m.index).split('\n').length
    offenders.push({ rel, line, mode, target: m[1].trim().slice(0, 60) })
  }
}

if (unreadable.length) {
  console.error('[shared-log-append] FAIL - could not read part of the tree, so this guard cannot say what is in it:')
  for (const u of unreadable) console.error(`    ${u.dir}: ${u.why}`)
  process.exit(1)
}
console.log(`[shared-log-append] scanned ${files.length} file(s) under ${ROOTS.join(', ')}`)
if (vanished.length) {
  console.log(
    `[shared-log-append] ${vanished.length} path(s) vanished between the walk and the read and were not judged ` +
      `(a concurrent guard drill writing scratch files into the tree does this): ${vanished.join(', ')}`,
  )
}
console.log(`[shared-log-append] ${withStdio} file(s) hand a stdio option to a child; ${opens} openSync call(s) judged outside the baseline`)
console.log(`[shared-log-append] reviewed baseline (${BASELINE.length}), printed every run on purpose:`)
for (const b of BASELINE) {
  const stale = matchedBaseline.has(b.file) ? '' : '   <-- MATCHED NOTHING THIS RUN, re-examine'
  console.log(`    ${b.file}: ${b.reason}${stale}`)
}

if (offenders.length) {
  console.error('')
  console.error('[shared-log-append] FAIL - a descriptor that can reach a child process is opened truncating.')
  for (const o of offenders) {
    console.error(`    ${o.rel}:${o.line}  openSync(${o.target}, '${o.mode}')`)
  }
  console.error('')
  console.error('  A truncating descriptor keeps its own file offset, so anything that APPENDS to')
  console.error('  the same path moves end-of-file past it, and the child then writes on top of')
  console.error('  what the appender just added. The drives read these files as an inbox, so the')
  console.error('  damage reads as a product defect. It cost a day on 13 September 2026.')
  console.error('')
  console.error('  Use openStepLog from scripts/ops/pre-push-gate.mjs: it truncates first, so a')
  console.error('  fresh log per step is unchanged, then opens for append.')
  process.exit(1)
}

console.log('[shared-log-append] PASS - every descriptor that can reach a child process is opened for append.')
