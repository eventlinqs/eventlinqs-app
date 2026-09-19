/**
 * AN1 DRIVEN PROOF. The network log, and the account that remembers where it
 * came from. At 390, 768 and 1440.
 *
 * WHAT IT DRIVES.
 *
 *   1. WITH NO CONSENT, on the homepage, /organisers and an event page: every
 *      single request is logged, and not one of them reaches a measurement or
 *      advertising host. This is the half that matters, and it is asserted
 *      against the network rather than against the source, because a source
 *      that looks gated and a browser that fetches anyway is exactly the
 *      failure mode.                                           (acceptance 2)
 *   2. THE BANNER IS THERE, both buttons are real, and the refusal is the one a
 *      keyboard reaches first.
 *   3. WITH CONSENT GIVEN, the platform asks for what it is configured to ask
 *      for, and nothing it is not, judged from the GATE'S OWN OUTPUT IN THE
 *      BROWSER. On a server started with no provider identifiers the gate
 *      renders no script at all, there is no positive half to prove, and this
 *      drive REFUSES rather than printing a pass: start the server with
 *      `node scripts/dev/lane-b-serve-with-stripe.mjs --measurement-ids`.
 *      Why it is not read from this process's environment, and what the version
 *      that did cost, is in scripts/verify/lib/an1-accepted-loads.mjs.
 *   4. AN ORGANISER SIGNS UP through the real form with
 *      ?src=organisers&utm_campaign=test on the first page they land on, and
 *      the account carries src, utm_campaign, the landing path and the
 *      referrer. The question is on the form and the signup completes without
 *      answering it.                                            (acceptance 1)
 *
 * Every row it creates on TEST carries lane-b in the email.
 *
 * Usage. FOUR things have to be in this command and the first version of this
 * header carried ONE of them, so running exactly what it said failed three
 * checks and then threw. Corrected 14 September 2026, by running it.
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     SERVER_LOG=.tmp-lane-b-serve.log \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/an1-consent-drive.mjs \
 *          --out C:/dev/EVIDENCE/AN1
 *
 * WHY EACH ONE, because a missing one fails as a PRODUCT defect rather than as
 * a setup error, which is the part that costs the time:
 *   env -u ...        this shell carries the PRODUCTION Supabase URL, so without
 *                     it the drive reads and writes the live database.
 *   SERVER_LOG        the harness reads the console inbox out of the server's own
 *                     log. Left on the default `.tmp-serve.log` it finds no
 *                     confirmation link and reports that the email carried none,
 *                     then that confirming did not make the account an organiser.
 *                     Lane B's server writes `.tmp-lane-b-serve.log`.
 *   UPSTASH_*         the rate-limit store the running server uses. Without it
 *                     signup answers 'a service we depend on is unavailable',
 *                     which is the limiter working correctly and reads at the UI
 *                     as broken signup.
 *   the two --import  this drive imports `src/**.ts`, and transitively
 *                     `signup-sources.ts`, which is `server-only`. Without them
 *                     node throws ERR_MODULE_NOT_FOUND part way through and the
 *                     run ends with checks unexecuted.
 *
 * Start the server first, and with the identifiers, or check 3 refuses:
 *   node scripts/dev/lane-b-serve-with-stripe.mjs --measurement-ids
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE, linkFromInbox } from '../journeys/harness.mjs'
import { ANALYTICS_HOSTS, ANALYTICS_PROVIDERS } from '../../src/lib/analytics/providers.ts'
import { judgeAcceptedLoads, GATE_SCRIPT_IDS, THE_COMMAND } from './lib/an1-accepted-loads.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
/**
 * AN1's REVERSAL CONDITION, DRIVEN.
 *
 * With this flag the drive asserts the OPPOSITE of check 3: the server holds
 * all four identifiers AND NEXT_PUBLIC_MEASUREMENT_OFF, so the gate must render
 * nothing and the browser must ask for nothing, for a person who ACCEPTED.
 *
 * It is a separate mode rather than a separate drive because it has to assert
 * against the same accept click, in the same browser, at the same three
 * viewports: a reversal proven on a different path is a reversal proven
 * somewhere else.
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs --measurement-ids --measurement-off
 *   ... an1-consent-drive.mjs --out <dir> --expect-measurement-off
 */
const expectMeasurementOff = args.includes('--expect-measurement-off')
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

