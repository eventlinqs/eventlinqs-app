/**
 * A MANGLED UNSUBSCRIBE LINK ANSWERS A SENTENCE, NOT A 500. One command, three
 * widths, both routes, four token kinds each.
 *
 * WHAT IT PROVES, and why each leg is here. The push gate's route sweep refused
 * 348 commits on 21 September 2026 with
 *
 *     http://127.0.0.1:63687/unsubscribe/zzzzzzzzzzzz: server error 500
 *     http://127.0.0.1:63687/waitlist/unsubscribe/zzzzzzzzzzzz: server error 500
 *
 * so the first leg is that exact URL. But a page that answers "this link is not
 * valid" to EVERYTHING would pass that leg and would have broken every live
 * unsubscribe link in every inbox, which is a far worse defect than the one
 * being fixed. So each route is driven with four tokens and the last one is a
 * REAL row planted in TEST for this run:
 *
 *   zzzzzzzzzzzz        the value that refused the push
 *   36 hyphens          36 characters, which the old `/^[0-9a-f-]{36}$/` length
 *                       test in src/app/waitlist/actions.ts ACCEPTED and TEST
 *                       answers `22P02 invalid input syntax for type uuid` to
 *   a random uuid       well formed and matching nothing: the case the "not
 *                       valid" sentence was written for, unchanged by the fix
 *   the planted token   THE CONTROL. The form must render, or the fix has
 *                       quietly broken the facility it was protecting
 *
 * THE STATUS IS ASSERTED FROM THE RESPONSE, not inferred from the page. A 500
 * in this application renders an error boundary that is still HTML, so reading
 * the body alone cannot tell a working page from a broken one.
 *
 * TEST ONLY. It plants two rows and removes them, and the teardown re-reads
 * rather than trusting its own delete.
 *
 * Usage:
 *   node scripts/verify/unsubscribe-mangled-link-drive.mjs
 *        [--viewport mobile-390|tablet-768|desktop-1440]
 *        [--out C:/dev/EVIDENCE/UNSUB500/<stamp>]
 *
 * Refuses: a production Supabase project, and a tree with no production build.
 */
import { existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

/*
 * THE PLATFORM'S OWN PREFLIGHT, AND IT REPLACED A HAND-ROLLED ONE. The first
 * version of this drive tested the project ref against a literal itself, which
 * scripts/guards/no-unguarded-production-write.mjs refused, correctly: it
 * cannot recognise every private spelling of the same check, and a drive that
 * plants rows is exactly what that guard exists for. This entry point resolves
 * the project this process will ACTUALLY use, refuses production unless
 * ALLOW_PRODUCTION_SUPABASE is explicitly set, and refuses outright when it
 * cannot tell.
 */
assertNotProduction()

const TAG = '[unsub500]'
const ROOT = process.cwd()

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const OUT = (flag('out') ?? `C:/dev/EVIDENCE/UNSUB500/${stamp}`).replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const LOG = join(ROOT, '.tmp', 'unsub500-server.log')

const say = (line) => {
  console.log(line)
  appendFileSync(join(OUT, 'drive.txt'), `${line}\n`)
}

const env = envFor('local')
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  say(`${TAG} REFUSING: no TEST Supabase credentials in .env.local.`)
  process.exit(2)
}
if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  say(`${TAG} REFUSING: no production build in .next. Run \`npm run gate:push -- --only build\` first.`)
  process.exit(2)
}
env.EMAIL_TRANSPORT = 'console'

