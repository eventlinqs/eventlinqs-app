/**
 * THE D2 DRIVE WITH STRIPE'S HALF. One command. Close-out D2, the two legs
 * that were "NOT DONE, NOT ASSERTED" on 11 September 2026:
 *
 *     the payment step of an abandonment (abandon at the card form, receive
 *     message one, return, BUY, and be refused messages two and three), and
 *     Stripe's own half of the refund that frees a place.
 *
 * Both end in a webhook the code under test must process, so this drive
 * arranges the three things a webhook needs and nothing else:
 *
 *   1. a matched TEST key pair of ONE Stripe account, read from the CLI's own
 *      config (scripts/verify/lib/stripe-cli-keys.mjs) and never printed;
 *   2. a production build whose checkout chunk inlines THAT publishable key,
 *      because loadStripe reads NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY at build
 *      time; the drive proves the build carries it and builds one if asked;
 *   3. `stripe listen`, forwarding the account's events to the server this
 *      drive starts, with the signing secret `stripe listen --print-secret`
 *      mints handed to the server as STRIPE_WEBHOOK_SECRET.
 *
 * WHY THE MAIN ACCOUNT IS THE RIGHT ACCOUNT, said here because a session
 * concluded otherwise. Every organiser on TEST is a connected account of the
 * Eventlinqs SANDBOX, and the CLI's working key opens the MAIN account. That
 * does not matter for these two legs: a checkout charge is a PLATFORM charge
 * (separate charges and transfers, no on_behalf_of, no transfer_data; see
 * src/lib/payments/create-platform-charge.ts), its precondition reads four
 * database columns and calls Stripe for nothing, and a refund is a platform
 * refund on the payment intent. The one call that names the connected
 * account is the post-event transfer in the disbursement cron, which no drive
 * runs. So the intent is minted, paid and refunded on the main account's TEST
 * mode, and its webhooks come from the account the CLI is logged in to.
 *
 * It borrows the gate's own server (startGateServer) for the same reason
 * d2-drive.mjs does: that is the one function that spawns `next start` with
 * the in-memory Upstash stub and the console mail transport, and the inbox
 * the proofs read is that server's stdout.
 *
 * Usage:
 *   node scripts/verify/d2-stripe-drive.mjs [--build] [--build-only]
 *        [--only recovery|waitlist|mobile-390|tablet-768|desktop-1440]
 *        [--profile default] [--out C:/dev/EVIDENCE/D2/<stamp>]
 *
 * Refuses: a production Supabase project, a live or restricted or expired
 * or mismatched key pair, a build that does not carry the publishable key
 * (unless --build), and a `stripe listen` that never reports Ready.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { envFor, killTree, startGateServer } from '../ops/pre-push-gate.mjs'
import { redactStripeSecrets, testKeyPairFromCli } from './lib/stripe-cli-keys.mjs'

const TAG = '[d2-stripe]'
const ROOT = process.cwd()
const STRIPE = process.platform === 'win32' ? 'stripe.exe' : 'stripe'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)
const only = flag('only')
const profileName = flag('profile') ?? 'default'
const stamp = new Date().toISOString().slice(0, 10)
const OUT = (flag('out') ?? `C:/dev/EVIDENCE/D2/${stamp}-stripe`).replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const LOG = join(ROOT, '.tmp', 'd2-stripe-server.log')
const LISTEN_LOG = join(OUT, 'stripe-listen.log')
const DRIVE_LOG = join(OUT, 'drive.txt')

const lines = []
const say = (line) => {
  const safe = redactStripeSecrets(line)
  lines.push(safe)
  console.log(safe)
  writeFileSync(DRIVE_LOG, `${lines.join('\n')}\n`, 'utf8')
}

/* -------------------------------------------------------------------------
 * 1. THE ENVIRONMENT, AND THE REFUSALS THAT COME BEFORE ANYTHING STARTS.
 *
 * The shell handed to envFor has the Supabase pair removed, so .env.local's
 * TEST values win even on a shell that carries the production URL (which has
 * happened on this machine and is recorded in the session memory).
 * ---------------------------------------------------------------------- */
