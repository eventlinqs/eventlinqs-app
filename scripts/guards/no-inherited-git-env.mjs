/**
 * NO INHERITED GIT ENVIRONMENT: every git subprocess clears GIT_ variables.
 *
 * WHY THIS EXISTS, written from the incident rather than from a principle.
 *
 * A git hook runs with GIT_DIR exported by git, pointing at the real repository,
 * usually alongside GIT_INDEX_FILE and GIT_PREFIX. A child process that shells
 * out to `git` inherits them, and from that moment its `cwd` option no longer
 * chooses the repository: the command operates on the one GIT_DIR names.
 *
 * On 15 August 2026 a test drill built a fixture repository in a temp directory
 * and ran `git init` there. The suite was running under the pre-push hook, so
 * that `git init` re-initialised the SHARED worktree config, set
 * `core.bare=true`, and broke `git status` with "this operation must be run in a
 * work tree" in all nine worktrees at once. The same run wrote
 * `user.name=drill` into that config, and two commits reached the remote
 * authored by a test fixture rather than by the founder.
 *
 * THE PROPERTY THAT MAKES THIS WORTH A GUARD RATHER THAN A FIX. The failure is
 * invisible everywhere except inside a hook. In an ordinary shell GIT_DIR is
 * unset, every call site behaves correctly, and every test passes. The suite is
 * run BY the hook, which is the one context nobody develops in, so the ONLY
 * signal is the damage afterwards. A code review cannot see it either: the
 * offending line is an ordinary `spawnSync('git', ..., { cwd })` that looks
 * exactly like the safe version.
 *
 * WHAT IT CHECKS. Every file under the scanned roots is read for a spawn of
 * `git` through any of the node:child_process entry points, and each call is
 * required to pass an `env` option in the same options object. It does not try
 * to prove the env is correct, because that needs evaluation rather than
 * reading; what it can prove is that the author made a decision about the
 * environment at all, which is the step that was missing.
 *
 * WHY NOT SCOPE IT TO WRITE COMMANDS ONLY. A read against the wrong repository
 * is not harmless here. `migration-collision-guard.mjs` reads refs to answer
 * whether two branches claim one migration version; pointed at the wrong
 * repository it answers confidently about the wrong tree, and that guard blocks
 * the build. A read that silently measures something else is the same class of
 * defect as a write that silently changes something else.
 *
 * WHAT THIS GUARD CANNOT SEE, stated plainly rather than left to be discovered.
 *
 * It matches a QUOTED LITERAL `git` as the command. A call whose command is a
 * variable is invisible to it:
 *
 *   const run = (file, argv) => execFileSync(file, argv, { ... })
 *   run('git', ['ls-remote', '--heads', 'origin'])
 *
 * That is not hypothetical either. `scripts/check-dead-branch-env.mjs` has
 * exactly that shape, this guard does not flag it, and it was found by a manual
 * sweep instead. It matters more than most: it decides which branches are dead
 * and its `--fix` mode deletes Vercel environment variables on the answer, so a
 * leaked GIT_DIR enumerating another repository's worktrees could classify a
 * live branch as dead. It is fixed by hand and named here so the gap is on the
 * record rather than in somebody's memory.
 *
 * Resolving a variable command needs data flow analysis, which is a different
 * class of tool. The mitigation that does not need one is upstream and already
 * in place: `run-guards.mjs` and `test-count-canary.mjs` both clear GIT_ before
 * spawning anything, so the two processes that fan out to every guard and every
 * test hand their children a cleared environment regardless of what those
 * children then do. This guard is the second line, not the first.
 *
 * THE REVIEWED BASELINE is printed on every run and reports entries that no
 * longer match, so it cannot rot into an unexamined allowlist. It carries only
 * this guard and the module it enforces: every real call site was fixed rather
 * than excused.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/** Directories scanned. src/ is included even though it spawns nothing today. */
const ROOTS = ['scripts', 'tests', 'src', '.githooks']

const EXTENSIONS = ['.mjs', '.js', '.cjs', '.ts', '.tsx']

/**
 * Files exempt, each with a stated reason. Printed every run.
 *
 * scripts/lib/git-env.mjs is the module that DOES the clearing. Its doc comment
 * contains an example call, which the scanner would otherwise read as an
 * unguarded call site in the one file that exists to guard them.
 */
