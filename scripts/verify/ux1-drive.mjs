/**
 * THE UX1 DRIVE. Serves this tree's production build and runs the signed-in
 * organiser journey against it at 390, 768 and 1440.
 *
 * WHY THIS EXISTS. The UX1 ledger recorded this journey as written but not run,
 * "because `auth-signup` and `auth-login` are `failClosed: true` on the rate
 * limiter by doctrine and a local checkout has no Upstash", and deferred it to
 * the deployed preview. That premise stopped being true on 10 September 2026,
 * when `startGateServer` was extracted precisely so every served-build step gets
 * the in-memory Upstash stub and the console mail transport. The rate limiter
 * has a backend here now, and no policy has to be weakened to prove anything.
 *
 * The deployed preview is still unreachable for an unrelated reason - the push
 * gate refuses on production parity - so a proof that only runs there is a proof
 * that does not run. This one runs on this machine.
 *
 * WHY IT BORROWS THE GATE'S OWN SERVER rather than spawning one: three steps
 * did that and two of them handed the server no Redis, so the money path failed
 * closed and the drive reported six product defects that were entirely its own
 * missing limiter. `gate-servers-carry-a-limiter` holds the boundary.
 *
 * Usage:
 *   node scripts/verify/ux1-drive.mjs [--only mobile-390|tablet-768|desktop-1440]
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[ux1-drive]'
const OUT = 'C:/dev/EVIDENCE/UX1'
const LOG = join(process.cwd(), '.tmp', 'ux1-drive-server.log')

const args = process.argv.slice(2)
let only = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--only') only = args[++i]

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} REFUSING: .env.local points at the PRODUCTION project and this drive writes.`)
  process.exit(1)
}

const started = await startGateServer(env, LOG)
if (started.error) process.exit(1)
const { base, stop } = started
console.log(`${TAG} production build answering on ${base} (server log, and the inbox, is ${LOG})`)

let failures = 0
try {
  for (const viewport of only ? [only] : ['mobile-390', 'tablet-768', 'desktop-1440']) {
    console.log(`${TAG} ---- the organiser journey at ${viewport} ----`)
    const r = spawnSync(
      process.execPath,
      ['scripts/verify/ux1-organiser-surfaces-proof.mjs', '--out', OUT],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...env, BASE: base, SERVER_LOG: LOG, JOURNEY_VIEWPORT: viewport },
      },
    )
    if ((r.status ?? 1) !== 0) failures += 1
  }
} finally {
  stop()
}

console.log(`${TAG} ${failures === 0 ? 'PASS' : `FAIL (${failures} viewport(s))`}`)
process.exit(failures === 0 ? 0 : 1)
