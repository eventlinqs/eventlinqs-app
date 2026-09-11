/**
 * THE S1 DRIVE. Serves this tree's production build and runs the connected
 * account health proof against it at 390, 768 and 1440.
 *
 * WHY IT BORROWS THE GATE'S OWN SERVER. `startGateServer` is the one function
 * that spawns `next start` WITH the in-memory Upstash stub and the console mail
 * transport, and it is held by `gate-servers-carry-a-limiter`. Both sign-in
 * paths this drive uses are rate limited, so a server without a limiter backend
 * fails closed and refuses the sign-in, which reads as a product defect and is
 * not one. That mistake has been made three times on this project and is not
 * made again here.
 *
 * The proof script imports the product's own `heartbeatEmail` from src, so it
 * runs under the src alias loader rather than plain node.
 *
 * Usage:
 *   node scripts/verify/s1-drive.mjs
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[s1-drive]'
const OUT = 'C:/dev/EVIDENCE/S1'
const LOG = join(process.cwd(), '.tmp', 's1-drive-server.log')

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
    ['--import', './scripts/lib/src-alias-loader.mjs', 'scripts/verify/s1-account-health-proof.mjs', '--out', OUT],
    { cwd: process.cwd(), stdio: 'inherit', env: { ...env, BASE: base, SERVER_LOG: LOG } },
  )
  status = r.status ?? 1
} finally {
  stop()
}

console.log(`${TAG} ${status === 0 ? 'PASS' : 'FAIL'}`)
process.exit(status)