const shell = { ...process.env }
delete shell.NEXT_PUBLIC_SUPABASE_URL
delete shell.NEXT_PUBLIC_SUPABASE_ANON_KEY
const env = envFor('local', { shell })
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  say(`${TAG} REFUSING: the environment points at the PRODUCTION Supabase project and this drive writes.`)
  process.exit(1)
}
if (!/vkapkibzokmfaxqogypq/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  say(`${TAG} REFUSING: NEXT_PUBLIC_SUPABASE_URL is not the TEST project (vkapkibzokmfaxqogypq).`)
  process.exit(1)
}

const pair = testKeyPairFromCli({ profileName })
if (!pair.ok) {
  say(`${TAG} REFUSING: ${pair.reason}`)
  process.exit(1)
}
say(
  `${TAG} Stripe TEST keys from CLI profile "${profileName}": account ${pair.accountId}, ` +
    `key expires ${pair.expiresAt ?? 'never (no expiry recorded)'}. Neither key is printed.`,
)
say(
  `${TAG} the TEST database's organisers are connected accounts of a different Stripe account; ` +
    'that is fine here, because a checkout charge names no connected account ' +
    '(src/lib/payments/create-platform-charge.ts) and neither does a refund.',
)

env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pair.publishableKey
env.STRIPE_SECRET_KEY = pair.secretKey
env.STRIPE_WEBHOOK_SECRETS = ''

/* -------------------------------------------------------------------------
 * 2. THE BUILD CARRIES THE PUBLISHABLE KEY, PROVEN BY READING THE BUILD.
 * ---------------------------------------------------------------------- */
