/**
 * A LOCAL SERVER THAT CAN TAKE A CARD, started with one command.
 *
 * WHY IT EXISTS (Law 10: script the founder's step, and offer it first). Four
 * separate things have to be true before a local drive can take a buyer past
 * the payment step, and each one fails in a way that reads as a product defect:
 *
 *   1. A TEST SECRET KEY. `.env.local` carries an empty one. The Stripe CLI
 *      holds a working pair; this reads it (never printing it) and hands it to
 *      the server.
 *   2. A PUBLISHABLE KEY FROM THE SAME ACCOUNT. `.env.local`'s belongs to a
 *      different account, and a mismatched pair fails inside Stripe's own iframe
 *      with a message the drive never sees. Next.js reads `NEXT_PUBLIC_*` from
 *      `process.env` in preference to `.env.local`, so passing it here wins.
 *   3. A WEBHOOK SIGNING SECRET THAT MATCHES THE LISTENER. Only the webhook
 *      moves an order out of `pending`. `stripe listen` mints a NEW secret per
 *      session, so any value from a file is guaranteed wrong and every payment
 *      succeeds while no ticket is ever issued.
 *   4. A RATE-LIMIT STORE AND A MAIL TRANSPORT. Without them signup and reserve
 *      answer "a service we depend on is unavailable", which is the limiter
 *      working correctly and is indistinguishable at the UI from broken code.
 *
 * WHAT IT REFUSES. A live key in either slot. A pair naming two accounts. A
 * shell pointed at production Supabase. It kills no process it did not start
 * except a Next server whose own command line names THIS worktree, because
 * three lanes build on this machine and a port is not proof of ownership.
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs            # start
 *   node scripts/dev/lane-b-serve-with-stripe.mjs --measurement-ids
 *                                                # start, plus four FAKE
 *                                                # provider identifiers so
 *                                                # AN1's consent gate has
 *                                                # something to open onto
 *   node scripts/dev/lane-b-serve-with-stripe.mjs --status   # report only
 *   node scripts/dev/lane-b-serve-with-stripe.mjs --stop     # stop what it started
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, openSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { openStepLog } from '../ops/pre-push-gate.mjs'
import { readStripeTestKeys, probeStripeTestKey } from '../verify/lib/stripe-cli-test-keys.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const PORT = Number(process.env.PORT ?? 3100)
const SHIM_PORT = Number(process.env.UPSTASH_SHIM_PORT ?? 8179)
const SERVER_LOG = resolve(ROOT, '.tmp-lane-b-serve.log')
const LISTEN_LOG = resolve(ROOT, '.tmp-lane-b-stripe-listen.log')
const SHIM_LOG = resolve(ROOT, '.tmp-lane-b-upstash.log')
const mode = process.argv.includes('--stop')
  ? 'stop'
  : process.argv.includes('--status')
    ? 'status'
    : 'start'

/**
 * FOUR IDENTIFIERS SO THE CONSENT GATE HAS SOMETHING TO OPEN ONTO.
 *
 * Law 10, added 19 September 2026. AN1 acceptance 2's positive half cannot be
 * driven against a server that was given no provider identifiers: the gate
 * correctly renders nothing, so accepting and refusing produce the same empty
 * network log and the drive has nothing to tell them apart with. The step that
 * fixes that is "export four variables into the environment of the server, not
 * of the drive", which is a distinction that costs an hour the first time
 * somebody gets it the wrong way round. So it is one flag.
 *
 * THE VALUES ARE DELIBERATELY, VISIBLY FAKE. They are never real accounts, they
 * name this lane in their own text, and nothing ever reaches the third parties:
 * the drive aborts every request to a provider host at the route layer, so the
 * attempt is recorded and Google and Meta receive nothing. Minting the real
 * ones is the owner's step and stays his (FOUNDER STEPS in AN1).
 */
const FAKE_MEASUREMENT_IDS = {
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_lane_b_local_drive_not_a_real_key',
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-LANEBLOCAL0',
  NEXT_PUBLIC_GOOGLE_ADS_ID: 'AW-0000000000',
  NEXT_PUBLIC_META_PIXEL_ID: '000000000000000',
}
const withMeasurementIds = process.argv.includes('--measurement-ids')

const say = m => console.log(`[lane-b-serve] ${m}`)
const die = m => {
  console.error(`[lane-b-serve] REFUSED: ${m}`)
  process.exit(1)
}

function envFile() {
  const out = {}
  if (!existsSync(resolve(ROOT, '.env.local'))) return out
  for (const raw of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function ps(script) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      timeout: 60000,
    })
  } catch (err) {
    return String(err.stdout ?? '')
  }
}

