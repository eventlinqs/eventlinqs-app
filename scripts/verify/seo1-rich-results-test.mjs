/**
 * SEO1 ACCEPTANCE 5, THE ONE MANUAL STEP, DRIVEN SO IT CAN BE REPEATED.
 *
 * READ THIS FIRST, BECAUSE IT DECIDES WHICH COMMAND YOU WANT.
 *
 * On 14 September 2026 the Rich Results Test began REFUSING AN ANONYMOUS
 * REQUEST. Both tabs, URL and CODE, answer "Something went wrong. Log in and
 * try again" with no result panel at all. Captured at
 * C:\dev\EVIDENCE\SEO1ich-results-test-failure.png and rrt-url-tab.png, so
 * the refusal is evidence rather than a claim. The schema.org validator has no
 * such requirement and is run from scripts/verify/seo1-schema-validator.mjs.
 *
 * A Google sign-in is a credential this build does not hold and must not invent,
 * so the step is the founder's by necessity rather than by choice (Law 10: name
 * it IMPOSSIBLE for a machine, and script everything around it).
 *
 *   ONE COMMAND, ONCE:   npm run seo1:rich-results
 *
 * That opens the founder's real Chrome against a DEDICATED profile directory
 * (never his own), waits while he signs in to Google, runs the test, reads the
 * verdict and saves the evidence. Every later run reuses the profile and needs
 * no sign-in at all. Unattended, it runs headless and reports the refusal
 * honestly rather than hanging.
 *
 *   "The rendered markup for one real published event is validated against
 *    Google's own Rich Results Test and the Schema.org validator by hand, and the
 *    pass result is recorded in BUILD-LOG-C.md with the date. If either reports
 *    an error or a warning, it is fixed before the item closes."
 *
 * The schema.org half is a POST to validator.schema.org and needs no browser.
 * This is the Google half. The Rich Results Test publishes no API, so it is
 * driven: the CODE tab is given the exact script tags lifted out of the rendered
 * page on lane C's own port, and the verdict is read off the result panel.
 *
 * WHY THE CODE TAB RATHER THAN THE URL TAB. The URL tab asks Google to fetch the
 * page, and the page under test is on localhost:3200. Pointing it at production
 * would test the code that is already deployed, which is the code this item
 * exists to correct. The script tags pasted here are byte identical to the ones
 * the server emitted; the surrounding document is a minimal wrapper because RRT
 * parses the structured data, not the design.
 *
 * Run: node scripts/verify/seo1-rich-results-test.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const OUT = process.env.SEO1_OUT ?? 'C:/dev/EVIDENCE/SEO1'
const PAGE = join(OUT, 'rendered-event-page.html')
const RRT = 'https://search.google.com/test/rich-results'
/** Dedicated, never the founder's own Chrome profile. */
const PROFILE = process.env.SEO1_RRT_PROFILE ?? 'C:/dev/EVIDENCE/SEO1/.rrt-chrome-profile'
const SIGNED_IN = process.argv.includes('--signed-in')

if (!existsSync(PAGE)) {
  console.error(`FAIL: ${PAGE} does not exist. Fetch the rendered event page first.`)
  process.exit(2)
}

const html = readFileSync(PAGE, 'utf8')
const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g)].map(m => m[0])
if (blocks.length === 0) {
  console.error('FAIL: the rendered page carries no JSON-LD block at all.')
  process.exit(1)
}

const snippet = [
  '<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8">',
  '<title>EventLinqs structured data under test</title>',
  ...blocks,
  '</head><body><h1>EventLinqs structured data under test</h1></body></html>',
].join('\n')
writeFileSync(join(OUT, 'rich-results-input.html'), snippet)
console.log(`[rrt] ${blocks.length} block(s) lifted, ${snippet.length} bytes to test`)

/*
 * HEADLESS BY DEFAULT, REAL CHROME WHEN A HUMAN IS THERE TO SIGN IN. The bundled
 * Chromium cannot hold a Google session; the installed Chrome channel can, and a
 * persistent profile means the sign-in happens once rather than every run.
 */
const browser = SIGNED_IN
  ? await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1440, height: 1000 },
      locale: 'en-AU',
    })
  : await chromium.launch()