function filesCarrying(dir, needle) {
  if (!existsSync(dir)) return []
  const hits = []
  for (const name of readdirSync(dir, { recursive: true })) {
    const file = join(dir, String(name))
    if (!/\.(js|mjs)$/.test(file)) continue
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      // A build artefact that cannot be read is not nothing: it is a file this
      // search was supposed to judge and did not, and silence here would let
      // "the build does not carry the key" be reported when the truth is "this
      // script could not look".
      console.warn(`${TAG} could not read ${file.replace(ROOT, '')}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (text.includes(needle)) hits.push(file.replace(ROOT, '').replace(/\\/g, '/'))
  }
  return hits
}
const staticDir = join(ROOT, '.next', 'static')
let carrying = filesCarrying(staticDir, pair.publishableKey)
say(`${TAG} the build under .next inlines this account's publishable key in ${carrying.length} file(s)${carrying.length ? `: ${carrying.join(', ')}` : ''}`)

if (carrying.length === 0 && !has('build') && !has('build-only')) {
  say(`${TAG} REFUSING: the build does not carry the publishable key of account ${pair.accountId}, so Stripe.js`)
  say(`${TAG} could not resolve a client secret the server mints. Build one with:`)
  say(`${TAG}     node scripts/verify/d2-stripe-drive.mjs --build`)
  process.exit(1)
}
if (carrying.length === 0 || has('build-only')) {
  const buildLog = join(OUT, 'build.txt')
  say(`${TAG} building with NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set for account ${pair.accountId} (next build only; the gate's prebuild guards run on the push). Log: ${buildLog}`)
  const started = Date.now()
  const fd = openSync(buildLog, 'w')
  const r = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', fd, fd],
  })
  closeSync(fd)
  say(`${TAG} next build exit ${r.status} after ${Math.round((Date.now() - started) / 1000)}s`)
  if ((r.status ?? 1) !== 0) {
    say(`${TAG} the build failed; its log is ${buildLog}`)
    process.exit(1)
  }
  carrying = filesCarrying(staticDir, pair.publishableKey)
  say(`${TAG} after the build, the publishable key is inlined in ${carrying.length} file(s): ${carrying.join(', ')}`)
  if (carrying.length === 0) {
    say(`${TAG} REFUSING: the fresh build still does not carry the key; nothing else can be trusted.`)
    process.exit(1)
  }
  if (has('build-only')) {
    say(`${TAG} --build-only: done.`)
    process.exit(0)
  }
}

/* -------------------------------------------------------------------------
 * 3. THE SIGNING SECRET `stripe listen` MINTS, handed to the server.
 * ---------------------------------------------------------------------- */
function stripeSync(argv) {
  let r = spawnSync(STRIPE, argv, { cwd: ROOT, encoding: 'utf8', env: process.env })
  if (r.error && r.error.code === 'ENOENT') {
    r = spawnSync('stripe', argv, { cwd: ROOT, encoding: 'utf8', env: process.env, shell: true })
  }
  return r
}
const printed = stripeSync(['listen', '--print-secret'])
const whsec = (printed.stdout ?? '').trim().split(/\r?\n/).filter((l) => l.startsWith('whsec_')).pop() ?? ''
if (!whsec) {
  say(`${TAG} REFUSING: \`stripe listen --print-secret\` gave no whsec_ value (exit ${printed.status}). ${redactStripeSecrets(printed.stderr ?? '')}`)
  process.exit(1)
}
env.STRIPE_WEBHOOK_SECRET = whsec
say(`${TAG} stripe listen signing secret minted (${whsec.length} characters, not printed) and handed to the server as STRIPE_WEBHOOK_SECRET`)

/* -------------------------------------------------------------------------
 * 4. THE SERVER, THEN THE FORWARDER POINTED AT IT.
 * ---------------------------------------------------------------------- */
const started = await startGateServer(env, LOG)
if (started.error) process.exit(1)
const { base, stop } = started
say(`${TAG} production build answering on ${base} (server log, and the inbox, is ${LOG})`)

let listener = null
let failures = 0
try {
  const forwardTo = `${base}/api/webhooks/stripe`
  writeFileSync(LISTEN_LOG, '')
  const listenArgs = ['listen', '--forward-to', forwardTo]
  let ready = false
  /*
   * DECLARED BEFORE THE SPAWN, because the ENOENT fallback below calls it and a
   * `const` referenced above its own declaration throws on exactly the path that
   * needs it: the one where the CLI is not on PATH under its resolved name.
   */
  const wire = (child) => {
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        const text = redactStripeSecrets(chunk.toString())
        appendFileSync(LISTEN_LOG, text)
        if (/Ready!/.test(text)) ready = true
      })
    }
  }
  listener = spawn(STRIPE, listenArgs, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  listener.on('error', (error) => {
    if (error.code === 'ENOENT') {
      listener = spawn('stripe', listenArgs, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
      wire(listener)
    } else {
      say(`${TAG} stripe listen errored: ${error.message}`)
    }
  })
  wire(listener)
  const deadline = Date.now() + 90_000
  while (!ready && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500))
  if (!ready) {
    say(`${TAG} REFUSING: stripe listen never reported Ready within 90s. Its log (redacted): ${LISTEN_LOG}`)
    failures += 1
    throw new Error('stripe listen not ready')
  }
  say(`${TAG} stripe listen is forwarding account ${pair.accountId}'s TEST events to ${forwardTo} (log, redacted: ${LISTEN_LOG})`)

  /* ---------------------------------------------------------------------
   * 5. THE PROOFS. Each reads STRIPE_SECRET_KEY from its environment and
   *    runs its Stripe leg because the value is there; without it each says
   *    NOT EXERCISED, exactly as on 11 September.
   * ------------------------------------------------------------------ */
  const proofEnv = { ...env, BASE: base, SERVER_LOG: LOG }
  const viewports = ['mobile-390', 'tablet-768', 'desktop-1440']
  const wantRecovery = !only || only === 'recovery' || viewports.includes(only)
  const wantWaitlist = !only || only === 'waitlist'

  if (wantRecovery) {
    for (const viewport of viewports.includes(only) ? [only] : viewports) {
      say(`${TAG} ---- the recovery engine, payment step included, at ${viewport} ----`)
      const r = spawnSync(process.execPath, ['scripts/verify/d2-recovery-proof.mjs', '--out', OUT], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...proofEnv, JOURNEY_VIEWPORT: viewport },
      })
      if ((r.status ?? 1) !== 0) failures += 1
    }
  }
  if (wantWaitlist) {
    say(`${TAG} ---- a paid place, refunded through the organiser's dialog, goes down the queue ----`)
    const r = spawnSync(process.execPath, ['scripts/verify/d2-waitlist-proof.mjs', '--out', OUT], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...proofEnv, JOURNEY_OUT_ROOT: `${OUT}/journey` },
    })
    if ((r.status ?? 1) !== 0) failures += 1
  }
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? cause.message : String(cause)}`)
  failures += 1
} finally {
  if (listener) killTree(listener)
  stop()
}

if (failures > 0) {
  say(`${TAG} ${failures} leg(s) FAILED. Evidence under ${OUT}`)
  process.exit(1)
}
say(`${TAG} every leg passed. Evidence under ${OUT}`)
