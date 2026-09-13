/**
 * THE THREE STRIPE LEGS OF UX3, DRIVEN. Lane C, port 3200.
 *
 * WHAT WAS MISSING. The UX3 ledger of 10 September recorded nine criteria MET
 * and three NOT EXERCISED, and all three were the Stripe ones:
 *
 *   Stripe Connect onboarding is started
 *   Stripe Connect onboarding completes and charges are enabled
 *   every paid order
 *
 * The stated reason was that no Stripe TEST key on this machine authenticated.
 * That reason has expired rather than been argued away: the CLI's `[default]`
 * profile holds a test key for acct_1T8WBhGuiZ9cvxuu valid to 2026-12-10, and
 * `GET /v1/balance` answers 200 with it. So the legs are drivable, and this
 * script is what drives them.
 *
 * WHAT IT STARTS, AND WHY EACH PIECE IS THERE.
 *
 *   THE SERVER, on port 3200 and nothing else, because two other build lanes
 *   hold 3000 and 3100 on this machine at the same time. It is the gate's own
 *   server so it carries the Upstash limiter stub and the console mail
 *   transport; a served build without a limiter fails the money path closed and
 *   the drive then reports the product for the harness's omission.
 *
 *   THE HOST IS `localhost`, NOT `127.0.0.1`. Stripe redirects the organiser
 *   back to the return url minted from NEXT_PUBLIC_APP_URL, and a session cookie
 *   set on one of those two is not sent to the other. A drive that leaves on
 *   127.0.0.1 and returns on localhost comes back signed out, which reads as an
 *   authentication defect and is not one.
 *
 *   `stripe listen`, because an order only reaches `confirmed` inside the Stripe
 *   webhook, and the trigger that records the owner notification fires on that
 *   transition. Without a forwarded webhook the card is charged, the order stays
 *   pending, and the leg would report a missing notification for a state change
 *   that never happened. The signing secret it mints is read from its own output
 *   and handed to the server, so nothing is stored and nothing is guessed.
 *
 *   REAL CHROME (JOURNEY_BROWSER=chrome), because Stripe's hosted onboarding
 *   carries an hCaptcha that refuses bundled headless Chromium for ever.
 *
 * Usage:
 *   node scripts/verify/ux3-stripe-legs-drive.mjs [--viewports mobile-390,...]
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[ux3-stripe-legs]'
const PORT = 3200
const OUT = 'C:/dev/EVIDENCE/UX3/stripe-legs'
const VIEWPORTS = (process.argv.includes('--viewports')
  ? process.argv[process.argv.indexOf('--viewports') + 1]
  : 'mobile-390,tablet-768,desktop-1440'
).split(',')

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} REFUSING: .env.local points at the PRODUCTION project and this drive writes.`)
  process.exit(1)
}
if (!/^sk_test_|^rk_test_/.test(env.STRIPE_SECRET_KEY ?? '')) {
  console.error(`${TAG} REFUSING: STRIPE_SECRET_KEY is absent or is not a TEST key. This drive never touches live money.`)
  process.exit(1)
}
if (env.NEXT_PUBLIC_APP_URL !== `http://localhost:${PORT}`) {
  console.error(`${TAG} REFUSING: NEXT_PUBLIC_APP_URL is ${env.NEXT_PUBLIC_APP_URL ?? '(unset)'}.`)
  console.error(`${TAG} It must be http://localhost:${PORT} AT BUILD TIME, because Next inlines NEXT_PUBLIC_*`)
  console.error(`${TAG} and getAppUrl() is what mints the Stripe return url. Set it and rebuild.`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })

/**
 * Start `stripe listen` and read the signing secret out of its own greeting.
 *
 * Read rather than configured: a secret typed into a file is a secret that goes
 * stale the next time the CLI is restarted, and a stale one makes every webhook
 * fail signature verification, which looks exactly like a broken webhook handler.
 */
function startStripeListen() {
  return new Promise(resolve => {
    const child = spawn('stripe', ['listen', '--forward-to', `http://localhost:${PORT}/api/webhooks/stripe`], {
      shell: true,
    })
    let settled = false
    const done = value => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const read = buf => {
      const text = buf.toString()
      process.stdout.write(`${TAG} [stripe listen] ${text}`)
      const secret = text.match(/whsec_[A-Za-z0-9]+/)?.[0]
      if (secret) done({ child, secret })
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', err => done({ child: null, error: err.message }))
    setTimeout(() => done({ child, error: 'stripe listen printed no signing secret within 30s' }), 30_000)
  })
}

const listener = await startStripeListen()
if (!listener.secret) {
  console.error(`${TAG} could not start stripe listen: ${listener.error}`)
  if (listener.child) listener.child.kill()
  process.exit(1)
}
console.log(`${TAG} webhooks forwarding to localhost:${PORT}, signing secret read from the CLI`)

const serverEnv = { ...env, STRIPE_WEBHOOK_SECRET: listener.secret, STRIPE_WEBHOOK_SECRETS: '' }
const LOG = join(process.cwd(), '.tmp', 'ux3-stripe-legs-server.log')
const started = await startGateServer(serverEnv, LOG, { port: PORT, host: 'localhost' })
if (started.error) {
  listener.child.kill()
  process.exit(1)
}
const { base, stop } = started
console.log(`${TAG} production build answering on ${base} (server log ${LOG})`)

let failed = 0
try {
  for (const viewport of VIEWPORTS) {
    console.log(`\n${TAG} ===== ${viewport} =====`)
    const r = spawnSync(
      process.execPath,
      ['scripts/verify/ux3-owner-notified-proof.mjs', '--out', OUT],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
          ...serverEnv,
          BASE: base,
          SERVER_LOG: LOG,
          JOURNEY_VIEWPORT: viewport,
          JOURNEY_BROWSER: 'chrome',
        },
      },
    )
    if ((r.status ?? 1) !== 0) failed += 1
  }
} finally {
  stop()
  listener.child.kill()
}

console.log(`\n${TAG} ${VIEWPORTS.length - failed} of ${VIEWPORTS.length} viewport run(s) green`)
process.exit(failed === 0 ? 0 : 1)
