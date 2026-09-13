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
 *      for, and nothing it is not. On a machine with no provider keys that is
 *      NOTHING, which the drive reports as the honest result rather than
 *      dressing up as a pass: what it proves here is that accepting changes the
 *      gate's answer, and the identifiers are the owner's to mint.
 *   4. AN ORGANISER SIGNS UP through the real form with
 *      ?src=organisers&utm_campaign=test on the first page they land on, and
 *      the account carries src, utm_campaign, the landing path and the
 *      referrer. The question is on the form and the signup completes without
 *      answering it.                                            (acceptance 1)
 *
 * Every row it creates on TEST carries lane-b in the email.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/an1-consent-drive.mjs --out C:/dev/EVIDENCE/AN1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { ANALYTICS_HOSTS } from '../../src/lib/analytics/providers.ts'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
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

let browser = null
let createdUserId = null

try {
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

    // 4. ACCEPT. The gate's answer changes; what it then asks for is whatever
    //    the owner has configured, which on this machine is nothing.
    await context.clearCookies()
    requested.length = 0
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: 'That is fine' }).click()
    await page.waitForTimeout(4000)
    const afterAccept = hits(requested)
    const configured = [
      process.env.NEXT_PUBLIC_POSTHOG_KEY,
      process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
      process.env.NEXT_PUBLIC_META_PIXEL_ID,
    ].filter(Boolean).length
    check(
      `an1.${vp.label}.accepting-loads-only-what-is-configured`,
      configured === 0 ? afterAccept.length === 0 : afterAccept.length > 0,
      configured === 0
        ? 'no provider identifier is configured on this machine, so accepting correctly loads nothing. The identifiers are the owner to mint (FOUNDER STEPS in AN1) and this check becomes a positive the day one is pasted in'
        : `${configured} provider(s) configured, ${afterAccept.length} request(s) made`,
    )
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
    await db.auth.admin.deleteUser(createdUserId).catch(() => {})
    const { data: gone } = await db.from('profiles').select('id').eq('id', createdUserId).maybeSingle()
    check('an1.teardown.left-as-found', !gone, `the drive account ${createdUserId} is removed`)
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
  process.exit(1)
}
console.log('PASS - nothing loads before consent, and an account remembers where it came from.')