const context = SIGNED_IN ? browser : await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = SIGNED_IN ? (context.pages()[0] ?? await context.newPage()) : await context.newPage()
let failed = false

try {
  await page.goto(RRT, { waitUntil: 'domcontentloaded', timeout: 120000 })

  if (SIGNED_IN) {
    // The profile persists, so this waits only on the FIRST run.
    const signIn = page.getByRole('link', { name: /sign in/i })
    if (await signIn.count()) {
      console.log('[rrt] sign in to Google in the window that opened. Waiting up to 5 minutes.')
      await page.waitForFunction(
        () => !document.body.innerText.match(/^\s*Sign in\s*$/m),
        { timeout: 300000 },
      ).catch(() => console.log('[rrt] still signed out after 5 minutes; continuing anyway'))
    }
  }

  // Consent interstitials appear in some regions; dismiss whichever is shown.
  for (const label of ['Accept all', 'I agree', 'Reject all']) {
    const btn = page.getByRole('button', { name: label })
    if (await btn.count()) {
      await btn.first().click().catch(() => {})
      break
    }
  }

  /*
   * The CODE tab, then the VISIBLE textarea. The page keeps five textareas in
   * the DOM and four of them are hidden, so `locator('textarea').first()`
   * resolves to a hidden one and waits for a visibility that never arrives. The
   * first run of this script spent sixty seconds proving exactly that.
   */
  const codeTab = page.locator('[role=tab]', { hasText: 'CODE' })
  await codeTab.waitFor({ timeout: 60000 })
  await codeTab.click()
  await page.waitForTimeout(1500)

  const box = page.locator('textarea:visible').first()
  await box.waitFor({ timeout: 60000 })
  await box.fill(snippet)

  /*
   * The control is not a <button> element, so it is found by its text, and there
   * are TWO of them: one belonging to the URL tab and one to the CODE tab, only
   * one of which is ever visible. Clicking `.last()` clicked the hidden one.
   */
  const controls = page.locator('text=/TEST CODE/i')
  let clicked = false
  for (let i = 0; i < await controls.count(); i += 1) {
    const control = controls.nth(i)
    if (await control.isVisible()) {
      await control.click()
      clicked = true
      break
    }
  }
  if (!clicked) throw new Error('no visible TEST CODE control on the page')

  /*
   * Either a verdict or Google's own refusal. Waiting only for the verdict is how
   * the first run of this script spent three minutes on a dialog that had already
   * said what was wrong.
   */
  await page.waitForSelector(
    'text=/valid items detected|No items detected|items detected|Something went wrong/i',
    { timeout: 180000 },
  )
  await page.waitForTimeout(2500)

  await page.screenshot({ path: join(OUT, 'rich-results-test.png'), fullPage: true })
  const text = await page.locator('body').innerText()
  writeFileSync(join(OUT, 'rich-results-test.txt'), text)

  const detected = /(\d+)\s+valid items? detected/i.exec(text)
  const invalid = /(\d+)\s+invalid items?/i.exec(text)
  const issueWords = /\b(error|warning)s?\b/i.test(text)

  console.log(`[rrt] verdict text captured, ${text.length} chars`)
  console.log(`[rrt] valid items detected: ${detected ? detected[1] : 'not stated'}`)
  console.log(`[rrt] invalid items: ${invalid ? invalid[1] : 'none stated'}`)
  console.log(`[rrt] the words error or warning appear anywhere on the panel: ${issueWords}`)

  if (/Something went wrong/i.test(text) && /Log in/i.test(text)) {
    console.error(
      '[rrt] BLOCKED: the Rich Results Test refused an anonymous request ' +
        '("Something went wrong. Log in and try again"). This is a Google sign-in ' +
        'the build does not hold. Re-run as: npm run seo1:rich-results',
    )
    failed = true
  } else if (!detected) {
    console.error('[rrt] FAIL: the panel did not state a count of valid items.')
    failed = true
  }
  if (invalid && Number(invalid[1]) > 0) {
    console.error(`[rrt] FAIL: ${invalid[1]} invalid item(s).`)
    failed = true
  }
} catch (error) {
  console.error(`[rrt] FAIL: could not complete the test: ${error.message}`)
  await page.screenshot({ path: join(OUT, 'rich-results-test-failure.png'), fullPage: true }).catch(() => {})
  failed = true
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
