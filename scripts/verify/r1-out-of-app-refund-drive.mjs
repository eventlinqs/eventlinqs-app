/**
 * THE R1 DRIVE: A REFUND MADE OUTSIDE THE APPLICATION, DRIVEN END TO END.
 * One command. Close-out R1.
 *
 *     "A refund issued OUTSIDE the application, through the Stripe API directly
 *      so it is the same path the Dashboard uses, voids the ticket, returns the
 *      place to inventory, and offers it to the waiting list."
 *
 * WHY THE DRIVE AND NOT A TEST. The defect R1 names was invisible to every test
 * this platform had, and not by accident: the in-app refund action reconciles
 * SYNCHRONOUSLY after calling Stripe, so every test of our own refund button
 * passes whatever the webhook does. The only way to see the other path is to make
 * Stripe send the event itself, to a server running this tree's code, and read
 * the outcome out of the database afterwards. So the drive arranges the four
 * things that needs and nothing else:
 *
 *   1. a matched TEST key pair of ONE Stripe account, read from the CLI's own
 *      config (scripts/verify/lib/stripe-cli-keys.mjs) and never printed;
 *   2. a production build whose checkout chunk inlines THAT publishable key,
 *      because loadStripe reads NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY at build time;
 *      the drive proves the build carries it and builds one if asked;
 *   3. `stripe listen`, forwarding the account's events to the server this drive
 *      starts, with the signing secret `stripe listen --print-secret` mints
 *      handed to the server as STRIPE_WEBHOOK_SECRET, and handed to the PROOF as
 *      well, because the replay half has to sign its own delivery;
 *   4. the gate's own server (startGateServer), which is the one function that
 *      spawns `next start` with the in-memory Upstash stub and the console mail
 *      transport. The inbox the proof reads is that server's stdout, and so is
 *      the record of which refund events actually arrived.
 *
 * WHY THE MAIN ACCOUNT IS THE RIGHT ACCOUNT. Every organiser on TEST is a
 * connected account of the Eventlinqs SANDBOX and the CLI's working key opens the
 * MAIN account. It does not matter here: a checkout charge is a PLATFORM charge
 * (separate charges and transfers, no on_behalf_of, no transfer_data; see
 * src/lib/payments/create-platform-charge.ts), its precondition reads four
 * database columns and calls Stripe for nothing, and a refund is a platform
 * refund on the payment intent. The same reasoning is recorded in
 * d2-stripe-drive.mjs, which established it.
 *
 * Usage:
 *   node scripts/verify/r1-out-of-app-refund-drive.mjs [--build] [--build-only]
 *        [--profile default] [--viewport mobile-390|tablet-768|desktop-1440]
 *        [--out C:/dev/EVIDENCE/R1/<stamp>]
 *
 * Refuses: a production Supabase project, a live or restricted or expired or
 * mismatched key pair, a build that does not carry the publishable key (unless
 * --build), and a `stripe listen` that never reports Ready.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { envFor, killTree, startGateServer } from '../ops/pre-push-gate.mjs'
import { redactStripeSecrets, testKeyPairFromCli } from './lib/stripe-cli-keys.mjs'

const TAG = '[r1-drive]'
const ROOT = process.cwd()
const STRIPE = process.platform === 'win32' ? 'stripe.exe' : 'stripe'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)
const profileName = flag('profile') ?? 'default'
const stamp = new Date().toISOString().slice(0, 10)
const OUT = (flag('out') ?? `C:/dev/EVIDENCE/R1/${stamp}`).replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const LOG = join(ROOT, '.tmp', 'r1-drive-server.log')
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
 * TEST values win even on a shell that carries the production URL, which has
 * happened on this machine.
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
  `${TAG} Stripe TEST keys from CLI profile "${profileName}": account ${pair.accountId}, `
    + `key expires ${pair.expiresAt ?? 'never (no expiry recorded)'}. Neither key is printed.`,
)

env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pair.publishableKey
env.STRIPE_SECRET_KEY = pair.secretKey
env.STRIPE_WEBHOOK_SECRETS = ''

/* -------------------------------------------------------------------------
 * 2. THE BUILD CARRIES THE PUBLISHABLE KEY, PROVEN BY READING THE BUILD.
 *
 * loadStripe reads the publishable key at BUILD time, so a build made from a
 * different account's key produces a card form that cannot take the charge this
 * drive's secret key will later refund. The check is a read of the build rather
 * than a claim about it, and a file that cannot be read is reported rather than
 * skipped: silence there would let "the build does not carry the key" be printed
 * when the truth is "this script could not look".
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
      console.warn(`${TAG} could not read ${file.replace(ROOT, '')}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (text.includes(needle)) hits.push(file.replace(ROOT, '').replace(/\\/g, '/'))
  }
  return hits
}

function build() {
  say(`${TAG} building with this account's publishable key inlined (this takes a few minutes)`)
  const r = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })
  if ((r.status ?? 1) !== 0) {
    say(`${TAG} REFUSING: the build failed (exit ${r.status}).`)
    process.exit(1)
  }
}

if (has('build')) build()
let carrying = filesCarrying(join(ROOT, '.next'), pair.publishableKey)
if (carrying.length === 0) {
  say(`${TAG} the build under .next inlines this account's publishable key in 0 file(s)`)
  if (!has('build')) {
    say(`${TAG} REFUSING: the build does not carry the publishable key of account ${pair.accountId}. Re-run with --build.`)
    process.exit(1)
  }
  build()
  carrying = filesCarrying(join(ROOT, '.next'), pair.publishableKey)
}
say(`${TAG} the build carries this account's publishable key in ${carrying.length} file(s), e.g. ${carrying[0]}`)
if (has('build-only')) {
  say(`${TAG} --build-only: stopping here with a build that carries the key.`)
  process.exit(0)
}

/* -------------------------------------------------------------------------
 * 3. THE SIGNING SECRET `stripe listen` MINTS, handed to the server AND to the
 *    proof. The proof needs it because the replay half of R1 ("both events
 *    delivered for the same refund reconcile it ONCE") has to deliver a second
 *    event itself, signed the way Stripe signs one, to the same route.
 * ---------------------------------------------------------------------- */
