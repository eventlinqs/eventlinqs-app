/**
 * MONEY FIX, ACCEPTANCE LINE 8. One command, three widths.
 *
 * PROVES that an event cannot be published for an organiser without an enabled
 * connected account, at 390, 768 and 1440, and that the SAME event on the SAME
 * build publishes perfectly well when the organiser can be paid. The per-width
 * work is in money-publish-needs-an-account-proof.mjs; this owns the server and
 * the environment so the proof owns neither.
 *
 * NO STRIPE KEY NEEDED FOR THE REFUSAL, and that is deliberate: with no
 * connected account there is nothing for the reconciler to read, so the publish
 * gate answers from the row without reaching Stripe. Requiring a key would be
 * arranging a Stripe session to prove Stripe is never reached.
 *
 * IT USES THE BUILD THAT IS THERE and says which one. It does not build: the
 * push gate has just built this tree, and a second build of the same tree costs
 * four minutes and proves nothing. If .next is missing it refuses rather than
 * quietly measuring a dev server, because a dev server is not what deploys.
 *
 * Usage:
 *   node scripts/verify/money-publish-needs-an-account-drive.mjs
 *        [--viewport mobile-390|tablet-768|desktop-1440]
 *        [--out C:/dev/EVIDENCE/MONEY-A8/<stamp>]
 *
 * Refuses: a production Supabase project, and a tree with no production build.
 */
import { existsSync, mkdirSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[a8-drive]'
const ROOT = process.cwd()

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const stamp = new Date().toISOString().slice(0, 10)
const OUT = (flag('out') ?? `C:/dev/EVIDENCE/MONEY-A8/${stamp}`).replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const LOG = join(ROOT, '.tmp', 'a8-drive-server.log')

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

// The fixture creates a user, and a proof may not post mail to a real person
// from a shared TEST project.
env.EMAIL_TRANSPORT = 'console'

/*
 * ONE FIXTURE AND ONE SIGN-IN FOR ALL THREE WIDTHS.
 *
 * The first version built an organiser per viewport and signed in three times in
 * two minutes. Two widths passed and the third timed out on /login, which is
 * GoTrue's own per-IP limit working correctly and has nothing to do with what
 * this proves. proof-session.mjs records the same lesson. One organiser, one
 * session file, three widths.
 */
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const fixtureStamp = `a8${Date.now().toString(36)}`
const SLUG_PREFIX = 'lane-a-a8-presents'
// The session file holds live auth tokens, so it lives outside the repository.
process.env.PROOF_SESSION_FILE = join(tmpdir(), `eventlinqs-a8-${fixtureStamp}.json`)

let failures = 0
let stop = () => {}
let fixture = null
try {
  await purgeFixtures(db, (l) => say(`${TAG} purge: ${l}`), SLUG_PREFIX)
  fixture = await buildFixture(db, {
    stamp: fixtureStamp,
    ownerEmail: `lane-a-a8-${fixtureStamp}@example.com`,
    password: `A8-${fixtureStamp}-pw`,
    capacity: 10,
    priceCents: 4_500,
    log: (line) => say(`${TAG} fixture: ${line}`),
    brand: {
      org: 'Lane A A8 Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane A A8 Night',
      eventSlug: 'lane-a-a8-night',
      owner: 'Lane A A8 Owner',
    },
  })
  fixture.ownerEmail = `lane-a-a8-${fixtureStamp}@example.com`
  fixture.password = `A8-${fixtureStamp}-pw`

  /*
   * THE CHARGE-READY POSTURE, CAPTURED ONCE AND HANDED TO EVERY WIDTH.
   *
   * The three widths share one organiser, and each one DISCONNECTS it to prove
   * the refusal. The first run of this drive passed 10 of 10 at 390 and then
   * failed the CONTROL at 768 and 1440, because the organiser the second width
   * started from was the one the first width had just taken apart. Each width
   * now restores this before it does anything, so all three measure the same
   * starting state rather than each other's leftovers.
   */
  const { data: posture, error: postureErr } = await db
    .from('organisations')
    .select(
      'stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, stripe_capabilities, stripe_requirements, payout_destination, payout_status',
    )
    .eq('id', fixture.org.id)
    .maybeSingle()
  if (postureErr || !posture) throw new Error(`could not read the fixture posture: ${postureErr?.message}`)
  fixture.chargeReadyPosture = posture
  say(`${TAG} charge-ready posture captured: ${posture.stripe_account_id} (${posture.stripe_account_country})`)

  const started = await startGateServer(env, LOG, { mail: 'console' })
  stop = started.stop
  const base = started.base
  say(`${TAG} serving the production build at ${base}`)

  const viewports = ['mobile-390', 'tablet-768', 'desktop-1440']
  const only = flag('viewport')
  const run = only ? [only] : viewports
  for (const viewport of run) {
    say(`${TAG} ---- a paid event is refused publication with no connected account, at ${viewport} ----`)
    const r = spawnSync(
      process.execPath,
      ['scripts/verify/money-publish-needs-an-account-proof.mjs', '--out', OUT],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
          ...env,
          BASE: base,
          SERVER_LOG: LOG,
          JOURNEY_VIEWPORT: viewport,
          A8_FIXTURE: JSON.stringify(fixture),
          PROOF_SESSION_FILE: process.env.PROOF_SESSION_FILE,
        },
      },
    )
    if ((r.status ?? 1) !== 0) failures += 1
  }
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? cause.message : String(cause)}`)
  failures += 1
} finally {
  stop()
  // TEST LEFT AS FOUND, and the teardown re-reads rather than trusting itself.
  if (fixture) {
    await purgeFixtures(db, (l) => say(`${TAG} purge: ${l}`), SLUG_PREFIX).catch(() => {})
    const { data: left } = await db.from('organisations').select('id').like('slug', `${SLUG_PREFIX}-%`)
    say(`${TAG} fixture organisations left on TEST: ${(left ?? []).length}`)
  }
  rmSync(process.env.PROOF_SESSION_FILE, { force: true })
}

if (failures > 0) {
  say(`${TAG} ${failures} width(s) FAILED. Evidence under ${OUT}`)
  process.exit(1)
}
say(`${TAG} every width passed: an event cannot go live for an organiser who cannot be paid. Evidence under ${OUT}`)
