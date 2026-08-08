/**
 * Walk every signup failure in a real browser, at 1440 and 390, and screenshot
 * what a person actually sees.
 *
 * Founder's standing rule: a message is not done until it has been seen on
 * screen. This is the proof for the signup failure contract
 * (docs/auth/SIGNUP-FAILURE-CONTRACT.md).
 *
 * TWO KINDS OF CASE, LABELLED IN THE OUTPUT, NEVER BLURRED:
 *
 *   live     the form posts to the real deployed endpoint and renders whatever
 *            comes back. Proves the server AND the rendering.
 *   stubbed  the response is fulfilled with the exact payload the route returns
 *            for that class, because the cause cannot be induced on a running
 *            preview: our mail transport does not fail on request, Supabase
 *            does not go down on request, and GoTrue does not invent an
 *            unmodelled error code on request. The payloads here are the ones
 *            pinned by tests/unit/auth/signup-failures.test.ts, so what is
 *            unproven by THIS script is proven by that one. Only the rendering
 *            is being demonstrated.
 *
 * Usage:
 *   node scripts/verify/signup-failure-walk.mjs <base-url> [--live-only|--stub-only]
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.argv[2]
if (!BASE) {
  console.error('usage: node scripts/verify/signup-failure-walk.mjs <base-url>')
  process.exit(1)
}
const FLAGS = process.argv.slice(3)
const MODE = FLAGS.find((f) => f === '--live-only' || f === '--stub-only') ?? '--all'
/**
 * One viewport per run matters for the live cases. `auth-signup` allows five
 * attempts per IP per ten minutes, and three of the live cases post, so walking
 * both viewports in one run spends six and the last three come back 429. Run
 * `--viewport=1440`, wait out the window, then `--viewport=390`.
 */
const ONLY_VIEWPORT = FLAGS.find((f) => f.startsWith('--viewport='))?.split('=')[1] ?? null
const OUT = path.join('docs', 'auth', 'walk-2026-08-09')

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
].filter((v) => !ONLY_VIEWPORT || v.name === ONLY_VIEWPORT)

/** An address with a CONFIRMED account on the TEST project the preview reads. */
const REGISTERED = 'connect-prefill-proof@eventlinqs.com'

/** The exact bodies the route returns. Mirrored from the route + its tests. */
const STUB = {
  mail_transport_failed: {
    status: 502,
    body: {
      ok: false,
      failure: 'mail_transport_failed',
      error:
        'We could not send that email just now. This is a problem on our side, not with your account. Please try again in a few minutes.',
      field: null,
    },
  },
  service_unavailable: {
    status: 503,
    body: {
      ok: false,
      failure: 'service_unavailable',
      error:
        'We could not reach our account service just now. This is a problem on our side, not with your details. Please try again in a moment.',
      field: null,
    },
  },
  signup_rejected: {
    status: 400,
    body: {
      ok: false,
      failure: 'signup_rejected',
      error:
        'We could not create an account with those details. Check your email address and password, or sign in if you already have an account.',
      field: null,
    },
  },
  rate_limited: {
    status: 429,
    body: {
      ok: false,
      failure: 'rate_limited',
      error: 'Too many attempts from this connection. Please wait about 8 minutes and try again.',
      field: null,
      retryAfterSeconds: 480,
    },
  },
}

const CASES = [
  {
    id: '01-email-already-registered',
    kind: 'live',
    title: 'The email is already registered (the 2026-08-08 production failure)',
    fill: { fullName: 'Lawal Adams', email: REGISTERED, password: 'ValidPassword123' },
  },
  {
    id: '02-name-blank',
    kind: 'live',
    title: 'The name is blank',
    fill: { fullName: '   ', email: 'new-organiser@example.com', password: 'ValidPassword123' },
  },
  {
    id: '03-email-malformed',
    kind: 'live',
    title: 'The email is malformed',
    fill: { fullName: 'Lawal Adams', email: 'a@b', password: 'ValidPassword123' },
  },
  {
    id: '04-password-too-long',
    kind: 'live',
    title: 'The password is over the 128 ceiling',
    fill: { fullName: 'Lawal Adams', email: 'new-organiser@example.com', password: 'a'.repeat(200) },
  },
  {
    id: '05-password-too-short',
    kind: 'live',
    title: 'The password is under 8 characters (caught in the browser, never posted)',
    fill: { fullName: 'Lawal Adams', email: 'new-organiser@example.com', password: 'abc123' },
    // The input carries minLength=8, so the browser's own validation fires
    // first. Drop the attribute for this capture so the EventLinqs sentence is
    // the one on screen, which is what the server would also answer.
    relaxNativeValidation: true,
  },
  {
    id: '06-rate-limited',
    kind: 'stubbed',
    stub: 'rate_limited',
    title: 'The rate limiter fired',
    fill: { fullName: 'Lawal Adams', email: 'new-organiser@example.com', password: 'ValidPassword123' },
  },
  {
    id: '07-mail-transport-failed',
    kind: 'stubbed',
    stub: 'mail_transport_failed',
    title: 'The verification email could not be sent',
    fill: { fullName: 'Lawal Adams', email: 'new-organiser@example.com', password: 'ValidPassword123' },
  },
  {
    id: '08-service-unavailable',
    kind: 'stubbed',
    stub: 'service_unavailable',
    title: 'Supabase was unreachable',
    fill: { fullName: 'Lawal Adams', email: 'new-organiser@example.com', password: 'ValidPassword123' },
  },
  {
    id: '09-signup-rejected',
    kind: 'stubbed',
    stub: 'signup_rejected',
    title: 'Anything else GoTrue declines',
    fill: { fullName: 'Lawal Adams', email: 'new-organiser@example.com', password: 'ValidPassword123' },
  },
]