/*
 * A COMMAND LINE IS A PLACE A SECRET LIVES, and this script learned it the
 * embarrassing way.
 *
 * `stripe listen --api-key sk_test_...` carries the key in argv, so every
 * process on the machine can read it and, more to the point, `stopMine` printed
 * it verbatim while the header of this file promised a key is never printed. A
 * promise a file makes about itself has to be enforced in the file.
 *
 * Every key-shaped run is replaced by its prefix and its ACCOUNT, which is the
 * only part a reader ever needs: it says which platform the process was talking
 * to and nothing that opens it.
 */
function redactKeys(text) {
  return String(text).replace(
    /\b([sprk]k)_(test|live)_[A-Za-z0-9]{20,}/g,
    (whole, prefix, mode) => `${prefix}_${mode}_<acct_${whole.slice(9, 25)}>`,
  )
}

/** Processes whose command line names this worktree. Never matched on name alone. */
function minePids(pattern) {
  const out = ps(
    `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='stripe.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*${pattern}*' } | ` +
      `ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`,
  )
  return out
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const i = l.indexOf('|')
      return { pid: Number(l.slice(0, i)), cmd: l.slice(i + 1) }
    })
}

/*
 * WHAT COUNTS AS "MINE", and it is deliberately narrow. A dev server on this
 * machine shows up as FOUR shapes: the `bin/next` launcher (which spells the
 * path through `node_modules\.bin\..\next`, so a literal `node_modules\next`
 * misses it and leaves a parent that restarts the child), the `start-server.js`
 * listener, and the Turbopack pool workers. Orphaning any of them leaks a port
 * or half a gigabyte. Everything else running out of this worktree - including
 * the drive itself, which is also node - is left alone.
 */
const SERVER_SHAPES =
  /next[\\/]dist[\\/](bin[\\/]next|server[\\/]lib[\\/]start-server)|\.next[\\/]dev[\\/]build[\\/]chunks[\\/]pool_entry/

