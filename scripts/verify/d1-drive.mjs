/**
 * THE D1 DRIVE. Serves this tree's production build and runs the slot ledger's
 * driven proof against it: the reversal-condition measurement, then the panel
 * at 390, 768 and 1440.
 *
 * WHY IT BORROWS THE GATE'S OWN SERVER RATHER THAN STARTING ITS OWN. Ten hours
 * before this file existed, the gate's UX6 checkout step reported six product
 * defects that were entirely its own missing rate-limit backend, because it
 * spawned `next start` in its own block and forgot the stub. That is now one
 * function, `startGateServer`, held by
 * `scripts/guards/gate-servers-carry-a-limiter.mjs`, and this drive uses it. A
 * second copy here would be the fourth copy of the mistake.
 *
 * Usage:
 *   node scripts/verify/d1-drive.mjs [--only latency|proof]
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[d1-drive]'
let OUT = 'C:/dev/EVIDENCE/D1'
const LOG = join(process.cwd(), '.tmp', 'd1-drive-server.log')

const args = process.argv.slice(2)
let only = null
let VIEWPORTS = ['mobile-390', 'tablet-768', 'desktop-1440']
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--only') only = args[++i]
  // So a re-run lands beside the run it is being compared with rather than on
  // top of it: every leg writes report.txt and checks.json under OUT.
  else if (args[i] === '--out') OUT = args[++i]
  // One width on its own, for a drill. A red that costs three widths to see is
  // a red somebody stops taking.
  else if (args[i] === '--viewport') VIEWPORTS = [args[++i]]
}

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} REFUSING: .env.local points at the PRODUCTION project and this drive writes.`)
  process.exit(1)
}

const started = await startGateServer(env, LOG)
if (started.error) process.exit(1)
const { base, stop } = started
console.log(`${TAG} production build answering on ${base} (server log: ${LOG})`)

const run = (script, extra = {}) => {
  const r = spawnSync(process.execPath, [script, '--out', OUT], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...env, ...extra, BASE: base },
  })
  return r.status ?? 1
}

let failures = 0
try {
  if (!only || only === 'latency') {
    console.log(`${TAG} ---- the reversal condition, measured ----`)
    if (run('scripts/verify/d1-ledger-latency.mjs') !== 0) failures += 1
  }
  if (!only || only === 'proof') {
    for (const viewport of VIEWPORTS) {
      console.log(`${TAG} ---- the panel at ${viewport} ----`)
      if (run('scripts/verify/d1-slot-ledger-proof.mjs', { JOURNEY_VIEWPORT: viewport }) !== 0) failures += 1
    }
  }
} finally {
  stop()
}

if (failures > 0) {
  console.error(`${TAG} ${failures} leg(s) FAILED.`)
  process.exit(1)
}
console.log(`${TAG} every leg passed.`)