const SIZES = {
  'mobile-390': { width: 390, height: 844, isMobile: true },
  'tablet-768': { width: 768, height: 1024, isMobile: false },
  'desktop-1440': { width: 1440, height: 900, isMobile: false },
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const runId = `unsub500-${Date.now().toString(36)}`
const FIXTURE_EMAIL = `${runId}@example.com`

const checks = []
const check = (name, pass, detail) => {
  checks.push({ name, pass })
  say(`${TAG} ${pass ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

/** The four tokens each route is driven with, in the order they are reported. */
const MANGLED = 'zzzzzzzzzzzz'
const THIRTY_SIX_HYPHENS = '-'.repeat(36)
const UNKNOWN_BUT_WELL_FORMED = randomUUID()

let browser = null
let stop = () => {}
let plantedOrganiser = null
let plantedWaitlist = null

try {
  // ── PLANT THE CONTROL ──────────────────────────────────────────────────────
  // The organisation is ENUMERATED, never guessed: this drive has no business
  // inventing an id and a foreign key would refuse one anyway.
  const { data: org, error: orgError } = await db
    .from('organisations')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (orgError || !org) throw new Error(`no organisation on TEST to attach a consent to: ${orgError?.message}`)
  say(`${TAG} control organisation enumerated from TEST: ${org.name} (${org.id})`)

  const organiserToken = randomUUID()
  const { error: consentError } = await db.from('organiser_marketing_consents').insert({
    organisation_id: org.id,
    email: FIXTURE_EMAIL,
    consent_text: 'Planted by unsubscribe-mangled-link-drive.mjs; removed by its teardown.',
    source: 'lane-a-proof',
    unsubscribe_token: organiserToken,
  })
  if (consentError) throw new Error(`could not plant the organiser consent: ${consentError.message}`)
  plantedOrganiser = organiserToken

  const waitlistToken = randomUUID()
  const { error: waitlistError } = await db.from('city_waitlist_signups').insert({
    city_slug: 'geelong',
    full_name: 'Lane A Unsub Proof',
    email: FIXTURE_EMAIL,
    role: 'attendee',
    consent_text: 'Planted by unsubscribe-mangled-link-drive.mjs; removed by its teardown.',
    unsubscribe_token: waitlistToken,
  })
  if (waitlistError) throw new Error(`could not plant the waitlist signup: ${waitlistError.message}`)
  plantedWaitlist = waitlistToken
  say(`${TAG} two control rows planted under ${FIXTURE_EMAIL}`)

  const started = await startGateServer(env, LOG, { mail: 'console' })
  stop = started.stop
  const base = started.base
  say(`${TAG} serving the production build at ${base}`)

  const legs = [
    { route: '/unsubscribe', token: MANGLED, label: 'the value that refused the push', expect: 'This link is not valid' },
    { route: '/unsubscribe', token: THIRTY_SIX_HYPHENS, label: '36 characters the old length test accepted', expect: 'This link is not valid' },
    { route: '/unsubscribe', token: UNKNOWN_BUT_WELL_FORMED, label: 'well formed, matches nothing', expect: 'This link is not valid' },
    { route: '/unsubscribe', token: organiserToken, label: 'THE CONTROL, a real token', expect: 'Unsubscribe from' },
    { route: '/waitlist/unsubscribe', token: MANGLED, label: 'the value that refused the push', expect: 'This link is not valid' },
    { route: '/waitlist/unsubscribe', token: THIRTY_SIX_HYPHENS, label: '36 characters the old length test accepted', expect: 'This link is not valid' },
    { route: '/waitlist/unsubscribe', token: UNKNOWN_BUT_WELL_FORMED, label: 'well formed, matches nothing', expect: 'This link is not valid' },
    { route: '/waitlist/unsubscribe', token: waitlistToken, label: 'THE CONTROL, a real token', expect: 'Stop ' },
  ]

  browser = await chromium.launch()
  const only = flag('viewport')
  const widths = only ? [only] : Object.keys(SIZES)

  for (const viewport of widths) {
    const size = SIZES[viewport]
    if (!size) throw new Error(`unknown viewport ${viewport}`)
    say(`${TAG} ---- ${viewport} ----`)
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.isMobile, hasTouch: size.isMobile })
    const page = await context.newPage()

    let n = 0
    for (const leg of legs) {
      n += 1
      /*
       * ONE LEG CANNOT TAKE THE DRIVE DOWN. The first green run answered the
       * defect leg correctly (HTTP 200, "This link is not valid") and then
       * threw on `page.screenshot: Protocol error (Page.captureScreenshot)`,
       * which is the renderer and not the product, and the throw discarded the
       * forty-six checks that had not run yet. A harness that loses a run's
       * evidence to a flake reports a product failure that did not happen.
       */
      try {
        const url = `${base}${leg.route}/${encodeURIComponent(leg.token)}`
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
        const status = response?.status() ?? 0
        await page.waitForLoadState('load').catch(() => {})
        const body = await page.locator('body').innerText()

        check(
          `${viewport} ${leg.route} ${leg.label}: answers 200, not a server error`,
          status === 200,
          `HTTP ${status}`,
        )
        check(
          `${viewport} ${leg.route} ${leg.label}: says "${leg.expect.trim()}"`,
          body.includes(leg.expect),
          body.split('\n').filter(Boolean).slice(0, 2).join(' | ').slice(0, 90),
        )

        const shot = join(OUT, `${viewport}-${String(n).padStart(2, '0')}-${leg.route.replace(/\//g, '_')}.png`)
        const capture = () => page.screenshot({ path: shot, fullPage: false, animations: 'disabled' })
        let captured = true
        try {
          await capture()
        } catch {
          // One retry, because the renderer is occasionally busy and the
          // screenshot is evidence rather than an assertion.
          try {
            await capture()
          } catch (shotError) {
            captured = false
            say(`${TAG}      screenshot failed twice: ${shotError instanceof Error ? shotError.message.split('\n')[0] : String(shotError)}`)
          }
        }
        check(`${viewport} ${leg.route} ${leg.label}: photographed`, captured)
      } catch (legError) {
        check(
          `${viewport} ${leg.route} ${leg.label}: the leg ran`,
          false,
          legError instanceof Error ? legError.message.split('\n')[0] : String(legError),
        )
      }
    }
    await context.close()
  }
} catch (cause) {
  check('the drive ran to completion', false, cause instanceof Error ? cause.message : String(cause))
} finally {
  if (browser) await browser.close().catch(() => {})
  stop()

  // TEST LEFT AS FOUND, and the teardown re-reads rather than trusting itself.
  if (plantedOrganiser) await db.from('organiser_marketing_consents').delete().eq('unsubscribe_token', plantedOrganiser)
  if (plantedWaitlist) await db.from('city_waitlist_signups').delete().eq('unsubscribe_token', plantedWaitlist)
  const { count: leftConsents } = await db
    .from('organiser_marketing_consents')
    .select('id', { count: 'exact', head: true })
    .eq('email', FIXTURE_EMAIL)
  const { count: leftWaitlist } = await db
    .from('city_waitlist_signups')
    .select('id', { count: 'exact', head: true })
    .eq('email', FIXTURE_EMAIL)
  say(`${TAG} rows left on TEST under ${FIXTURE_EMAIL}: ${leftConsents ?? '?'} consent(s), ${leftWaitlist ?? '?'} waitlist`)
  if ((leftConsents ?? 1) !== 0 || (leftWaitlist ?? 1) !== 0) {
    check('the fixture rows are gone from TEST', false, 'the teardown left something behind')
  }
}

const failed = checks.filter((c) => !c.pass)
say('')
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed. Evidence: ${OUT}`)
if (failed.length > 0) {
  for (const f of failed) say(`${TAG}   FAILED: ${f.name}`)
  process.exit(1)
}
say(`${TAG} a mangled unsubscribe link answers a sentence at every width, and a real one still works.`)
