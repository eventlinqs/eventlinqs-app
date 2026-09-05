/**
 * THE PRE-PUSH GATE: one command, every check CI runs, on the tree that is
 * about to leave this machine.
 *
 *   npm run gate:push          by hand, at any time
 *   .githooks/pre-push         on every push, and it runs nothing else
 *
 * WHY THIS EXISTS (close-out C2.1, 5 September 2026). Six failed-run emails
 * arrived for ONE pull request, because CI was being used as the test runner:
 * push, red run, fix, push, red run. The standing rule that came out of it is
 * that nothing is pushed until the SAME checks pass locally first, and a rule
 * without a hook is a preference. The hook this replaces ran the typecheck,
 * lint and the suite: three of the checks CI measures. A push could satisfy it
 * and still turn four jobs red, which is exactly what happened.
 *
 * WHAT RUNS, cheapest failure first, each step named for the CI step it stands
 * in for so the list can be checked against the workflows rather than trusted
 * (tests/unit/ops/pre-push-gate.test.ts reads .github/workflows/ci.yml and
 * fails if a single-line CI command has no step here):
 *
 *   disk                    the build floor (local only; Vercel manages its own disk)
 *   typecheck               CI > verify > Typecheck            npx tsc --noEmit
 *   lint                    CI > verify > Lint                 npm run lint
 *   copy                    CI > verify > Copy laws + AI-tell lexicon
 *   critical-path           CI > verify > Critical-path guard
 *   lighthouse-exemptions   CI > verify > Lighthouse exemption expiry
 *   guards                  CI > verify > Build (prebuild)     every registered guard
 *   types-drift             CI > types-drift guard             against production, read only
 *   fixture                 CI > test (pretest)                the seeded fixture npm test builds
 *   suite                   CI > test > Test                   vitest, through the test-count canary
 *   build                   CI > verify > Build                npm run build
 *   lighthouse              Lighthouse CI > Lighthouse mobile gate, on THIS build served locally
 *
 * THE LIGHTHOUSE STEP IS THE SAME GATE, NOT A LOOKALIKE. It starts the
 * production build with `next start`, resolves the PINNED url set through
 * scripts/ci/resolve-gate-urls.mjs, warms pages and the image optimiser with
 * scripts/ci/warm-preview.mjs, collects with the same @lhci/cli spec the
 * workflow runs, runs the same aggregation report and SEO assertion, and
 * asserts with the same lighthouserc.json. No threshold lives here. What
 * differs is the host: a warmed local server instead of a Vercel preview, so
 * the number is the product rather than the runner (the founder ruling of
 * 25 August 2026 on the CI gate rests on that distinction). The step BLOCKS:
 * that is what the close-out asked for, and the standing 95+ law is what the
 * product should achieve.
 *
 * WHAT IT REFUSES TO MEASURE. A working tree with uncommitted changes to
 * tracked files is not the commit being pushed, and a measurement of one
 * quoted for the other is the "true when measured, false when made" shape this
 * repository has been caught by three times. The gate stops and says so.
 *
 * WHAT IT SKIPS, and only this. A push that deletes refs sends nothing from
 * this machine, and a pushed tree with no package.json is not the application
 * (the ops/session-log branch is three markdown files), so the code gate has
 * nothing to measure. Both are decided from the ref list git hands a pre-push
 * hook on stdin, never from a branch name someone can reuse.
 *
 * WHAT IT WILL NOT DO. There is no flag that skips a step on a push. `--only`
 * exists for a HAND run of one step while fixing it, and the gate refuses it
 * outright when a ref list is present, so the hook cannot pass it even by
 * accident. scripts/guards/pre-push-gate-wired.mjs fails the build if the hook
 * tries. Git's own `--no-verify` remains, as the old hook said: a hook that
 * cannot be bypassed in an emergency is a hook someone deletes, and using it
 * is a decision to share unchecked code, made knowingly.
 *
 * ENVIRONMENT. Every child runs under gitEnv(): the hook inherits GIT_DIR and
 * friends from git, and a child that shells out to git would otherwise act on
 * the wrong repository (see scripts/lib/git-env.mjs for the day that happened).
 * Steps marked `env: 'local'` also see .env.local, without overriding anything
 * already in the shell, because the guards, the build and the served app all
 * read the TEST project from it. The suite does NOT get it, to match CI; its
 * clean-env setup strips the same names anyway.
 *
 * DISK. The build stays in .next when the gate is green: it is the tree's own
 * build and the next drive or gate reuses its compiler cache. Everything else
 * the gate makes (.lighthouseci, .tmp/gate-urls.txt, .tmp/gate-server.log) is
 * removed on the way out, green or red.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gitEnv } from '../lib/git-env.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const NODE = process.execPath
const NPM_CLI = join(dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const NPX_CLI = join(dirname(NODE), 'node_modules', 'npm', 'bin', 'npx-cli.js')
/** The exact package spec .github/workflows/lighthouse.yml runs, so the assertion engine is the same one. */
export const LHCI_SPEC = '@lhci/cli@0.14.x'
const TMP = join(ROOT, '.tmp')
const GATE_URLS = join(TMP, 'gate-urls.txt')
const SERVER_LOG = join(TMP, 'gate-server.log')
const LHCI_DIR = join(ROOT, '.lighthouseci')
const ZERO_SHA = /^0{40}$/

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * The repository's env-file shape, the same parse C:\dev\serve.ps1 and the
 * production-write preflight use: comments and blank lines skipped, one pair
 * per line, surrounding quotes stripped, an empty value is no value.
 */