/**
 * Wait until React has actually taken over the form.
 *
 * Without this, six of ten live captures came back with no message at all: the
 * click landed on a form the browser still owned, so it submitted natively,
 * navigated, and cleared itself. `networkidle` says the network is quiet, not
 * that the page is interactive.
 *
 * The probe is the digest checkbox, which is a CONTROLLED input: its checked
 * state only survives a click once React is driving it. Toggled on, asserted,
 * toggled back, so the form is left exactly as found.
 */
async function waitForHydration(page) {
  const box = page.locator('#digestOptIn')
  await box.waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#digestOptIn')
      if (!el) return false
      el.click()
      const took = el.checked === true
      if (took) el.click()
      return took
    },
    { timeout: 15000, polling: 250 },
  )
  if (await box.isChecked()) await box.uncheck()
}

/** Read every error message currently on the form, in DOM order. */
async function messagesOnScreen(page) {
  return page.$$eval('[role="alert"]', (nodes) =>
    nodes.map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
  )
}

const GENERIC = 'Something went wrong on our side. Please try again, and contact us if it keeps happening.'

async function run() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const results = []

  for (const viewport of VIEWPORTS) {
    for (const testCase of CASES) {
      if (MODE === '--live-only' && testCase.kind !== 'live') continue
      if (MODE === '--stub-only' && testCase.kind !== 'stubbed') continue

      // A fresh context per case: no session, no leaked state. This is the
      // "clean incognito window" the founder reported from.
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()

      if (testCase.kind === 'stubbed') {
        const { status, body } = STUB[testCase.stub]
        await page.route('**/api/auth/signup', (route) =>
          route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
        )
      }

      await page.goto(`${BASE}/signup?role=organiser`, { waitUntil: 'networkidle' })
      await waitForHydration(page)

      if (testCase.relaxNativeValidation) {
        await page.evaluate(() => {
          document.querySelector('#password')?.removeAttribute('minLength')
          document.querySelector('form')?.setAttribute('novalidate', 'novalidate')
        })
      }

      await page.fill('#fullName', testCase.fill.fullName)
      await page.fill('#email', testCase.fill.email)
      await page.fill('#password', testCase.fill.password)

      // Record what the endpoint actually answered, so a live capture carries
      // its own server-side evidence rather than only a picture.
      let observed = null
      page.on('response', (res) => {
        if (res.url().includes('/api/auth/signup')) observed = res.status()
      })

      await page.click('button[type="submit"]')

      // The button label IS the completion signal: it reads "Creating account"
      // for exactly as long as the request is in flight. Waiting on an alert
      // instead screenshotted the in-flight state, because a case that posts
      // can take longer than a short timeout on a cold preview lambda.
      await page
        .waitForFunction(
          () => !/Creating account/i.test(document.querySelector('button[type="submit"]')?.textContent ?? ''),
          { timeout: 60000, polling: 200 },
        )
        .catch(() => {})

      const messages = await messagesOnScreen(page)
      const file = path.join(OUT, `${testCase.id}-${viewport.name}.png`)
      await page.screenshot({ path: file, fullPage: viewport.name === '390' })

      const showedGeneric = messages.some((m) => m.includes(GENERIC))
      results.push({
        case: testCase.id,
        title: testCase.title,
        kind: testCase.kind,
        viewport: viewport.name,
        httpStatus: observed,
        messages,
        showedGeneric,
        screenshot: file,
      })
      console.log(
        `${showedGeneric ? 'FAIL' : 'ok  '} ${viewport.name.padEnd(4)} ${testCase.kind.padEnd(7)} ${testCase.id}` +
          (observed ? ` [HTTP ${observed}]` : ' [no request]'),
      )
      for (const m of messages) console.log(`        "${m}"`)

      await context.close()
    }
  }

  await browser.close()

  const generic = results.filter((r) => r.showedGeneric)
  const empty = results.filter((r) => r.messages.length === 0)
  // A live case that got 429 proves the rate limiter, not the case it was aimed
  // at. Called out rather than counted as a pass for the intended failure.
  const displaced = results.filter((r) => r.kind === 'live' && r.httpStatus === 429 && r.case !== '06-rate-limited')

  const stamp = `walk-${ONLY_VIEWPORT ?? 'both'}-${MODE.replace('--', '')}.json`
  await writeFile(path.join(OUT, stamp), JSON.stringify({ base: BASE, results }, null, 2))

  console.log(`\n${results.length} captures written to ${OUT}`)
  console.log(`showed the generic sentence: ${generic.length}`)
  console.log(`showed no message at all:    ${empty.length}`)
  if (displaced.length) {
    console.log(`\nRATE LIMITED, so these did NOT reach their intended failure:`)
    for (const r of displaced) console.log(`  ${r.viewport} ${r.case}`)
    console.log('Wait out the window and re-run this viewport.')
  }
  if (generic.length || empty.length || displaced.length) {
    for (const r of [...generic, ...empty]) console.log(`  PROBLEM ${r.viewport} ${r.case}`)
    process.exit(1)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
