/**
 * THE UX3.2 DRIVE. Serves this tree's production build with the REAL mail
 * transport and runs the second-channel escalation proof against it at 390, 768
 * and 1440.
 *
 * WHY IT BORROWS THE GATE'S OWN SERVER. `startGateServer` is the one function
 * that spawns `next start` with the in-memory Upstash stub, and it is held by
 * `gate-servers-carry-a-limiter`. Both sign-in paths this drive uses are rate
 * limited, so a server without a limiter backend fails closed and refuses them,
 * which would read as a product defect and would not be one.
 *
 * WHY `mail: 'real'`. This is the one drive on the platform whose subject is
 * what happens when EMAIL FAILS. The console transport always succeeds, so with
 * it the notification would be delivered on the first attempt and the second
 * channel would never be reached. With the real transport and no RESEND_API_KEY
 * on this machine, every attempt throws for a real reason and the escalation is
 * the product's own behaviour rather than a simulation.
 *
 * Usage:
 *   node scripts/verify/ux3-push-escalation-drive.mjs
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[ux3.2-drive]'
const OUT = 'C:/dev/EVIDENCE/UX3'
const LOG = join(process.cwd(), '.tmp', 'ux3-push-escalation-server.log')

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} REFUSING: .env.local points at the PRODUCTION project and this drive writes.`)
  process.exit(1)
}
if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  console.error(`${TAG} REFUSING: NEXT_PUBLIC_VAPID_PUBLIC_KEY is empty, so no device can be armed.`)
  console.error(`${TAG} Generate a pair (npx web-push generate-vapid-keys), put both halves and`)
  console.error(`${TAG} VAPID_SUBJECT in .env.local, and REBUILD: the public half is inlined into`)
  console.error(`${TAG} the client bundle at build time, so a rebuild is not optional.`)
  process.exit(1)
}

const started = await startGateServer(env, LOG, { mail: 'real' })
if (started.error) process.exit(1)
const { base, stop } = started
console.log(`${TAG} production build answering on ${base} (server log is ${LOG})`)

let status = 1
try {
  const r = spawnSync(
    process.execPath,
    ['scripts/verify/ux3-push-escalation-proof.mjs', '--out', OUT, ...process.argv.slice(2)],
    { cwd: process.cwd(), stdio: 'inherit', env: { ...env, BASE: base, SERVER_LOG: LOG } },
  )
  status = r.status ?? 1
} finally {
  stop()
}

console.log(`${TAG} ${status === 0 ? 'PASS' : 'FAIL'}`)
process.exit(status)