export function parseEnvFile(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    if (value === '') continue
    out[m[1]] = value
  }
  return out
}

/** The environment a step runs in: git variables cleared, and .env.local for the steps that read the database. */
function envFor(kind) {
  const base = { ...gitEnv(), NEXT_TELEMETRY_DISABLED: '1' }
  if (kind !== 'local') return base
  const file = join(ROOT, '.env.local')
  if (!existsSync(file)) return base
  for (const [name, value] of Object.entries(parseEnvFile(readFileSync(file, 'utf8')))) {
    if (base[name] === undefined) base[name] = value
  }
  return base
}

/** Run one child to completion with its output on this terminal; its exit code is the answer. */
function exec(command, args, env) {
  const r = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env })
  if (r.error) {
    console.error(`[gate] could not start ${command} ${args.slice(0, 2).join(' ')}: ${r.error.message}`)
    return 1
  }
  return r.status ?? 1
}

/**
 * The types-drift guard needs SUPABASE_ACCESS_TOKEN to list what production has
 * applied (that is how it tells PENDING from STALE). On this machine the token
 * lives in Windows Credential Manager, where `supabase login` put it, and
 * scripts/ops/with-supabase-token.ps1 hands it to one child without printing
 * it. A shell that already exports the token skips the helper.
 */
function runTypesDrift(env) {
  if (nonEmpty(env.SUPABASE_ACCESS_TOKEN)) return exec(NODE, ['scripts/ci/types-drift-guard.mjs'], env)
  if (process.platform === 'win32') {
    return exec(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/ops/with-supabase-token.ps1', 'node', 'scripts/ci/types-drift-guard.mjs'],
      env,
    )
  }
  console.error('[gate] SUPABASE_ACCESS_TOKEN is not set, and the Credential Manager helper is Windows only.')
  console.error('[gate] Export the token the Supabase CLI holds (supabase login), then push again.')
  return 1
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const s = createServer()
    s.unref()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolvePort(port))
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(base, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return `the server exited with ${child.exitCode} before answering`
    try {
      const res = await fetch(`${base}/`, { headers: { Cookie: 'el-audit=1' }, signal: AbortSignal.timeout(10_000), redirect: 'manual' })
      if (res.status === 200) return null
      console.log(`[gate] server answered ${res.status} on /, waiting`)
    } catch (error) {
      // Not up yet. The wait is the point; the timeout below is the failure.
      void error
    }
    await sleep(1000)
  }
  return `the server did not answer 200 on / within ${timeoutMs / 1000}s`
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    if (r.error) console.warn(`[gate] taskkill failed for pid ${child.pid}: ${r.error.message}`)
    return
  }
  child.kill('SIGTERM')
}

