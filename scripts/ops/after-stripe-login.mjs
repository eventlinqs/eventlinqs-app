/**
 * WHAT TO RUN THE MOMENT `stripe login` SUCCEEDS.
 *
 * Law 10: split the founder's step before assigning it. `stripe login` is a
 * browser OAuth that mints a session, which is genuinely his and cannot be
 * scripted. Everything AFTER it can be, and this is that everything: it proves
 * the key works, then re-drives the four journeys that failed for want of it,
 * and prints one verdict.
 *
 * On 2026-09-02 twelve of the thirty journey rows failed, and all twelve were
 * this one missing credential. Both keys the CLI had stored were expired
 * (2026-07-29 and 2026-07-07, driven, HTTP 401 api_key_expired), and Vercel
 * will not decrypt a sensitive variable back to a client on any scope. So the
 * whole paid half of the platform is unproven until this runs.
 *
 * It writes nothing to production and touches no schema. It reads a Stripe key,
 * drives a browser against whatever BASE is set, and reports.
 *
 *   powershell -File C:\dev\serve.ps1 3311        # in one window
 *   node scripts/ops/after-stripe-login.mjs       # in another
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const APP = process.cwd()

function heading(t) {
  console.log('')
  console.log(t)
  console.log('-'.repeat(t.length))
}

// ---------- 1. Is there a working key at all? ----------
heading('1. The Stripe key')

let key = process.env.STRIPE_SECRET_KEY ?? ''
if (!key) {
  /*
   * The CLI keeps one after `stripe login`. Ask it rather than guessing.
   *
   * `shell: true` with an args array raises DEP0190 on Node 24, because the
   * arguments are concatenated rather than escaped. There is no user input in
   * this call, so it was never a real injection risk, but a deprecation warning
   * printed in the middle of a founder-facing report is noise that makes a
   * clean run look broken. On Windows the executable is `stripe.cmd`, which is
   * the only reason the shell was there at all: name it directly instead.
   */
  const candidates = process.platform === 'win32' ? ['stripe.cmd', 'stripe.exe', 'stripe'] : ['stripe']
  let found = null
  for (const bin of candidates) {
    const r = spawnSync(bin, ['config', '--list'], { encoding: 'utf8' })
    if (r.error) continue
    const m = /test_mode_api_key\s*=\s*'?([^'\s]+)'?/.exec(r.stdout ?? '')
    if (m) {
      key = m[1]
      found = bin
      break
    }
  }
  if (found) console.log(`read from the Stripe CLI (${found})`)
  else console.log('the Stripe CLI holds no test key on this machine')
}

if (!key) {
  console.error('NO STRIPE KEY FOUND.')
  console.error('  Run `stripe login` first, or export STRIPE_SECRET_KEY yourself.')
  console.error('  This script refuses to report on a platform it could not test.')
  process.exit(1)
}
console.log(`key found, ${key.length} chars, prefix ${key.slice(0, 7)}`)
if (!key.startsWith('sk_test') && !key.startsWith('rk_test')) {
  console.error('')
  console.error('REFUSING: that is not a TEST key.')
  console.error('  This drives real checkouts. It will not do that against live money.')
  process.exit(1)
}

// ---------- 2. Does it actually authenticate? ----------
heading('2. Does Stripe accept it')
const res = await fetch('https://api.stripe.com/v1/balance', {
  headers: { Authorization: `Bearer ${key}` },
})
console.log(`GET /v1/balance -> HTTP ${res.status}`)
if (!res.ok) {
  const body = await res.text()
  console.error(`  ${body.slice(0, 300)}`)
  console.error('')
  console.error('The key did not authenticate. An expired key is exactly what blocked')
  console.error('the session on 2026-09-02, and it reports as 401 api_key_expired.')
  process.exit(1)
}
console.log('  authenticated')

// ---------- 3. Re-drive the four journeys the key was blocking ----------
heading('3. The journeys that failed for want of it')

const JOURNEYS = [
  { key: 'j3', script: 'scripts/journeys/j3.mjs', what: 'a stranger buys a ticket' },
  { key: 'j4', script: 'scripts/journeys/j4.mjs', what: 'a buyer asks for a refund' },
  { key: 'j5', script: 'scripts/journeys/j5.mjs', what: 'a signed-in buyer passes a ticket on' },
  { key: 'j7s', script: 'scripts/journeys/j7-seated.mjs', what: 'a stranger buys a reserved seat' },
]

const rows = []
for (const vp of ['desktop-1440', 'mobile-390']) {
  for (const j of JOURNEYS) {
    if (!existsSync(`${APP}/${j.script}`)) {
      rows.push({ ...j, viewport: vp, verdict: 'MISSING SCRIPT' })
      continue
    }
    const started = Date.now()
    let stdout = ''
    let code = 0
    try {
      stdout = execFileSync('node', [j.script], {
        cwd: APP,
        encoding: 'utf8',
        // j7-seated reports and then never exits. Time-box it or this hangs.
        timeout: 300_000,
        env: { ...process.env, STRIPE_SECRET_KEY: key, JOURNEY_VIEWPORT: vp, BASE },
      })
    } catch (error) {
      stdout = `${error.stdout ?? ''}${error.stderr ?? ''}`
      code = error.status ?? 1
    }
    const blockers = /BLOCKERS\s*:\s*(\d+)/.exec(stdout)?.[1] ?? 'unknown'
    const stillStripe = /no card field|STRIPE_SECRET_KEY is not set|Payment system error/i.test(stdout)
    const verdict = blockers === '0' ? 'PASS' : 'FAIL'
    const secs = Math.round((Date.now() - started) / 100) / 10
    rows.push({ ...j, viewport: vp, verdict, blockers, stillStripe, seconds: secs, exit: code })
    console.log(
      `${verdict.padEnd(6)} ${vp.padEnd(13)} ${j.key.padEnd(4)} ${j.what.padEnd(40)} ${secs}s` +
        (stillStripe ? '   STILL BLOCKED ON THE CARD FIELD' : ''),
    )
  }
}

// ---------- 4. The verdict ----------
heading('4. Verdict')
const pass = rows.filter(r => r.verdict === 'PASS').length
const fail = rows.filter(r => r.verdict === 'FAIL').length
const stripeStill = rows.filter(r => r.stillStripe).length

console.log(`PASS ${pass}   FAIL ${fail}`)
if (stripeStill > 0) {
  console.log('')
  console.log(`${stripeStill} run(s) STILL report a missing card field. The key authenticated`)
  console.log('against the API but the running server is not using it. Check that the')
  console.log('server was started with STRIPE_SECRET_KEY in its environment, because the')
  console.log('journey drives the SERVER, not this process.')
} else if (fail === 0) {
  console.log('')
  console.log('The paid half of the platform is now proven end to end. Journey 10,')
  console.log('ticket purchase and refund, was the last of the brief\'s ten.')
}

writeFileSync('C:/dev/EVIDENCE/journeys/after-stripe-login.json', JSON.stringify({ at: new Date().toISOString(), base: BASE, rows }, null, 2))
console.log('')
console.log('wrote C:/dev/EVIDENCE/journeys/after-stripe-login.json')
process.exit(fail === 0 ? 0 : 1)
