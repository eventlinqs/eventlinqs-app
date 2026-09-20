/**
 * MONEY FIX, ACCEPTANCE LINE 7. One command, three widths.
 *
 * PROVES that a buyer cannot be charged for an organiser who has no connected
 * account, and is told why, at 390, 768 and 1440. The per-width work is in
 * money-no-connected-account-proof.mjs; this owns the server and the
 * environment so the proof owns neither.
 *
 * NO STRIPE, DELIBERATELY. Unlike money-waived-fee-drive.mjs this needs no key
 * pair, no card and no `stripe listen`, because the refusal happens before a
 * charge is ever attempted. Requiring them would be arranging a Stripe session
 * to prove Stripe is never reached.
 *
 * IT USES THE BUILD THAT IS THERE and says which one. It does not build: the
 * push gate has just built this tree, and a second build of the same tree costs
 * four minutes and proves nothing. If .next is missing it refuses rather than
 * quietly measuring a dev server, because a dev server is not what deploys.
 *
 * Usage:
 *   node scripts/verify/money-no-connected-account-drive.mjs
 *        [--viewport mobile-390|tablet-768|desktop-1440]
 *        [--out C:/dev/EVIDENCE/MONEY-A7/<stamp>]
 *
 * Refuses: a production Supabase project, and a tree with no production build.
 */
import { existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[a7-drive]'
const ROOT = process.cwd()

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const stamp = new Date().toISOString().slice(0, 10)
const OUT = (flag('out') ?? `C:/dev/EVIDENCE/MONEY-A7/${stamp}`).replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const LOG = join(ROOT, '.tmp', 'a7-drive-server.log')

const say = (line) => {
  console.log(line)
  appendFileSync(join(OUT, 'drive.txt'), `${line}\n`)
}

const env = envFor('local')
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  say(`${TAG} REFUSING: no TEST Supabase credentials in .env.local.`)
  process.exit(2)
}
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  say(`${TAG} REFUSING: .env.local points at the PRODUCTION project. This drive writes fixtures.`)
  process.exit(2)
}
if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  say(`${TAG} REFUSING: no production build in .next. Run \`npm run gate:push -- --only build\` first.`)
  process.exit(2)
}

// EMAIL_TRANSPORT=console: the fixture creates a user, and a proof may not post
// mail to a real person from a shared TEST project.
env.EMAIL_TRANSPORT = 'console'

let failures = 0
let stop = () => {}
try {
  const started = await startGateServer(env, LOG, { mail: 'console' })
  stop = started.stop
  const base = started.base
  say(`${TAG} serving the production build at ${base}`)

  const viewports = ['mobile-390', 'tablet-768', 'desktop-1440']
  const only = flag('viewport')
  const run = only ? [only] : viewports
  for (const viewport of run) {
    say(`${TAG} ---- a purchase is refused with no connected account, at ${viewport} ----`)
    const r = spawnSync(
      process.execPath,
      ['scripts/verify/money-no-connected-account-proof.mjs', '--out', OUT],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...env, BASE: base, SERVER_LOG: LOG, JOURNEY_VIEWPORT: viewport },
      },
    )
    if ((r.status ?? 1) !== 0) failures += 1
  }
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? cause.message : String(cause)}`)
  failures += 1
} finally {
  stop()
}

if (failures > 0) {
  say(`${TAG} ${failures} width(s) FAILED. Evidence under ${OUT}`)
  process.exit(1)
}
say(`${TAG} every width passed: with no connected account the buyer is refused and told why. Evidence under ${OUT}`)