function hits(requests) {
  return requests.filter(u => ANALYTICS_HOSTS.some(host => u.toLowerCase().includes(host)))
}

/**
 * NOTHING LEAVES THIS MACHINE FOR A TRACKER, even when the gate opens.
 *
 * The positive half of acceptance 2 needs the browser to ATTEMPT the requests,
 * which is what proves the gate opened. It does not need Google and Meta to
 * receive them from a laptop in Geelong with a made up identifier. So every
 * request to a provider host is aborted at the route layer; `page.on('request')`
 * still fires, so the attempt is recorded and counted, and the third party gets
 * nothing.
 */
async function abortEveryTracker(context) {
  await context.route('**/*', route => {
    const url = route.request().url()
    if (ANALYTICS_HOSTS.some(host => url.toLowerCase().includes(host))) return route.abort()
    return route.continue()
  })
}

/**
 * WHICH CONTROLS THE BANNER IS SITTING ON TOP OF, measured rather than assumed.
 *
 * Close-out AN1, 14 September 2026. Measured before the fix: at 390 the banner
 * stood 286 pixels tall, /admin/login does not scroll, and Sign in was entirely
 * underneath it. A control a finger lands on that does nothing is the same
 * defect as a dead link.
 *
 * TWO PASSES, because two different things can be covered and only one of them
 * moves. Document content is read at the FOOT of the page, where the reserved
 * space has done its work; fixed chrome, which scrolling cannot move, is read at
 * the TOP, where it is in its resting state rather than hidden mid-scroll.
 */
async function controlsUnderTheBanner(page, where) {
  if (where === 'foot') {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  } else {
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  await page.waitForTimeout(700)
  return page.evaluate(at => {
    const banner = document.querySelector('[aria-label="Cookies and measurement"]')
    if (!banner) return { banner: null, covered: [] }
    const b = banner.getBoundingClientRect()
    const covered = []
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary')) {
      if (banner.contains(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue
      const fixed = (() => {
        let node = el
        while (node && node !== document.body) {
          if (getComputedStyle(node).position === 'fixed') return true
          node = node.parentElement
        }
        return false
      })()
      if (at === 'foot' ? fixed : !fixed) continue
      if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) {
        covered.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40))
      }
    }
    return { banner: { height: Math.round(b.height) }, covered }
  }, where)
}

/** A live event page a visitor can actually reach, read rather than guessed. */
async function anEventSlug() {
  const { data } = await db
    .from('events')
    .select('slug')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .limit(1)
    .maybeSingle()
  return data?.slug ?? null
}

/**
 * IS THE SERVER SERVING THE WHOLE APPLICATION, OR PART OF IT?
 *
 * Twice on 14 September 2026 a `next dev` on this machine came up serving a
 * PARTIAL route tree: every admin child route answered 404 the first time, and
 * `POST /api/auth/signup` answered 404 the second, while the routes were on
 * disk, in the manifest, and perfectly healthy. Both times a restart fixed it
 * and both times the drive reported it as a product failure, because that is
 * what it looks like from the outside.
 *
 * So the drive asks first. A 404 from a route this drive depends on is not a
 * finding about the product, it is a finding about the server, and saying so
 * before any check runs is the difference between an hour lost and a restart.
 */
async function everyRouteThisDriveNeedsIsServed() {
  const missing = []
  for (const [method, path] of [
    ['GET', '/'],
    ['GET', '/organisers'],
    ['GET', '/signup?role=organiser'],
    ['GET', '/login'],
    ['GET', '/admin/login'],
    ['POST', '/api/auth/signup'],
  ]) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      redirect: 'manual',
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? '{}' : undefined,
    }).catch(() => null)
    if (!response) missing.push(`${method} ${path} did not answer at all`)
    else if (response.status === 404) missing.push(`${method} ${path} answered 404`)
  }
  return missing
}

let browser = null
let createdUserId = null

