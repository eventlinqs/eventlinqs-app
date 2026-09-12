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
 *   checkout-viewport       local only: the buyer's surfaces at 390, 768 and 1440 (UX6)
 *   lighthouse              Lighthouse CI > Lighthouse mobile gate, on THIS build served locally
 *
 * THE LIGHTHOUSE STEP IS THE SAME GATE, NOT A LOOKALIKE. It starts the
 * production build with `next start`, resolves the PINNED url set through
 * scripts/ci/resolve-gate-urls.mjs, warms pages and the image optimiser with
 * scripts/ci/warm-preview.mjs, collects with the Lighthouse that the same
 * @lhci/cli spec bundles and the same settings from lighthouserc.json, runs
 * the same aggregation report and SEO assertion, and asserts with
 * `lhci assert` on the same lighthouserc.json. No threshold lives here. What
 * differs is the host: a warmed local server instead of a Vercel preview, so
 * the number is the product rather than the runner (the founder ruling of
 * 25 August 2026 on the CI gate rests on that distinction). The step BLOCKS:
 * that is what the close-out asked for, and the standing 95+ law is what the
 * product should achieve. The collection is driven by the gate rather than by
 * `lhci collect` for one reason, stated at judgeLighthouseRun: on Windows the
 * launcher's profile cleanup races Chrome's exit and LHCI's runner counts a
 * finished audit as a failed run.
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
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { calibrationReport } from '../ci/lighthouse-calibration.mjs'
import { gitEnv } from '../lib/git-env.mjs'
import { PARITY_SINK_PORT } from '../verify/sentry-parity-sink.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const NODE = process.execPath
const NPM_CLI = join(dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const NPX_CLI = join(dirname(NODE), 'node_modules', 'npm', 'bin', 'npx-cli.js')
/** The exact package spec .github/workflows/lighthouse.yml runs, so the assertion engine is the same one. */
export const LHCI_SPEC = '@lhci/cli@0.15.1'
const TMP = join(ROOT, '.tmp')
const GATE_URLS = join(TMP, 'gate-urls.txt')
const SERVER_LOG = join(TMP, 'gate-server.log')
const INDEXING_LOG = join(TMP, 'gate-indexing-server.log')
const CHECKOUT_LOG = join(TMP, 'gate-checkout-server.log')
const ROUTE_SWEEP_LOG = join(TMP, 'gate-route-sweep-server.log')
const LHCI_DIR = join(ROOT, '.lighthouseci')
const ZERO_SHA = /^0{40}$/

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * THE CLIENT-SDK PARITY DSN. Close-out P0.2: "If local says pass and CI says
 * fail, the local gate is lying and that is a defect in the gate."
 *
 * It was lying, and this is the mechanism. `NEXT_PUBLIC_SENTRY_DSN` is inlined
 * into the CLIENT bundle at build time, and instrumentation-client.ts refuses
 * to load the SDK at all when it is empty. On the founder's machine .env.local
 * carries `NEXT_PUBLIC_SENTRY_DSN=""`, so every local gate build shipped a
 * browser bundle with no error-reporting SDK in it, while every Vercel preview
 * CI measures ships one.
 *
 * MEASURED, 8 September 2026, on the deployed preview of main's tree
 * (scripts/perf/chunk-cost-table.mjs, run 34188084768's preview): the SDK and
 * its Session Replay recorder are 217.8 KB of the event page's 439.0 KB of
 * script, arrive by dynamic import, and carry 644 ms of script evaluation. The
 * local gate could not see one byte of it. That is the whole of the 5 to 15
 * point gap this repository kept recording between the local gate and the
 * runner, and it meant the local Lighthouse step could go green on a build
 * nobody deploys.
 *
 * WHY A SYNTHETIC ONE AND NOT THE REAL ONE. The cost being measured is bytes
 * and main-thread evaluation, which the SDK pays identically whatever the DSN
 * points at. A real DSN would send this machine's audit traffic to the
 * founder's production Sentry project, which is the exact failure
 * shouldInitSentry() was written to prevent.
 *
 * WHY IT POINTS AT LOCALHOST AND NOT AT AN UNRESOLVABLE HOST. The first attempt
 * used an RFC 2606 `.invalid` host, on the reasoning that a name which can never
 * resolve can never receive anything. THE GATE REFUSED IT, and was right: the
 * SDK opens a session envelope on every page load, the request failed with
 * ERR_NAME_NOT_RESOLVED, Chrome logged "Failed to load resource", and
 * Lighthouse's `errors-in-console` audit took best practices from 1.00 to 0.93
 * on all thirteen gated URLs on all five runs. A parity fix that introduces a
 * difference of its own is not parity. scripts/verify/sentry-parity-sink.mjs
 * answers this address so the send SUCCEEDS, nothing leaves the machine, and no
 * console error is logged.
 *
 * A DSN ALREADY IN THE ENVIRONMENT ALWAYS WINS. This only fills a hole.
 */
export const PARITY_SENTRY_DSN = `http://0000000000000000000000000000000a@127.0.0.1:${PARITY_SINK_PORT}/1`

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

/**
 * The environment a step runs in: git variables cleared, and .env.local for the
 * steps that read the database.
 *
 * @param {string} kind 'local' to merge .env.local, anything else for a plain shell.
 * @param {{ root?: string, shell?: Record<string, string | undefined> }} [options]
 *   Injection seams for the tests: which tree's .env.local to read, and what to
 *   treat as the ambient shell. Neither is passed in real use.
 * @returns {Record<string, string | undefined>}
 */
export function envFor(kind, { root = ROOT, shell = /** @type {Record<string, string | undefined>} */ (gitEnv()) } = {}) {
  const base = { ...shell, NEXT_TELEMETRY_DISABLED: '1' }
  if (kind !== 'local') return base
  const file = join(root, '.env.local')
  if (existsSync(file)) {
    for (const [name, value] of Object.entries(parseEnvFile(readFileSync(file, 'utf8')))) {
      if (base[name] === undefined) base[name] = value
    }
  }
  // See PARITY_SENTRY_DSN. Without this the local build ships a browser bundle
  // CI never measures, and the local Lighthouse step judges a page that is
  // 217.8 KB lighter than the one that deploys.
  if (!nonEmpty(base.NEXT_PUBLIC_SENTRY_DSN)) base.NEXT_PUBLIC_SENTRY_DSN = PARITY_SENTRY_DSN
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

/**
 * Production parity (close-out C16.2.1) asks production, before a push, whether
 * it carries every migration this tree needs and whether its store satisfies
 * the manifest: the two questions nothing asked before the merges of
 * 6 September 2026 went red on main. The Supabase token comes from the same
 * Credential Manager helper as the types-drift step; the Vercel token is
 * VERCEL_TOKEN from .env.local if one is set, otherwise the login the Vercel CLI
 * already keeps on this machine, resolved inside the step (the step says so
 * when it has neither).
 */
function runProductionParity(env) {
  if (nonEmpty(env.SUPABASE_ACCESS_TOKEN)) return exec(NODE, ['scripts/ops/production-parity.mjs'], env)
  if (process.platform === 'win32') {
    return exec(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/ops/with-supabase-token.ps1', 'node', 'scripts/ops/production-parity.mjs'],
      env,
    )
  }
  console.error('[gate] SUPABASE_ACCESS_TOKEN is not set, and the Credential Manager helper is Windows only.')
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

/**
 * Stop a child and everything it spawned, and READ the verdict of the attempt.
 *
 * On Windows `taskkill /T /F` is the only way to reach the grandchildren, and
 * its exit status used to be ignored. On 7 September 2026 the red Lighthouse
 * path left the `next start` server and the Upstash stub alive with no line
 * printed, the gate process stayed alive on their two handles, and git never got
 * the hook's exit: a refused push that hung until somebody killed it by hand.
 * Now a taskkill that cannot start or exits non-zero is said out loud and the
 * plain signal is sent next, and the handle is released either way, so a child
 * that survives both attempts cannot hold a decided verdict back from git.
 *
 * Returns what happened, for the test and the log: 'exited' (nothing to do),
 * 'killed' (taskkill succeeded), 'fallback' (taskkill failed, SIGTERM sent) or
 * 'signalled' (not Windows, SIGTERM sent).
 *
 * @param {{ pid?: number, exitCode: number | null, kill: (signal: string) => unknown, unref?: () => void } | null | undefined} child
 * @param {{ run?: (command: string, args: string[], options: object) => { error?: Error, status?: number | null, stdout?: string, stderr?: string }, platform?: string, warn?: (message: string) => void }} [options]
 */
export function killTree(child, { run = spawnSync, platform = process.platform, warn = (m) => console.warn(m) } = {}) {
  if (!child || child.exitCode !== null) return 'exited'
  let outcome = 'signalled'
  if (platform === 'win32') {
    const r = run('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (r.error) {
      warn(`[gate] taskkill could not start for pid ${child.pid}: ${r.error.message}; sending SIGTERM instead`)
      outcome = 'fallback'
    } else if (r.status !== 0) {
      const said = String(r.stderr || r.stdout || '').trim().split(/\r?\n/)[0] ?? ''
      warn(`[gate] taskkill exited ${r.status} for pid ${child.pid}: ${said}; sending SIGTERM instead`)
      outcome = 'fallback'
    } else {
      outcome = 'killed'
    }
  }
  if (outcome !== 'killed') {
    try {
      child.kill('SIGTERM')
    } catch (error) {
      warn(`[gate] kill failed for pid ${child.pid}: ${error.message}`)
    }
  }
  // The verdict is decided and git is waiting for it; a child that refuses to
  // die must not keep this process alive.
  if (typeof child.unref === 'function') child.unref()
  return outcome
}

function tailOf(file, lines = 40) {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/).slice(-lines).join('\n')
  } catch (error) {
    return `(no log to read: ${error.message})`
  }
}

/**
 * One Lighthouse run, judged. Exported for the unit test.
 *
 * WHY THE GATE JUDGES A RUN ITSELF instead of leaving it to `lhci collect`.
 * On Windows, chrome-launcher removes Chrome's scratch profile in the same
 * breath as killing Chrome, and Chrome (or the antivirus reading the new
 * profile) still holds a handle: `rmSync` throws EPERM, AFTER the audit has
 * finished and the report has been written to disk. Lighthouse then exits 1.
 * LHCI's runner carries a tolerance for the Windows kill race, but it requires
 * the words "Chrome could not be killed" on stderr, and this variant kills
 * Chrome cleanly and dies on the delete, so on 5 September 2026 every run of
 * the first push through this gate "failed" three times with a complete
 * report on disk each time. scripts/verify/lighthouse-median.mjs documents
 * the identical race and judges by the report; so does this. A missing,
 * unparseable or runtime-errored report is the failure. An exit code with a
 * finished audit behind it is not.
 */
export function judgeLighthouseRun({ code, platform, stderr, report }) {
  if (!report) return { ok: false, why: `no report was written (exit ${code})` }
  if (typeof report.lighthouseVersion !== 'string') return { ok: false, why: 'the report carries no lighthouseVersion' }
  if (report.runtimeError) {
    return { ok: false, why: `runtime error ${report.runtimeError.code}: ${report.runtimeError.message}` }
  }
  if (code === 0) return { ok: true, why: 'exit 0' }
  if (platform === 'win32' && (stderr ?? '').includes('Generating results...')) {
    return {
      ok: true,
      why: `exit ${code} after the audit finished and the report was written (the Windows profile-cleanup race, tolerated the way LHCI and lighthouse-median do)`,
    }
  }
  return { ok: false, why: `exit ${code} and the audit did not report finishing` }
}

/**
 * The Lighthouse CLI that LHCI bundles, so the local measurement is taken by
 * the SAME Lighthouse version CI uses (12.1.0 under @lhci/cli 0.14), not by the
 * newer one this repository installs for its own scripts. Resolved by asking
 * npx for the package tree, never by guessing a cache path.
 */
function bundledLighthouseCli(env) {
  mkdirSync(TMP, { recursive: true })
  const probe = join(TMP, 'lhci-lighthouse-path.cjs')
  writeFileSync(
    probe,
    [
      "const path = require('node:path')",
      "const bins = (process.env.PATH || '').split(path.delimiter).filter((p) => /_npx/.test(p))",
      'for (const bin of bins) {',
      "  try { console.log(require.resolve('lighthouse/cli/index.js', { paths: [bin] })); process.exit(0) } catch (error) { void error }",
      '}',
      "console.error('no bundled lighthouse under an _npx bin dir on PATH: ' + bins.join(' | '))",
      'process.exit(1)',
      '',
    ].join('\n'),
  )
  const r = spawnSync(NODE, [NPX_CLI, '--yes', '-p', LHCI_SPEC, '--', 'node', probe], { cwd: ROOT, env, encoding: 'utf8' })
  rmSync(probe, { force: true })
  const cli = (r.stdout ?? '').trim().split(/\r?\n/).pop() ?? ''
  if (r.status !== 0 || !cli || !existsSync(cli)) {
    console.error(`[gate] could not locate the Lighthouse CLI bundled with ${LHCI_SPEC}: ${(r.stderr ?? '').trim() || `exit ${r.status}`}`)
    return null
  }
  return cli
}

/**
 * What `lhci collect` does, run by the gate: the pinned settings from
 * lighthouserc.json handed to Lighthouse through --cli-flags-path exactly as
 * LHCI's runner hands them (headless appended, the runner-only keys removed),
 * numberOfRuns per URL, three attempts per run, each report saved as
 * .lighthouseci/lhr-<stamp>.json where `lhci assert`, the aggregation report
 * and the SEO assertion all read it. No threshold lives here.
 */
function collectLikeLhci(urls, env) {
  const rc = JSON.parse(readFileSync(join(ROOT, 'lighthouserc.json'), 'utf8'))
  const collect = rc?.ci?.collect ?? {}
  const runs = Number(collect.numberOfRuns ?? 1)
  const settings = { ...(collect.settings ?? {}) }
  settings.chromeFlags = `${settings.chromeFlags ?? ''} --headless=new`.trim()
  for (const k of ['auditMode', 'gatherMode', 'output', 'outputPath', 'channel', 'listAllAudits', 'listAllCategories', 'printConfig']) {
    delete settings[k]
  }
  const cli = bundledLighthouseCli(env)
  if (!cli) return 1
  let version = 'unknown'
  try {
    version = JSON.parse(readFileSync(join(dirname(cli), '..', 'package.json'), 'utf8')).version
  } catch (error) {
    console.warn(`[gate] could not read the bundled Lighthouse version: ${error.message}`)
  }
  console.log(`[gate] collecting with Lighthouse ${version}, the version ${LHCI_SPEC} bundles, ${runs} run(s) per URL, settings from lighthouserc.json`)

  rmSync(LHCI_DIR, { recursive: true, force: true })
  mkdirSync(LHCI_DIR, { recursive: true })
  const flagsFile = join(LHCI_DIR, 'flags-gate.json')
  writeFileSync(flagsFile, JSON.stringify(settings))
  let stamp = Date.now()
  try {
    for (const url of urls) {
      console.log(`Running Lighthouse ${runs} time(s) on ${url}`)
      for (let i = 0; i < runs; i += 1) {
        let done = false
        const whys = []
        for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
          stamp = Math.max(stamp + 1, Date.now())
          const file = join(LHCI_DIR, `lhr-${stamp}.json`)
          const r = spawnSync(NODE, [cli, url, '--output', 'json', '--output-path', file, '--cli-flags-path', flagsFile], {
            cwd: ROOT,
            env,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            windowsHide: true,
          })
          let report = null
          if (existsSync(file)) {
            try {
              report = JSON.parse(readFileSync(file, 'utf8'))
            } catch (error) {
              whys.push(`unparseable report: ${error.message}`)
            }
          }
          const verdict = judgeLighthouseRun({ code: r.status, platform: process.platform, stderr: r.stderr ?? '', report })
          if (verdict.ok) {
            done = true
            const perf = report?.categories?.performance?.score
            console.log(`Run #${i + 1}...done, performance ${perf == null ? 'n/a' : perf.toFixed(2)} (${verdict.why})`)
            continue
          }
          whys.push(verdict.why)
          rmSync(file, { force: true })
          console.log(`Run #${i + 1} attempt ${attempt}...failed: ${verdict.why}`)
          if (attempt === 3) console.error((r.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-12).join('\n'))
        }
        if (!done) {
          console.error(`[gate] Lighthouse could not measure ${url}: ${whys.join('; ')}`)
          return 1
        }
      }
    }
    return 0
  } finally {
    rmSync(flagsFile, { force: true })
  }
}

/**
 * ONE PLACE THAT DECIDES WHAT A SERVED-BUILD GATE STEP NEEDS.
 *
 * WHY IT EXISTS, 10 September 2026, found by the gate failing on itself. Three
 * steps served the production build and each spawned `next start` itself, in
 * three near-identical blocks. Two of them handed the server no Redis. The
 * Lighthouse one did, and said why in its own comment:
 *
 *     "The rate limiter on the money path is fail-closed under
 *      NODE_ENV=production, so the app is pointed at the in-memory Upstash stub
 *      the drives use, never at a shared instance."
 *
 * That is exactly right, and it was on the step that never buys anything. The
 * step that DOES buy a ticket, the UX6 checkout drive, had no stub, so under
 * `next start` every reservation and every checkout submit was refused by
 * `checkout-reserve` (`failClosed: true`) before it reached a line of product
 * code. The drive then reported six faults across three widths that read as
 * product defects and were not one: `.tmp/gate-checkout-server.log` carried
 * `[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set` fifty
 * times over.
 *
 * A gate that fails for its own reasons is worse than no gate, because somebody
 * spends a day on the product it accused. So the decision lives here once,
 * every served-build step goes through it, and
 * `scripts/guards/gate-servers-carry-a-limiter.mjs` fails the build if a fourth
 * one is ever born outside it.
 *
 * `mail` chooses the transport, and it is an option rather than a constant
 * because two kinds of step need opposite things. Every journey step needs
 * `console`, which prints the message so the harness can read a confirmation
 * link out of the log. The UX3.2 escalation drive needs the opposite: it proves
 * what happens when email FAILS three times and the second channel carries the
 * alert instead, and a transport that always succeeds can never show that. The
 * limiter is not part of this choice and is handed over either way.
 *
 * Returns `{ base, stop }` on success, or `{ error }` with the log already
 * tailed to stderr.
 */
export async function startGateServer(env, logPath, { also = [], mail = 'console' } = {}) {
  mkdirSync(TMP, { recursive: true })
  const stubPort = await freePort()
  const appPort = await freePort()
  const base = `http://127.0.0.1:${appPort}`
  const fd = openSync(logPath, 'w')
  // EMAIL_TRANSPORT=console refuses a production project, and the Upstash stub
  // is in-memory and local only: never a shared instance.
  const stub = spawn(NODE, ['scripts/verify/upstash-local-stub.mjs'], {
    cwd: ROOT,
    env: { ...env, PORT: String(stubPort) },
    stdio: ['ignore', fd, fd],
  })
  // Anything else this step needs beside the server, on the same log, so one
  // file carries the whole picture when a step goes red.
  const extras = also.map((args) => spawn(NODE, args, { cwd: ROOT, env, stdio: ['ignore', fd, fd] }))
  const server = spawn(NODE, ['node_modules/next/dist/bin/next', 'start', '--port', String(appPort)], {
    cwd: ROOT,
    env: {
      ...env,
      PORT: String(appPort),
      // 'console' prints what would have been sent, which is how the journey
      // harness reads a confirmation link. 'real' leaves EMAIL_TRANSPORT
      // unset so the REAL transport runs, which on a machine with no
      // RESEND_API_KEY throws - and that is the only way a step can drive what
      // the platform does when email FAILS (close-out UX3.2, the second
      // channel). A step that needs a confirmation link must never ask for it.
      ...(mail === 'console' ? { EMAIL_TRANSPORT: 'console' } : { EMAIL_TRANSPORT: '' }),
      UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${stubPort}`,
      UPSTASH_REDIS_REST_TOKEN: 'local',
    },
    stdio: ['ignore', fd, fd],
  })
  const stop = () => {
    killTree(server)
    for (const extra of extras) killTree(extra)
    killTree(stub)
    closeSync(fd)
  }
  /*
   * THE STUB IS PROVEN TO ANSWER, NOT ASSUMED TO BE THERE.
   *
   * Handing the server a URL and never checking it is the same failure one
   * layer along: an unreachable limiter backend is indistinguishable from no
   * backend, so the money path fails closed exactly as it did with no stub at
   * all, and the drive blames the product again. It is checked here, once, for
   * every step, and a failure names the stub rather than the checkout.
   */
  const pong = await pingUpstashStub(stubPort)
  if (pong) {
    console.error(`[gate] the Upstash stub is not answering on 127.0.0.1:${stubPort}: ${pong}`)
    console.error('[gate] Without it the money-path limiter (checkout-reserve, failClosed) refuses every')
    console.error('[gate] reservation under NODE_ENV=production, and a drive would report that as a product defect.')
    console.error(tailOf(logPath))
    stop()
    return { error: pong }
  }

  const notUp = await waitForServer(base, server, 120_000)
  if (notUp) {
    console.error(`[gate] ${notUp}. Server log tail (${logPath}):`)
    console.error(tailOf(logPath))
    stop()
    return { error: notUp }
  }
  return { base, stop, extras, logPath }
}

/** PING the in-memory stub until it says PONG. Returns null when it did. */
async function pingUpstashStub(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let last = 'never answered'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(['PING']),
        signal: AbortSignal.timeout(5_000),
      })
      const body = await res.json()
      if (body?.result === 'PONG') return null
      last = `answered ${res.status} with ${JSON.stringify(body).slice(0, 80)}`
    } catch (error) {
      last = error.message
    }
    await sleep(500)
  }
  return `${last} within ${timeoutMs / 1000}s`
}

/**
 * The Lighthouse mobile gate, on this tree's production build, served locally.
 * Every script here is the one the workflow runs; the only substitution is the
 * host.
 */
/**
 * THE INDEXING POLICY, DRIVEN AGAINST THIS BUILD (close-out C19).
 *
 * scripts/guards/indexing-policy.mjs reads the source and runs in the guard
 * registry above. It cannot see what a RUNNING page emits, and the defect that
 * started C19 was exactly that: the pages all declared correct-looking metadata
 * and Next's field-by-field merge published the homepage as the canonical of 57
 * of them. Only a fetch shows that, so this serves the production build and
 * reads the tags off the responses.
 *
 * Its own server, deliberately, rather than sharing the Lighthouse step's: a
 * step that fails should name the thing that failed, and folding two unrelated
 * checks into one line is how a red gate becomes hard to read.
 */
async function runIndexingDrive(env) {
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    console.error('[gate] no production build under .next (no BUILD_ID). The build step produces it; run the whole gate.')
    return 1
  }
  const started = await startGateServer(env, INDEXING_LOG)
  if (started.error) return 1
  const { base, stop } = started
  try {
    const drive = exec(NODE, ['scripts/verify/indexing-drive.mjs', base], env)
    if (drive !== 0) return drive
    /*
     * The structured data is VALIDATED here, not assumed (close-out C19.4).
     * Added 8 September 2026 after the roast of C19: the first pass read the
     * @type values out of each page and stopped, and a run across all 550
     * published URLs then found 488 of them emitting an ItemList with
     * `itemListElement: []` - markup asserting a list and listing nothing, on
     * exactly the empty pages C19.3 exists to stop advertising. Reading a type
     * is not validating a payload, and this step is the difference.
     */
    const structured = exec(NODE, ['scripts/verify/structured-data-validate.mjs', base], env)
    if (structured !== 0) return structured
    /*
     * And the fourth question C19.1 asks, which the first pass skipped: is every
     * page we want ranked reachable by an internal link? It found five faith
     * pages, 21 browse-city pages and every venue profile reachable by nothing at
     * all. Since a templated page can now leave the sitemap while it is empty, a
     * link is the only way in, so this is not a tidiness check.
     */
    return exec(NODE, ['scripts/verify/internal-reachability.mjs', base], env)
  } finally {
    stop()
  }
}

/**
 * EVERY DECLARED ROUTE, DRIVEN AGAINST THIS BUILD (L1 item 14, before the push).
 *
 * 12 September 2026: the first production smoke after the merge of #145 found
 * /unsubscribe/recovery/zzzzzzzzzzzz answering 500. The route was new, the gate
 * had passed the tree that carried it, and the sweep that found the fault was
 * only ever pointed at production after a deploy. So the sweep now runs here,
 * on the served build, with --all-routes, because a local build serves every
 * route in the tree and the production filter (routes main has merged) would
 * skip exactly the newest ones. GET only; it writes nothing.
 */
async function runRouteSweep(env) {
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    console.error('[gate] no production build under .next (no BUILD_ID). The build step produces it; run the whole gate.')
    return 1
  }
  const started = await startGateServer(env, ROUTE_SWEEP_LOG)
  if (started.error) return 1
  const { base, stop } = started
  try {
    return exec(
      NODE,
      ['scripts/verify/production-route-sweep.mjs', '--base', base, '--out', join(TMP, 'route-sweep'), '--all-routes'],
      env,
    )
  } finally {
    stop()
  }
}

/**
 * THE BUYER'S SURFACES, AT 390, 768 AND 1440 (close-out UX6).
 *
 * The static half of UX6 is two registered guards in the registry above
 * (grid-track-cannot-blow-out, buyer-total-is-marked), so CI runs it in the
 * build. Neither can see a laid-out page, and UX6 is a LAYOUT defect: the owner
 * bought a ticket on a phone and could not see the total he was paying, on a
 * page whose markup was, and still is, entirely reasonable to read.
 *
 * So this serves the production build and WALKS it, twice per width, once on a
 * free event through to a real issued ticket and once on a paid event as far as
 * a live Stripe TEST key allows, measuring every stop.
 *
 * Its own server, for the reason the indexing step gives: a red step should name
 * the thing that failed.
 *
 * It is a LOCAL step, like the indexing drive, because CI runs against a
 * placeholder database and cannot buy a ticket.
 */
async function runCheckoutViewportDrive(env) {
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    console.error('[gate] no production build under .next (no BUILD_ID). The build step produces it; run the whole gate.')
    return 1
  }
  const started = await startGateServer(env, CHECKOUT_LOG)
  if (started.error) return 1
  const { base, stop } = started
  try {
    return exec(NODE, ['scripts/verify/ux6-checkout-viewport-proof.mjs', base], env)
  } finally {
    stop()
  }
}

/**
 * Every report this collection wrote, parsed.
 *
 * Read from disk rather than kept in memory because collectLikeLhci retries a
 * failed run and deletes the report it wrote, so the files on disk are the
 * authoritative set of runs that counted. Exported for the unit test.
 *
 * A report that will not parse is skipped rather than thrown on: this runs on
 * the FAILURE path, where the job is to add a diagnosis, and a diagnosis that
 * can crash would replace the failure the reader came for.
 */
export function readCollectedReports(dir = LHCI_DIR) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('lhr-') || !name.endsWith('.json')) continue
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), 'utf8')))
    } catch (error) {
      // Skipped, not thrown on: this runs on the FAILURE path and a diagnosis
      // that can crash would replace the failure the reader came for. It is
      // still SAID, because an unreadable report means the machine reading for
      // that run is missing from the verdict below.
      console.warn(`[gate] could not read ${name} for the machine reading: ${error.message}`)
    }
  }
  return out
}

async function runLighthouse(env) {
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    console.error('[gate] no production build under .next (no BUILD_ID). The build step produces it; run the whole gate.')
    return 1
  }
  // The Sentry sink is the endpoint the parity DSN names. Without it the SDK's
  // session envelope fails to connect, Chrome logs it, and Lighthouse's
  // errors-in-console audit takes best practices from 1.00 to 0.93 on every
  // gated URL. See PARITY_SENTRY_DSN and scripts/verify/sentry-parity-sink.mjs.
  const started = await startGateServer(env, SERVER_LOG, {
    also: [['scripts/verify/sentry-parity-sink.mjs']],
  })
  if (started.error) return 1
  const { base, stop, extras } = started
  const [sentrySink] = extras
  try {
    console.log(`[gate] production build answering on ${base} (server log: .tmp/gate-server.log)`)

    // The sink is CHECKED, not assumed. If it is not answering, every audited
    // page logs a failed telemetry request and best practices drops to 0.93 on
    // all thirteen URLs, which reads like a product regression and is not one.
    const sinkUp = await waitForServer(`http://127.0.0.1:${PARITY_SINK_PORT}`, sentrySink, 20_000)
    if (sinkUp) {
      console.error(`[gate] the Sentry parity sink is not answering on 127.0.0.1:${PARITY_SINK_PORT}: ${sinkUp}`)
      console.error('[gate] Something else is probably on that port. Free it and re-run; without the sink')
      console.error('[gate] this step measures a console error the deployed build does not have.')
      console.error(tailOf(SERVER_LOG))
      return 1
    }
    console.log(`[gate] Sentry parity sink answering on 127.0.0.1:${PARITY_SINK_PORT}`)

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

    const collected = collectLikeLhci(urls, env)
    if (collected !== 0) return collected
    // Two reporters, never a verdict: every run value and the aggregation the
    // floors use, then the truth table (medians per URL, LCP, TBT, CLS, script
    // bytes and the named LCP element; close-out C8 CORRECTED, 7 September 2026).
    exec(NODE, ['scripts/ci/lighthouse-aggregation-report.mjs', '.lighthouseci'], env)
    exec(NODE, ['scripts/ci/lighthouse-truth-table.mjs', '.lighthouseci'], env)
    const seo = exec(NODE, ['scripts/ci/assert-seo-audits.mjs', '.lighthouseci'], env)
    if (seo !== 0) return seo
    const asserted = exec(NODE, [NPX_CLI, '--yes', LHCI_SPEC, 'assert', '--config=./lighthouserc.json'], env)
    // A RED SCORE HAS TWO POSSIBLE CAUSES AND THE NUMBERS CANNOT TELL THEM
    // APART. Either the page got slower, or this laptop did. Until 9 September
    // 2026 the step reported only the first, and on 8 September that sent a
    // whole session after the product and then after the floors, for a
    // collection taken on a machine running at 41% of the speed the floors were
    // confirmed at. scripts/ci/lighthouse-calibration.mjs reads the machine
    // Lighthouse recorded for itself in each report and says which it was.
    //
    // IT CANNOT CHANGE THE VERDICT: `asserted` is returned untouched either way.
    if (asserted !== 0) {
      console.error('')
      console.error(calibrationReport(readCollectedReports()))
    }
    return asserted
  } finally {
    stop()
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
    id: 'production-parity',
    ci: 'CI > production parity',
    title: 'production parity: every migration applied on production, the production store satisfying the manifest',
    mirrors: ['node scripts/ops/production-parity.mjs'],
    env: 'local',
    run: runProductionParity,
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
    id: 'indexing',
    ci: 'local only: the driven half of close-out C19 (the static half is a registered guard, so CI runs it in the build)',
    title: 'the indexing policy, the structured data and internal reachability, driven against this build',
    mirrors: [],
    env: 'local',
    run: runIndexingDrive,
  },
  {
    id: 'route-sweep',
    ci: 'local only: every declared route driven against this build (L1 item 14; the production smoke drives the live site after a deploy)',
    title: 'every route in src/app answering as it should, on this build, GET only',
    mirrors: [],
    env: 'local',
    run: runRouteSweep,
  },
  {
    id: 'checkout-viewport',
    ci: 'local only: the driven half of close-out UX6 (the static half is two registered guards, so CI runs them in the build)',
    title: "the buyer's surfaces measured at 390, 768 and 1440, on this build",
    mirrors: [],
    env: 'local',
    run: runCheckoutViewportDrive,
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
  if (envFor('local').NEXT_PUBLIC_SENTRY_DSN === PARITY_SENTRY_DSN) {
    console.log('[gate] no NEXT_PUBLIC_SENTRY_DSN in the environment, so the build uses the parity DSN')
    console.log(`[gate]   ${PARITY_SENTRY_DSN} (RFC 2606 reserved, cannot resolve, sends nothing anywhere)`)
    console.log('[gate]   The client SDK therefore loads and evaluates here exactly as it does on a preview,')
    console.log('[gate]   which is what CI measures. Without it this gate judges a bundle nobody deploys.')
  }
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