function stopMine() {
  const worktree = ROOT.replace(/\//g, '\\')
  const targets = [
    ...minePids(worktree).filter(p => SERVER_SHAPES.test(p.cmd)),
    ...minePids(`upstash-shim.mjs ${SHIM_PORT}`),
    ...minePids(`localhost:${PORT}/api/webhooks/stripe`),
  ]
  const seen = new Set()
  for (const t of targets) {
    if (seen.has(t.pid) || !Number.isInteger(t.pid)) continue
    seen.add(t.pid)
    say(`stopping ${t.pid} (${redactKeys(t.cmd).slice(0, 100)})`)
    ps(`Stop-Process -Id ${t.pid} -Force -ErrorAction SilentlyContinue`)
  }
  if (!seen.size) {
    say('nothing of lane B was running')
    return 0
  }

  /*
   * WHAT A KILLED DEV SERVER LEAVES BEHIND, AND WHY IT READS AS A CODE ERROR.
   *
   * `next dev` regenerates `.next/dev/types/validator.ts` continuously, one
   * block per route. Stopping it mid-write leaves that file TRUNCATED, and the
   * next `tsc --noEmit` fails inside it:
   *
   *     .next/dev/types/validator.ts(1597,1): error TS1128: Declaration or
   *     statement expected.
   *
   * Nothing in `src` is wrong, the typecheck gate step is red, and the error
   * points at a generated file most people have never opened. It cost a gate run
   * here on 14 September.
   *
   * It is deleted rather than repaired, because it is generated: the next start
   * writes it whole. Only the types are removed, never the build cache, which
   * three worktrees share a disk for and which costs a cold rebuild to replace.
   */
  const generatedTypes = resolve(ROOT, '.next', 'dev', 'types')
  if (existsSync(generatedTypes)) {
    rmSync(generatedTypes, { recursive: true, force: true })
    say('removed .next/dev/types: a server stopped mid-write leaves it truncated and typecheck fails inside it')
  }
  return seen.size
}

async function up(url, ms) {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (r.status < 500) return true
      last = `HTTP ${r.status}`
    } catch (error) {
      // A refusal here is the ordinary shape of "not listening yet", so it is
      // not reported per attempt. It IS kept, because the last one is the only
      // account of WHY a wait ran out, and the version that dropped it reported
      // "never answered" about a port that was answering 500s.
      last = error.message
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  if (last) console.warn(`[lane-b-serve] ${url} never came up; the last attempt said: ${last}`)
  return false
}

if (mode === 'stop') {
  stopMine()
  process.exit(0)
}

const file = envFile()
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || file.NEXT_PUBLIC_SUPABASE_URL || ''
if (!/vkapkibzokmfaxqogypq/.test(supabaseUrl)) {
  die(`this server only runs against TEST vkapkibzokmfaxqogypq, not "${supabaseUrl}"`)
}

const keys = readStripeTestKeys({ profile: process.env.STRIPE_CLI_PROFILE ?? 'default' })
if (!keys.ok) die(keys.reason)
const probe = await probeStripeTestKey(keys.secretKey)
if (!probe.ok) die(`${probe.detail} (profile "${keys.profile}", account ${keys.accountId})`)
say(`Stripe TEST account ${keys.accountId} from CLI profile "${keys.profile}": ${probe.detail}`)
const fileAccount = (file.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').slice(9, 25)
if (fileAccount && `acct_${fileAccount}` !== keys.accountId) {
  say(
    `NOTE: .env.local's publishable key names acct_${fileAccount}; this server serves the CLI's ${keys.accountId} instead, and the drive proves which one reached the browser.`,
  )
}

if (mode === 'status') {
  const listening = await up(`http://localhost:${PORT}/`, 2000)
  say(`port ${PORT}: ${listening ? 'answering' : 'silent'}`)
  for (const p of minePids(ROOT.replace(/\//g, '\\'))) say(`  ${p.pid}  ${redactKeys(p.cmd).slice(0, 110)}`)
  process.exit(0)
}

stopMine()
await new Promise(r => setTimeout(r, 1500))

// 1. the rate-limit store
if (!(await up(`http://127.0.0.1:${SHIM_PORT}/get/_probe`, 1000))) {
  const shimLog = openStepLog(SHIM_LOG)
  spawn(process.execPath, [resolve(ROOT, 'scripts/dev/upstash-shim.mjs'), String(SHIM_PORT)], {
    cwd: ROOT,
    detached: true,
    // One descriptor, truncated once and then APPENDED to, because a 'w'
    // descriptor keeps its own file offset: it writes on top of anything another
    // writer has appended since. This line was the 'w'/'a' pair, which is that
    // defect inside a single spawn. Found by shared-log-is-opened-for-append on
    // 14 September 2026, when lane A's guard arrived in the merge.
    stdio: ['ignore', shimLog, shimLog],
  }).unref()
  if (!(await up(`http://127.0.0.1:${SHIM_PORT}/get/_probe`, 20000))) {
    die(`the Upstash shim never answered on ${SHIM_PORT}; see ${SHIM_LOG}`)
  }
}
say(`rate-limit store: local shim on ${SHIM_PORT}`)

// 2. the webhook listener, and its signing secret
writeFileSync(LISTEN_LOG, '')
spawn(
  'stripe',
  ['listen', '--api-key', keys.secretKey, '--forward-to', `localhost:${PORT}/api/webhooks/stripe`],
  {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', openSync(LISTEN_LOG, 'a'), openSync(LISTEN_LOG, 'a')],
  },
).unref()
let whsec = null
for (let i = 0; i < 40 && !whsec; i += 1) {
  await new Promise(r => setTimeout(r, 1000))
  whsec = (readFileSync(LISTEN_LOG, 'utf8').match(/whsec_[A-Za-z0-9]+/) ?? [null])[0]
}
if (!whsec) die(`stripe listen produced no signing secret in 40s; see ${LISTEN_LOG}`)
say(
  `stripe listen: forwarding to :${PORT}/api/webhooks/stripe, signing secret taken from the running listener`,
)

// 3. the server itself
const env = {
  ...process.env,
  PORT: String(PORT),
  STRIPE_SECRET_KEY: keys.secretKey,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: keys.publishableKey,
  STRIPE_WEBHOOK_SECRET: whsec,
  STRIPE_WEBHOOK_SECRETS: whsec,
  EMAIL_TRANSPORT: 'console',
  UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${SHIM_PORT}`,
  UPSTASH_REDIS_REST_TOKEN: 'local',
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
  ORDER_ACCESS_SECRET: file.ORDER_ACCESS_SECRET || 'lane-b-local-order-access-secret-32c',
  ...(withMeasurementIds ? FAKE_MEASUREMENT_IDS : {}),
}
if (withMeasurementIds) {
  say(
    `measurement identifiers: four FAKE local values in the SERVER's environment (${Object.keys(FAKE_MEASUREMENT_IDS).join(', ')}), ` +
      'so the consent gate has something to open onto. They are not real accounts and the drive aborts every provider request at the route layer.',
  )
}
writeFileSync(SERVER_LOG, '')
spawn(process.execPath, [resolve(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(PORT)], {
  cwd: ROOT,
  env,
  detached: true,
  stdio: ['ignore', openSync(SERVER_LOG, 'a'), openSync(SERVER_LOG, 'a')],
}).unref()

if (!(await up(`http://localhost:${PORT}/`, 180000))) {
  die(`the server never answered on ${PORT}; see ${SERVER_LOG}`)
}
say(`server: next dev on ${PORT}, log ${SERVER_LOG}`)
say(`ready. Drive with BASE=http://localhost:${PORT}`)
