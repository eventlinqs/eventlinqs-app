/**
 * THE UX5 DRIVE. Serves this tree's production build and runs the two-factor
 * enrolment proof against it at 390, 768 and 1440.
 *
 * WHY IT BORROWS THE GATE'S OWN SERVER. `startGateServer` is the one function
 * that spawns `next start` WITH the in-memory Upstash stub and the console mail
 * transport, and it is held by `gate-servers-carry-a-limiter`. The admin login
 * path is rate limited, so a server without a limiter backend fails closed and
 * refuses the sign-in this drive depends on, which would read as a product
 * defect and would not be one. That mistake has been made three times on this
 * project; it is not made a fourth time here.
 *
 * Usage:
 *   node scripts/verify/ux5-drive.mjs
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[ux5-drive]'
const OUT = 'C:/dev/EVIDENCE/UX5'
const LOG = join(process.cwd(), '.tmp', 'ux5-drive-server.log')

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} REFUSING: .env.local points at the PRODUCTION project and this drive writes.`)
  process.exit(1)
}

const started = await startGateServer(env, LOG)
if (started.error) process.exit(1)
const { base, stop } = started
console.log(`${TAG} production build answering on ${base} (server log is ${LOG})`)

let status = 1
try {
  const r = spawnSync(
    process.execPath,
    ['scripts/verify/ux5-enrol-2fa-proof.mjs', '--out', OUT],
    { cwd: process.cwd(), stdio: 'inherit', env: { ...env, BASE: base, SERVER_LOG: LOG } },
  )
  status = r.status ?? 1
} finally {
  stop()
}

console.log(`${TAG} ${status === 0 ? 'PASS' : 'FAIL'}`)
process.exit(status)
