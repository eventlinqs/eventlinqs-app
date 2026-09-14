/**
 * MONEY FIX A1.7, THE DRIVE. One command, three widths.
 *
 * PROVES: a founding organiser inside their fee-free window can sell a paid
 * ticket, the platform retains nothing on that sale, and the buyer pays exactly
 * the face value. Before the fix every one of those purchases was refused at
 * checkout with "There was a pricing issue with this checkout", because the
 * charge precondition read a deliberately waived fee as calculator drift.
 *
 * IT ARRANGES THE THREE THINGS A REAL CARD PAYMENT NEEDS, and nothing else,
 * exactly as d2-stripe-drive.mjs and r1-out-of-app-refund-drive.mjs do:
 *
 *   1. a matched TEST key pair of ONE Stripe account, read from the CLI's own
 *      config and never printed;
 *   2. a production build whose checkout chunk inlines THAT publishable key,
 *      because loadStripe reads NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY at build
 *      time; the drive proves the build carries it and builds one if asked;
 *   3. `stripe listen`, forwarding that account's events to the server this
 *      drive starts, so the order is confirmed by a REAL webhook rather than by
 *      the page saying so.
 *
 * WHY THE MAIN ACCOUNT IS THE RIGHT ACCOUNT: a checkout charge on this platform
 * is a PLATFORM charge (separate charges and transfers, no on_behalf_of, no
 * transfer_data; see src/lib/payments/create-platform-charge.ts), and its
 * precondition reads four database columns and calls Stripe for nothing. The
 * one call that names the connected account is the post-event transfer in the
 * disbursement cron, which this drive does not run.
 *
 * Usage:
 *   node scripts/verify/money-waived-fee-drive.mjs [--build] [--build-only]
 *        [--viewport mobile-390|tablet-768|desktop-1440]
 *        [--profile default] [--out C:/dev/EVIDENCE/MONEY/<stamp>]
 *
 * Refuses: a production Supabase project, a live or mismatched key pair, a
 * build that does not carry the publishable key (unless --build), and a
 * `stripe listen` that never reports Ready.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { envFor, killTree, startGateServer } from '../ops/pre-push-gate.mjs'
import { redactStripeSecrets, testKeyPairFromCli } from './lib/stripe-cli-keys.mjs'

const TAG = '[a17-drive]'
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
const OUT = (flag('out') ?? `C:/dev/EVIDENCE/MONEY/${stamp}-a17`).replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const LOG = join(ROOT, '.tmp', 'a17-drive-server.log')
const LISTEN_LOG = join(OUT, 'stripe-listen.log')
const DRIVE_LOG = join(OUT, 'drive.txt')

const lines = []
const say = (line) => {
  const safe = redactStripeSecrets(line)
  lines.push(safe)
  console.log(safe)
  writeFileSync(DRIVE_LOG, `${lines.join('\n')}\n`, 'utf8')
}

/* 1. THE ENVIRONMENT, AND THE REFUSALS THAT COME FIRST. The shell handed to
 *    envFor has the Supabase pair removed, so .env.local's TEST values win even
 *    on a shell carrying the production URL, which has happened on this machine. */
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

/* 2. THE BUILD CARRIES THE PUBLISHABLE KEY, PROVEN BY READING THE BUILD. */
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

/* 3. THE SIGNING SECRET `stripe listen` MINTS, handed to the server. */
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

/* 4. THE SERVER, THEN THE FORWARDER POINTED AT IT. */
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

  /* 5. THE PROOF, at each width. A fresh fixture per width, because a sale
   *    consumes a place and a second width measuring an already-sold tier would
   *    be measuring something else. */
  const viewports = ['mobile-390', 'tablet-768', 'desktop-1440']
  const only = flag('viewport')
  const run = only ? [only] : viewports
  for (const viewport of run) {
    say(`${TAG} ---- a fee-waived organiser sells a paid ticket, at ${viewport} ----`)
    const r = spawnSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        '--import',
        './scripts/lib/src-alias-loader.mjs',
        'scripts/verify/money-waived-fee-proof.mjs',
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
say(`${TAG} every leg passed: a fee-waived organiser sells, and the platform keeps nothing. Evidence under ${OUT}`)
