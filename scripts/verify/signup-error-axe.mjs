/**
 * axe-core over the signup form IN ITS ERROR STATES, at 1440 and 390.
 *
 * The clean form was already in the audit set. The error states were not, and
 * they are where the new markup lives: aria-invalid on the failing input,
 * aria-describedby pointing at its message, role="alert" so the message is
 * announced, and the red border that must still clear contrast.
 *
 * Uses the stubbed responses so it costs no rate-limit budget and covers both a
 * field-anchored failure and a form-level one.
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.argv[2] ?? process.env.BASE_URL
if (!BASE) {
  console.error('usage: node scripts/verify/signup-error-axe.mjs <base-url>')
  process.exit(1)
}

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

const STATES = [
  {
    name: 'email_exists (field-anchored, with recovery links)',
    status: 409,
    body: {
      ok: false,
      failure: 'email_exists',
      error:
        'That email address already has an EventLinqs account. Sign in instead, or reset your password if you have forgotten it.',
      field: 'email',
    },
  },
  {
    name: 'service_unavailable (form-level alert)',
    status: 503,
    body: {
      ok: false,
      failure: 'service_unavailable',
      error:
        'We could not reach our account service just now. This is a problem on our side, not with your details. Please try again in a moment.',
      field: null,
    },
  },
]

const browser = await chromium.launch()
let failed = false

for (const vp of VIEWPORTS) {
  for (const state of STATES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    await page.route('**/api/auth/signup', (route) =>
      route.fulfill({ status: state.status, contentType: 'application/json', body: JSON.stringify(state.body) }),
    )
    await page.goto(`${BASE}/signup?role=organiser`, { waitUntil: 'networkidle', timeout: 60_000 })
    // Same controlled-checkbox hydration gate as the walk script.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#digestOptIn')
        if (!el) return false
        el.click()
        const took = el.checked === true
        if (took) el.click()
        return took
      },
      { timeout: 15_000, polling: 250 },
    )
    await page.fill('#fullName', 'Lawal Adams')
    await page.fill('#email', 'organiser@example.com')
    await page.fill('#password', 'ValidPassword123')
    await page.click('button[type="submit"]')
    await page.waitForSelector('[role="alert"]', { timeout: 15_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

    console.log(
      `${serious.length === 0 ? 'ok  ' : 'FAIL'} ${vp.name.padEnd(4)} ${state.name} ` +
        `(${results.violations.length} violations, ${serious.length} serious/critical)`,
    )
    for (const v of results.violations) {
      console.log(`      ${v.impact}: ${v.id} - ${v.help} (${v.nodes.length} node(s))`)
      if (v.impact === 'serious' || v.impact === 'critical') failed = true
    }
    await ctx.close()
  }
}

await browser.close()
process.exit(failed ? 1 : 0)