function tailOf(file, lines = 40) {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/).slice(-lines).join('\n')
  } catch (error) {
    return `(no log to read: ${error.message})`
  }
}

/**
 * The Lighthouse mobile gate, on this tree's production build, served locally.
 * Every script here is the one the workflow runs; the only substitution is the
 * host.
 */
async function runLighthouse(env) {
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    console.error('[gate] no production build under .next (no BUILD_ID). The build step produces it; run the whole gate.')
    return 1
  }
  mkdirSync(TMP, { recursive: true })
  const stubPort = await freePort()
  const appPort = await freePort()
  const base = `http://127.0.0.1:${appPort}`
  const fd = openSync(SERVER_LOG, 'w')
  // The rate limiter on the money path is fail-closed under NODE_ENV=production,
  // so the app is pointed at the in-memory Upstash stub the drives use, never at
  // a shared instance. EMAIL_TRANSPORT=console refuses a production project.
  const stub = spawn(NODE, ['scripts/verify/upstash-local-stub.mjs'], {
    cwd: ROOT,
    env: { ...env, PORT: String(stubPort) },
    stdio: ['ignore', fd, fd],
  })
  const server = spawn(NODE, ['node_modules/next/dist/bin/next', 'start', '--port', String(appPort)], {
    cwd: ROOT,
    env: {
      ...env,
      PORT: String(appPort),
      EMAIL_TRANSPORT: 'console',
      UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${stubPort}`,
      UPSTASH_REDIS_REST_TOKEN: 'local',
    },
    stdio: ['ignore', fd, fd],
  })
  try {
    const notUp = await waitForServer(base, server, 120_000)
    if (notUp) {
      console.error(`[gate] ${notUp}. Server log tail (.tmp/gate-server.log):`)
      console.error(tailOf(SERVER_LOG))
      return 1
    }
    console.log(`[gate] production build answering on ${base} (server log: .tmp/gate-server.log)`)

    const resolved = spawnSync(NODE, ['scripts/ci/resolve-gate-urls.mjs'], {
      cwd: ROOT,
      env: { ...env, PREVIEW_URL: base },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    process.stderr.write(resolved.stderr ?? '')
    if (resolved.error) {
      console.error(`[gate] could not run the gate-url resolver: ${resolved.error.message}`)
      return 1
    }
    if (resolved.status !== 0) return resolved.status ?? 1
    writeFileSync(GATE_URLS, resolved.stdout)
    const urls = resolved.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    console.log(`[gate] gating mobile on ${urls.length} URL(s), the pinned set:`)
    for (const u of urls) console.log(`[gate]   ${u}`)

    if (exec(NODE, ['scripts/ci/warm-preview.mjs', GATE_URLS], env) !== 0) return 1

    rmSync(LHCI_DIR, { recursive: true, force: true })
    const collected = exec(
      NODE,
      [NPX_CLI, '--yes', LHCI_SPEC, 'collect', '--config=./lighthouserc.json', ...urls.map((u) => `--url=${u}`)],
      env,
    )
    if (collected !== 0) return collected
    // A reporter, never a verdict: prints every run value and the aggregation.
    exec(NODE, ['scripts/ci/lighthouse-aggregation-report.mjs', '.lighthouseci'], env)
    const seo = exec(NODE, ['scripts/ci/assert-seo-audits.mjs', '.lighthouseci'], env)
    if (seo !== 0) return seo
    return exec(NODE, [NPX_CLI, '--yes', LHCI_SPEC, 'assert', '--config=./lighthouserc.json'], env)
  } finally {
    killTree(server)
    killTree(stub)
    closeSync(fd)
    rmSync(LHCI_DIR, { recursive: true, force: true })
    rmSync(GATE_URLS, { force: true })
  }
}

/**
 * The steps, in order. `mirrors` carries the exact CI command or job each one
 * stands in for; the unit test derives CI's command list from the workflow and
 * fails when one has no twin here, so a step added to CI cannot quietly be a
 * step the gate does not run.
 */
export const STEPS = [
  {
    id: 'disk',
    ci: 'local only: the build floor (scripts/check-disk-space.mjs, MIN_FREE_GB)',
    title: 'free disk above the build floor',
    mirrors: [],
    env: 'plain',
    run: (env) => exec(NODE, ['scripts/check-disk-space.mjs'], env),
  },
  {
    id: 'typecheck',
    ci: 'CI > verify > Typecheck',
    title: 'tsc --noEmit over the whole tree, tests included',
    mirrors: ['npx tsc --noEmit'],
    env: 'plain',
    run: (env) => exec(NODE, ['node_modules/typescript/bin/tsc', '--noEmit'], env),
  },
  {
    id: 'lint',
    ci: 'CI > verify > Lint',
    title: 'eslint --max-warnings=0 (cached: a repeat run costs what changed)',
    mirrors: ['npm run lint'],
    env: 'plain',
    run: (env) => exec(NODE, ['node_modules/eslint/bin/eslint.js', '--max-warnings=0', '--cache', '--cache-location', '.eslintcache'], env),
  },
  {
    id: 'copy',
    ci: 'CI > verify > Copy laws + AI-tell lexicon',
    title: 'the copy laws and the AI-tell lexicon',
    mirrors: ['node scripts/copy-tell-gate.mjs'],
    env: 'plain',
    run: (env) => exec(NODE, ['scripts/copy-tell-gate.mjs'], env),
  },
  {
    id: 'critical-path',
    ci: 'CI > verify > Critical-path guard',
    title: 'the critical-path guard',
    mirrors: ['node scripts/ci/critical-path-guard.mjs'],
    env: 'plain',
    run: (env) => exec(NODE, ['scripts/ci/critical-path-guard.mjs'], env),
  },
  {
    id: 'lighthouse-exemptions',
    ci: 'CI > verify > Lighthouse exemption expiry',
    title: 'no Lighthouse exemption without a clock',
    mirrors: ['node scripts/ci/lighthouse-exemption-expiry.mjs'],
    env: 'plain',
    run: (env) => exec(NODE, ['scripts/ci/lighthouse-exemption-expiry.mjs'], env),
  },
  {
    id: 'guards',
    ci: 'CI > verify > Build (prebuild runs the guard registry)',
    title: 'every registered guard, with the TEST project from .env.local',
    mirrors: [],
    env: 'local',
    run: (env) => exec(NODE, ['scripts/guards/run-guards.mjs'], env),
  },
  {
    id: 'types-drift',
    ci: 'CI > types-drift guard',
    title: 'the types-drift guard against production, read only',
    mirrors: ['bash scripts/check-types-drift.sh'],
    env: 'plain',
    run: runTypesDrift,
  },
  {
    id: 'fixture',
    ci: 'CI > test (pretest builds the seeded fixture before vitest)',
    title: 'the seeded catalogue fixture',
    mirrors: [],
    env: 'plain',
    run: (env) => exec(NODE, ['scripts/seed-events-catalogue.mjs', '--fixture'], env),
  },
  {
    id: 'suite',
    ci: 'CI > test > Test',
    title: 'vitest, through the test-count canary',
    mirrors: ['npm test'],
    env: 'plain',
    run: (env) => exec(NODE, ['scripts/guards/test-count-canary.mjs'], env),
  },
  {
    id: 'build',
    ci: 'CI > verify > Build',
    title: 'npm run build: prebuild, then next build',
    mirrors: ['npm run build'],
    env: 'local',
    run: (env) => exec(NODE, [NPM_CLI, 'run', 'build'], env),
  },
  {
    id: 'lighthouse',
    ci: 'Lighthouse CI > Lighthouse mobile gate',
    title: 'the Lighthouse mobile gate on this build, served locally',
    mirrors: ['Lighthouse mobile gate'],
    env: 'local',
    run: runLighthouse,
  },
]

/**
 * What git handed the hook, judged. `hasCode(sha)` answers whether a pushed
 * tree carries package.json; it is a parameter so the decision is unit-tested
 * without a repository.
 */
export function classifyPush(stdinText, hasCode) {
  const refs = stdinText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/)
      return { localRef, localSha: localSha ?? '', remoteRef, remoteSha }
    })
  if (refs.length === 0) {
    return { verdict: 'run', reason: 'no ref list on stdin (a hand run): the whole gate runs' }
  }
  const updates = refs.filter((r) => !ZERO_SHA.test(r.localSha))
  if (updates.length === 0) {
    return { verdict: 'skip', reason: `${refs.length} deletion(s) only: nothing leaves this machine` }
  }
  const withCode = updates.filter((r) => hasCode(r.localSha))
  if (withCode.length === 0) {
    return {
      verdict: 'skip',
      reason: `${updates.length} pushed tree(s) without package.json (${updates.map((r) => r.remoteRef).join(', ')}): not the application, so the code gate has nothing to measure`,
    }
  }
  return {
    verdict: 'run',
    reason: `${withCode.length} pushed ref(s) carry the application: ${withCode.map((r) => `${r.remoteRef} at ${r.localSha.slice(0, 8)}`).join(', ')}`,
  }
}

function readStdinRefs() {
  if (process.stdin.isTTY) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch (error) {
    console.warn(`[gate] stdin unreadable (${error.code ?? error.message}); treating this as a hand run`)
    return ''
  }
}

function treeHasPackageJson(sha) {
  try {
    // ls-tree answers with the entry when it exists and with nothing when it
    // does not, exit 0 either way; only an unknown object is an error.
    const entry = execFileSync('git', ['ls-tree', '--name-only', sha, '--', 'package.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return entry.trim() === 'package.json'
  } catch (error) {
    console.warn(`[gate] could not inspect ${sha.slice(0, 8)} (${(error.message || '').split(/\r?\n/)[0]}); assuming it carries the application`)
    return true
  }
}

function trackedChanges() {
  try {
    return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8', env: gitEnv() })
      .split(/\r?\n/)
      .filter(Boolean)
  } catch (error) {
    console.warn(`[gate] git status unavailable (${error.message}); cannot confirm the tree matches the commit`)
    return []
  }
}

function headLine() {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }).trim()
    const sha = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }).trim()
    return `${branch} at ${sha}`
  } catch (error) {
    return `(git unavailable: ${error.message})`
  }
}

function parseOnly(argv) {
  const ids = []
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--only=')) ids.push(...a.slice(7).split(','))
    else if (a === '--only' && typeof argv[i + 1] === 'string') ids.push(...argv[++i].split(','))
    else {
      console.error(`[gate] unknown argument ${a}. The only option is --only <step,...> for a hand run.`)
      return { error: true }
    }
  }
  return ids.length > 0 ? { only: new Set(ids.map((s) => s.trim()).filter(Boolean)) } : {}
}

function summary(results, selected) {
  console.log('')
  console.log('[gate] ' + 'step'.padEnd(24) + 'result'.padEnd(10) + 'seconds')
  for (const r of results) console.log('[gate] ' + r.id.padEnd(24) + (r.ok ? 'PASS' : 'FAIL').padEnd(10) + r.secs)
  for (const s of selected.slice(results.length)) console.log('[gate] ' + s.id.padEnd(24) + 'not run')
}

async function main() {
  const parsed = parseOnly(process.argv.slice(2))
  if (parsed.error) return 1
  const only = parsed.only ?? null
  const refsText = readStdinRefs()
  if (only && refsText.trim() !== '') {
    console.error('[gate] REFUSED: a step selection (--only) reached the gate on a real push. The hook runs the whole gate, always.')
    return 1
  }
  console.log('='.repeat(72))
  console.log(`[gate] pre-push gate on ${headLine()}, node ${process.versions.node}`)
  console.log('='.repeat(72))
  const push = classifyPush(refsText, treeHasPackageJson)
  if (push.verdict === 'skip') {
    console.log(`[gate] SKIPPED: ${push.reason}`)
    return 0
  }
  console.log(`[gate] ${push.reason}`)

  // A push sends the commit; the gate measures the working tree. On a push the
  // two must be the same tree or the green means nothing, so a dirty tree
  // blocks. A hand run is how a step gets fixed, and a fix in progress is by
  // definition uncommitted, so there it is said out loud and the run goes on.
  const dirty = trackedChanges()
  if (dirty.length > 0) {
    const pushing = refsText.trim() !== ''
    console.error('')
    console.error(`[gate] ${pushing ? 'BLOCKED before any step' : 'NOTE'}: ${dirty.length} tracked file(s) differ from the commit.`)
    for (const d of dirty.slice(0, 20)) console.error(`[gate]   ${d}`)
    if (dirty.length > 20) console.error(`[gate]   ... and ${dirty.length - 20} more`)
    if (pushing) {
      console.error('[gate] The gate measures the working tree, and a push sends the commit. They must be')
      console.error('[gate] the same tree or the green means nothing. Commit or stash, then push again.')
      return 1
    }
    console.error('[gate] This hand run measures the working tree as it stands, not a commit.')
  }

  let selected = STEPS
  if (only) {
    const unknown = [...only].filter((id) => !STEPS.some((s) => s.id === id))
    if (unknown.length > 0) {
      console.error(`[gate] unknown step(s): ${unknown.join(', ')}. Steps: ${STEPS.map((s) => s.id).join(', ')}`)
      return 1
    }
    selected = STEPS.filter((s) => only.has(s.id))
    console.log(`[gate] PARTIAL RUN (--only ${[...only].join(',')}): a hand run of ${selected.length} step(s). This is not a push verdict.`)
  }

  const results = []
  const startedAll = Date.now()
  for (const [i, step] of selected.entries()) {
    const started = Date.now()
    console.log('')
    console.log('='.repeat(72))
    console.log(`[gate] ${i + 1}/${selected.length} ${step.id}: ${step.title}`)
    console.log(`[gate]     stands in for ${step.ci}`)
    console.log('='.repeat(72))
    let code
    try {
      code = await step.run(envFor(step.env))
    } catch (error) {
      console.error(`[gate] ${step.id} threw: ${error.stack ?? error.message}`)
      code = 1
    }
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    results.push({ id: step.id, ok: code === 0, secs })
    if (code !== 0) {
      summary(results, selected)
      console.error('')
      console.error(`[gate] BLOCKED at ${step.id} (exit ${code}) after ${secs}s. Nothing was pushed.`)
      console.error(`[gate] Fix it, re-run just this step with:  npm run gate:push -- --only ${step.id}`)
      console.error('[gate] then push again; the hook runs the whole gate on the push.')
      return 1
    }
  }
  summary(results, selected)
  const total = ((Date.now() - startedAll) / 1000).toFixed(0)
  console.log('')
  console.log(`[gate] GREEN: ${selected.length} of ${selected.length} step(s) passed in ${total}s.${only ? ' PARTIAL RUN, not a push verdict.' : ''}`)
  return 0
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  process.exitCode = await main()
}