const BASELINE = [
  {
    file: 'scripts/lib/git-env.mjs',
    reason:
      'the module that implements the clearing. Its usage example is prose, not a call site.',
  },
  {
    file: 'scripts/guards/no-inherited-git-env.mjs',
    reason: 'this guard. Its own detector patterns match its own subject matter.',
  },
  {
    file: 'tests/unit/guards/no-inherited-git-env.test.ts',
    reason:
      'the drill for this guard. It writes UNGUARDED call sites into a scratch file ' +
      'on purpose, to make the guard go red, so its source necessarily contains the ' +
      'exact string this scanner looks for. Its own live git calls do clear the ' +
      'environment; the matches are fixture text inside string literals.',
  },
]

/** Spawn entry points that can start a process. */
const SPAWNERS = ['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec']

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    console.warn('[scripts/guards/no-inherited-git-env:116]', error instanceof Error ? error.message : error)
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

/**
 * Find the options object of a call and report whether it names `env`.
 *
 * Deliberately a brace scanner rather than a regex. The options object routinely
 * spans several lines and contains nested objects and template literals, and a
 * regex that tries to match it either stops at the first `}` and reports a false
 * failure, or runs to the end of the file and reports a false pass. A false pass
 * here is the whole risk, so the scan counts braces.
 */
function callHasEnvOption(source, callStart) {
  let depth = 0
  let i = callStart
  let started = false
  for (; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') {
      depth += 1
      started = true
    } else if (ch === ')') {
      depth -= 1
      if (started && depth === 0) break
    }
  }
  if (!started || i >= source.length) return { found: false, text: '' }
  const text = source.slice(callStart, i + 1)
  // Three shapes, all legal and all in use in this repository:
  //   { env: gitEnv() }              explicit
  //   { env, cwd }                   shorthand, not last
  //   { cwd, encoding: 'utf8', env } shorthand, LAST, closed by `}`
  // The third was missed by an earlier version of this regex, which required a
  // colon or a comma after the name, and it reported a false FAILURE on a call
  // site that was already correct. A false failure is the cheaper of the two
  // mistakes and it still has to be fixed, because a guard that cries wolf on
  // correct code is a guard someone stops reading.
  return { found: /(^|[{,\s])env\s*[:,}]/.test(text), text }
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)))
const baselineFiles = new Set(BASELINE.map((b) => b.file))
const offenders = []
const matchedBaseline = new Set()
let scanned = 0
let callSites = 0

for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/')
  const source = readFileSync(file, 'utf8')
  if (!source.includes('git')) continue
  scanned += 1

  for (const spawner of SPAWNERS) {
    // The command argument, quoted, immediately after the opening bracket.
    const pattern = new RegExp(`\\b${spawner}\\s*\\(\\s*['"\`]git['"\`]`, 'g')
    let m
    while ((m = pattern.exec(source)) !== null) {
      if (baselineFiles.has(rel)) {
        matchedBaseline.add(rel)
        continue
      }
      callSites += 1
      const { found } = callHasEnvOption(source, m.index)
      if (!found) {
        const line = source.slice(0, m.index).split('\n').length
        offenders.push({ rel, line, spawner })
      }
    }
  }
}

console.log(`[git-env] scanned ${scanned} file(s) under ${ROOTS.join(', ')}`)
console.log(`[git-env] ${callSites} git spawn(s) checked outside the baseline`)

console.log(`[git-env] reviewed baseline (${BASELINE.length}), printed every run on purpose:`)
for (const b of BASELINE) {
  const stale = matchedBaseline.has(b.file) ? '' : '   <-- MATCHED NOTHING THIS RUN, re-examine'
  console.log(`    ${b.file}: ${b.reason}${stale}`)
}

if (offenders.length) {
  console.error('')
  console.error(`[git-env] FAIL - ${offenders.length} git spawn(s) do not clear the inherited environment:`)
  for (const o of offenders) {
    console.error(`    ${o.rel}:${o.line}  ${o.spawner}('git', ...)  has no env option`)
  }
  console.error('')
  console.error('    Inside a git hook, GIT_DIR is set and an inheriting child ignores cwd for')
  console.error('    the purpose of choosing a repository. The command runs against the REAL')
  console.error('    repository. That is how core.bare=true was written to the shared config')
  console.error('    and broke git status in all nine worktrees.')
  console.error('')
  console.error('    Fix, one line:')
  console.error("      import { gitEnv } from '<relative>/scripts/lib/git-env.mjs'")
  console.error('      ...then pass  env: gitEnv()  in the options object.')
  console.error('')
  process.exit(1)
}

console.log('[git-env] PASS - every git spawn clears inherited GIT_ variables.')