try {
  const unserved = await everyRouteThisDriveNeedsIsServed()
  if (unserved.length > 0) {
    console.error('FAIL: this dev server is serving a partial route tree, so nothing measured against it would mean anything.')
    for (const line of unserved) console.error(`  ${line}`)
    console.error('Restart `next dev` on this port and run again. It is the server, not the product: the routes are on disk.')
    process.exit(1)
  }

  const slug = await anEventSlug()
  if (!slug) throw new Error('TEST has no published public future event, so the third surface cannot be loaded')
  console.log(`event page  /events/${slug}`)

  browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    await abortEveryTracker(context)
    const page = await context.newPage()
    const requested = []
    page.on('request', r => requested.push(r.url()))

    // 1. NO CONSENT. Three surfaces, every request watched.
    for (const path of ['/', '/organisers', `/events/${slug}`]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(async () => {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      })
      await page.waitForTimeout(4000)
    }
    const before = hits(requested)
    check(
      `an1.${vp.label}.no-tracker-before-consent`,
      before.length === 0,
      `${requested.length} request(s) across three surfaces, ${before.length} to a measurement or advertising host${before.length ? `: ${JSON.stringify(before.slice(0, 5))}` : ''}`,
    )
    writeFileSync(
      join(out, `${vp.label}-requests-no-consent.json`),
      JSON.stringify({ surfaces: ['/', '/organisers', `/events/${slug}`], total: requested.length, analyticsHits: before, requested }, null, 2),
    )

    // 2. The banner, and both of its buttons.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(3000)
    const banner = await page.evaluate(() => {
      const region = document.querySelector('[aria-label="Cookies and measurement"]')
      if (!region) return { present: false }
      const buttons = [...region.querySelectorAll('button')].map(b => ({
        label: (b.textContent ?? '').trim(),
        height: Math.round(b.getBoundingClientRect().height),
      }))
      return { present: true, buttons }
    })
    await page.screenshot({ path: join(out, `${vp.label}-01-banner.png`), fullPage: false })
    check(
      `an1.${vp.label}.banner-offers-both-answers`,
      banner.present === true && banner.buttons?.length === 2 && banner.buttons.every(b => b.height >= 44),
      JSON.stringify(banner),
    )
    check(
      `an1.${vp.label}.refusal-is-reachable-first`,
      banner.buttons?.[0]?.label === 'No thanks',
      `the first button reads ${JSON.stringify(banner.buttons?.[0]?.label)}, so the safe answer is not the harder one to give`,
    )

    // 2b. THE BANNER SITS ON NOTHING. Three pages, chosen because two of them
    //     do not scroll at 390 and one of them is the page this whole item
    //     exists to measure.
    for (const path of ['/admin/login', '/signup?role=organiser', '/organisers']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(2500)
      const atFoot = await controlsUnderTheBanner(page, 'foot')
      const atTop = await controlsUnderTheBanner(page, 'top')
      const name = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
      check(
        `an1.${vp.label}.${name}.the-banner-covers-no-control`,
        atFoot.banner !== null && atFoot.covered.length === 0 && atTop.covered.length === 0,
        atFoot.banner === null
          ? 'no banner rendered on this page, so there was nothing to measure, which is itself the failure'
          : `banner ${atFoot.banner.height}px tall; ${atFoot.covered.length} control(s) under it at the foot of the page and ${atTop.covered.length} fixed control(s) under it at the top${atFoot.covered.length + atTop.covered.length ? `: ${JSON.stringify([...atFoot.covered, ...atTop.covered])}` : ''}`,
      )
    }

    // 3. REFUSE. Nothing is requested and the banner does not return.
    requested.length = 0
    await page.getByRole('button', { name: 'No thanks' }).click()
    await page.waitForTimeout(2000)
    await page.goto(`${BASE}/organisers`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(4000)
    const afterRefusal = hits(requested)
    const bannerBack = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Cookies and measurement"]')))
    check(
      `an1.${vp.label}.refusal-is-honoured-and-remembered`,
      afterRefusal.length === 0 && bannerBack === false,
      `${afterRefusal.length} tracker request(s) after refusing; the banner ${bannerBack ? 'came back' : 'stayed down'}`,
    )

    // 4. ACCEPT. The gate's answer changes, and what it then loads is judged
    //    from the GATE'S OWN OUTPUT IN THIS BROWSER rather than from this
    //    process's environment. The two are different machines' answers: a
    //    NEXT_PUBLIC value reaches the browser because the SERVER inlined it,
    //    and the version of this check that read `process.env` here both passed
    //    without proving anything and could fail a working platform. The whole
    //    account is in scripts/verify/lib/an1-accepted-loads.mjs.
    await context.clearCookies()
    requested.length = 0
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: 'That is fine' }).click()
    await page.waitForTimeout(4000)
    const afterAccept = hits(requested)
    // The gate's own script elements, by the ids the gate gives them. Whether
    // the gate has grown one this list does not name is a question answered at
    // BUILD time by clause 7 of no-analytics-before-consent.mjs, not here: an
    // earlier version of this line collected every `el-` script and refused all
    // three viewports over `el-headless-flag` and `el-real-user-bootstrap`,
    // which belong to the root layout and reach nothing.
    const emitted = await page.evaluate(
      ids => ids.filter(id => document.getElementById(id) !== null),
      GATE_SCRIPT_IDS,
    )
    if (expectMeasurementOff) {
      // The reversal, asserted where it matters: a person who said YES, on a
      // server that holds every identifier, and still nothing is emitted and
      // nothing is asked for.
      check(
        `an1.${vp.label}.the-one-flag-removes-every-script`,
        emitted.length === 0 && afterAccept.length === 0,
        emitted.length === 0 && afterAccept.length === 0
          ? 'a person who ACCEPTED, on a server holding all four identifiers: the gate emitted no script and the browser asked for no measurement host'
          : `the kill switch did not hold: the gate emitted ${JSON.stringify(emitted)} and ${afterAccept.length} request(s) reached a provider host`,
      )
    } else {
      const verdict = judgeAcceptedLoads({
        emitted,
        requested: afterAccept,
        registry: ANALYTICS_PROVIDERS,
      })
      check(
        `an1.${vp.label}.accepting-loads-only-what-is-configured`,
        verdict.verdict === 'proven',
        verdict.detail,
      )
    }
    const bannerGone = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Cookies and measurement"]')))
    check(`an1.${vp.label}.banner-closes-on-accept`, bannerGone === false, 'the banner is gone once answered')
    await page.screenshot({ path: join(out, `${vp.label}-02-after-accept.png`), fullPage: false })

    await context.close()
  }

  // 5. THE SIGNUP, driven at 390, through the real form.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const email = `lane-b-an1-${Date.now().toString(36)}@eventlinqs.test`
    const password = `${randomUUID()}Aa1`

    // The FIRST page carries the parameters, and the signup happens two pages
    // later: that is the whole point of a first-touch capture.
    await page.goto(`${BASE}/organisers?src=organisers&utm_campaign=test`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(3500)
    await page.goto(`${BASE}/signup?role=organiser`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(3000)

    const question = await page.evaluate(() => {
      const select = document.querySelector('#heardFrom')
      const label = select ? document.querySelector('label[for="heardFrom"]') : null
      return {
        present: Boolean(select),
        question: (label?.textContent ?? '').trim(),
        required: select instanceof HTMLSelectElement ? select.required : null,
        firstOption: select instanceof HTMLSelectElement ? select.options[0]?.text : null,
      }
    })
    await page.screenshot({ path: join(out, 'mobile-390-03-signup-question.png'), fullPage: false })
    check(
      'an1.mobile-390.question-is-rendered-and-skippable',
      question.present === true && question.required === false && question.firstOption === 'Prefer not to say',
      JSON.stringify(question),
    )

    await page.locator('#fullName').fill('Lane B AN1 Organiser')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    // Deliberately NOT answering the question, to prove it does not block.
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(u => u.pathname.startsWith('/verify-email-sent'), { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(out, 'mobile-390-04-signed-up.png'), fullPage: false })
    check(
      'an1.mobile-390.signup-completes-without-answering',
      new URL(page.url()).pathname.startsWith('/verify-email-sent'),
      `landed on ${page.url().replace(BASE, '')}`,
    )

    const { data: profile } = await db
      .from('profiles')
      .select('id, signup_src, signup_landing_path, signup_referrer_host, signup_utm, signup_heard_from')
      .eq('email', email)
      .maybeSingle()
    createdUserId = profile?.id ?? null
    check(
      'an1.mobile-390.account-remembers-where-it-came-from',
      profile?.signup_src === 'organisers' &&
        profile?.signup_landing_path === '/organisers' &&
        (profile?.signup_utm ?? {}).campaign === 'test',
      JSON.stringify({
        src: profile?.signup_src,
        landing: profile?.signup_landing_path,
        referrer: profile?.signup_referrer_host,
        utm: profile?.signup_utm,
        heardFrom: profile?.signup_heard_from,
      }),
    )
    check(
      'an1.mobile-390.unanswered-is-stored-as-unanswered',
      profile?.signup_heard_from === null,
      `signup_heard_from is ${JSON.stringify(profile?.signup_heard_from)}, which is the honest record of a question nobody answered`,
    )

    /*
     * CONFIRM THE ADDRESS, because an organiser is not an organiser until they
     * have. The role is applied at /auth/confirm, not at signup, which is
     * correct and is also why the weekly query below counts nothing before this
     * happens: it counts ORGANISERS, and an unconfirmed signup is a person who
     * started. The link is taken from the console inbox the local transport
     * prints, the same way every other journey on this platform reads it.
     */
    const confirmUrl = linkFromInbox(email, /auth\/confirm/)
    check('an1.mobile-390.the-confirmation-email-carries-a-link', Boolean(confirmUrl), confirmUrl ? 'the console inbox holds the confirmation link' : 'no confirmation link was printed, so SERVER_LOG is not pointed at the running server')
    if (confirmUrl) {
      await page.goto(confirmUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(3500)
    }
    const { data: confirmed } = await db.from('profiles').select('role').eq('email', email).maybeSingle()
    check(
      'an1.mobile-390.confirming-makes-them-an-organiser',
      confirmed?.role === 'organiser',
      `the account's role is ${JSON.stringify(confirmed?.role)} after confirming`,
    )

    /*
     * ACCEPTANCE 3, against the database rather than against a fixture. The
     * weekly query is the one line the owner digest prints, and a query that
     * shapes a sentence correctly over invented rows is not the same claim as a
     * query that counts a real account somebody just created. This runs it over
     * the live TEST project, with the account above inside the window, and
     * asserts it is in there.
     */
    const { getOrganiserSignupSources, organiserSignupSourceLine } = await import('../../src/lib/growth/signup-sources.ts')
    const counts = await getOrganiserSignupSources()
    const surface = counts.surfaces.find(s => s.label === 'organisers')
    check(
      'an1.weekly-source-query-counts-the-real-account',
      counts.unavailable === false && counts.total >= 1 && Boolean(surface) && surface.count >= 1,
      `the query read ${counts.total} organiser signup(s) in the last seven days, ${surface?.count ?? 0} of them from the organisers surface`,
    )
    check(
      'an1.weekly-source-line-says-something-a-person-can-read',
      typeof organiserSignupSourceLine(counts) === 'string' &&
        organiserSignupSourceLine(counts).startsWith('Organiser signups this week:'),
      organiserSignupSourceLine(counts) ?? 'the line was null, which only happens when the read failed',
    )

    await context.close()
  }
} catch (error) {
  failures.push(`drive threw: ${String(error?.message ?? error)}`)
  console.error(error)
} finally {
  // The account this drive created is its own and is removed, so TEST is left
  // as it was found.
  if (createdUserId) {
    await db.from('profiles').delete().eq('id', createdUserId)
    // THE DELETION IS REPORTED, NEVER SWALLOWED. This line used to end
    // `.catch(() => {})`, and the re-read below only asks about `profiles`,
    // which has already gone: so a refused `deleteUser` left an auth account
    // behind while the check printed "left as found". That is exactly how
    // eighteen lane B accounts accumulated on TEST unnoticed until AQ3's
    // teardown refused to build a fixture (19 September 2026). A teardown that
    // cannot fail is not a teardown.
    const { error: deleteError } = await db.auth.admin.deleteUser(createdUserId)
    const { data: gone } = await db.from('profiles').select('id').eq('id', createdUserId).maybeSingle()
    check(
      'an1.teardown.left-as-found',
      !gone && !deleteError,
      deleteError
        ? `the profile is removed but the auth account ${createdUserId} is NOT: ${deleteError.message}`
        : `the drive account ${createdUserId} is removed`,
    )
  }
  if (browser) await browser.close()
}

writeFileSync(
  join(out, 'an1-drive-report.json'),
  JSON.stringify({ base: BASE, when: new Date().toISOString(), checks, failures }, null, 2),
)
console.log(`\n${checks.filter(c => c.ok).length} of ${checks.length} checks passed`)
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}`)
  for (const f of failures) console.error(`  ${f}`)
  if (failures.some(f => f.includes('the gate rendered no provider script'))) {
    console.error(`\nThe positive half of acceptance 2 needs a server that was given the identifiers:\n  ${THE_COMMAND}`)
  }
  process.exit(1)
}
console.log('PASS - nothing loads before consent, and an account remembers where it came from.')
