/**
 * THE D2 DRIVE. Serves this tree's production build and runs the recovery
 * engine's driven proof against it at 390, 768 and 1440.
 *
 * WHY IT BORROWS THE GATE'S OWN SERVER. `startGateServer` is the one function
 * that spawns `next start` WITH the in-memory Upstash stub and the console mail
 * transport, and it is held by `gate-servers-carry-a-limiter`. On 10 September
 * 2026 a step that spawned its own server reported six product defects that
 * were entirely its own missing rate-limit backend. A second copy here would be
 * the fourth copy of that mistake, and this drive needs the mail transport as
 * well: the inbox it reads is the server's own stdout.
 *
 * Usage:
 *   node scripts/verify/d2-drive.mjs [--only mobile-390|tablet-768|desktop-1440]
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[d2-drive]'
const OUT = 'C:/dev/EVIDENCE/D2'
const LOG = join(process.cwd(), '.tmp', 'd2-drive-server.log')

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
  const viewports = only && only !== 'waitlist' ? [only] : ['mobile-390', 'tablet-768', 'desktop-1440']
  if (only !== 'waitlist') {
    for (const viewport of viewports) {
      console.log(`${TAG} ---- the recovery engine at ${viewport} ----`)
      const r = spawnSync(process.execPath, ['scripts/verify/d2-recovery-proof.mjs', '--out', OUT], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...env, BASE: base, SERVER_LOG: LOG, JOURNEY_VIEWPORT: viewport },
      })
      if ((r.status ?? 1) !== 0) failures += 1
    }
  }

  /*
   * THE WAITING LIST RUNS ONCE, not once per viewport. It builds an organiser,
   * an event, a sold-out place and a queue from scratch through the interface,
   * and none of that is a question about layout: what it proves is who is
   * written to and when. The panel is the viewport-sensitive surface and it is
   * measured at all three above.
   */
  if (!only || only === 'waitlist') {
    console.log(`${TAG} ---- a freed place goes down the queue ----`)
    const r = spawnSync(process.execPath, ['scripts/verify/d2-waitlist-proof.mjs', '--out', OUT], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...env, BASE: base, SERVER_LOG: LOG, JOURNEY_OUT_ROOT: `${OUT}/journey` },
    })
    if ((r.status ?? 1) !== 0) failures += 1
  }
} finally {
  stop()
}

if (failures > 0) {
  console.error(`${TAG} ${failures} viewport(s) FAILED.`)
  process.exit(1)
}
console.log(`${TAG} every viewport passed.`)