function runStripe(argv) {
  let r = spawnSync(STRIPE, argv, { cwd: ROOT, encoding: 'utf8', env: process.env })
  if (r.error && r.error.code === 'ENOENT') {
    r = spawnSync('stripe', argv, { cwd: ROOT, encoding: 'utf8', env: process.env, shell: true })
  }
  return r
}
const printed = runStripe(['listen', '--print-secret'])
const whsec = `${printed.stdout ?? ''}`.match(/whsec_[A-Za-z0-9]+/)?.[0] ?? null
if (!whsec) {
  say(`${TAG} REFUSING: \`stripe listen --print-secret\` gave no whsec_ value (exit ${printed.status}). ${redactStripeSecrets(printed.stderr ?? '')}`)
  process.exit(1)
}
env.STRIPE_WEBHOOK_SECRET = whsec
say(`${TAG} stripe listen signing secret minted (${whsec.length} characters, not printed) and handed to the server`)

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
  say(`${TAG} stripe listen is forwarding account ${pair.accountId}'s TEST events to ${forwardTo}`)

  /* ---------------------------------------------------------------------
   * 5. THE PROOF, at each width. The fixture, the purchase, the queue and the
   *    refund are rebuilt per width rather than shared, because a refund can
   *    only free a place once and a second width measuring a place that is
   *    already back would be measuring nothing.
   * ------------------------------------------------------------------ */
  const viewports = ['mobile-390', 'tablet-768', 'desktop-1440']
  const only = flag('viewport')
  const run = only ? [only] : viewports
  for (const viewport of run) {
    say(`${TAG} ---- a refund issued outside the application, at ${viewport} ----`)
    const r = spawnSync(
      process.execPath,
      [
        /*
         * THROUGH THE src ALIAS LOADER, so the proof imports the SAME
         * REFUND_SUCCESS_EVENTS the route switches on rather than a list typed
         * beside it. A proof that keeps its own copy of the set it is checking
         * cannot notice the set changing, which is the failure R1 is about one
         * level up.
         */
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        '--import',
        './scripts/lib/src-alias-loader.mjs',
        'scripts/verify/r1-out-of-app-refund-proof.mjs',
        '--out',
        `${OUT}/${viewport}`,
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
          ...env,
          BASE: base,
          SERVER_LOG: LOG,
          LISTEN_LOG,
          STRIPE_WEBHOOK_SECRET: whsec,
          JOURNEY_VIEWPORT: viewport,
        },
      },
    )
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
