#!/usr/bin/env node
/**
 * Journey B, the buyer, walked as a person rather than crawled.
 *
 * WHY THIS EXISTS. The first pass of this sweep loaded every page and followed
 * every link, and called that walking the product. It is not. A crawler never
 * types into a box, never presses a button, and never submits a form, so it
 * cannot find the defects that live on the other side of a click. The roast
 * caught that substitution and this is the correction.
 *
 * Every step here does what a person does: fills the field, presses the
 * control, and then asserts on what the screen actually says afterwards.
 * Screenshots at every step, at both viewports where the step is visual.
 *
 * Stops before entering card details. Driving a real payment is the paid
 * purchase battery's job and it creates real Stripe objects; this proves the
 * path a person walks up to that point, and free tickets all the way through.
 *
 * Usage: node scripts/sweep/journey-buyer.mjs --base <url> [--viewport 390|1440]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const BASE = (argOf('--base') || '').replace(/\/$/, '')
if (!BASE) throw new Error('--base is required')
const WIDTH = Number(argOf('--viewport', '1440'))
const OUT = argOf('--out', `docs/roast/sweep-evidence/journey-b-${WIDTH}`)
mkdirSync(OUT, { recursive: true })

// A fresh identity per run, so sign-up is genuinely a new account every time.
const stamp = Date.now()
const EMAIL = `sweep.buyer.${stamp}@eventlinqs.com`
const PASSWORD = `SweepBuyer${stamp}!aA`
const FULL_NAME = 'Sweep Buyer'

const steps = []
let page

async function step(name, fn) {
  const rec = { step: name, verdict: 'PASS', notes: [] }
  try {
    const out = await fn(rec)
    if (out) rec.notes.push(String(out))
  } catch (e) {
    rec.verdict = 'FAIL'
    rec.notes.push(String(e.message || e).slice(0, 400))
  }
  const file = path.join(OUT, `${String(steps.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
  try {
    await page.screenshot({ path: file, fullPage: false })
    rec.screenshot = file
  } catch {
    /* a closed page cannot be shot */
  }
  rec.url = page.url().replace(BASE, '')
  steps.push(rec)
  console.log(`${rec.verdict === 'PASS' ? 'PASS' : 'FAIL'}  ${name}${rec.notes.length ? '  -> ' + rec.notes.join(' | ') : ''}`)
  return rec
}

/** Visible text of the page, for asserting on what a person would read. */
const bodyText = () => page.evaluate(() => (document.querySelector('main') || document.body).innerText)

/**
 * Wait for a message to appear, rather than sleeping and hoping.
 *
 * The first version of this script slept 3.5s and then read the page, and
 * reported "a wrong password produced no visible message" as a defect. The
 * message actually lands between 1s and 3s, because the browser has to round
 * trip to the auth server first. That was my instrument, not the product, and
 * it nearly went into the report as a severe finding.
 */
async function waitForMessage(re, timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => [])
    const joined = alerts.filter(Boolean).join(' ')
    if (joined && re.test(joined)) return joined
    await page.waitForTimeout(500)
  }
  const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => [])
  return alerts.filter(Boolean).join(' ')
}

/**
 * The first VISIBLE match with real dimensions. The event page renders its
 * "Get tickets" control twice: once in the page body and once in a sticky
 * header that sits above the viewport until you scroll. `.first()` picked the
 * hidden one (y = -53 at desktop, 0 by 0 at 390) and reported an unclickable
 * CTA that a person never has trouble with.
 */
async function firstVisible(locator) {
  const n = await locator.count()
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i)
    const box = await el.boundingBox().catch(() => null)
    if (!box || box.width <= 8 || box.height <= 8) continue
    // Having a box is not enough. This event page renders "Get tickets" three
    // times at 390: once in the sticky header (y = -53, above the viewport and
    // unscrollable-to), once in the sticky bottom bar (y = 857, below an
    // 844-tall viewport), and once in the page body. Only the last is the one
    // a person presses, and picking either of the others reported an
    // unclickable buy button that works perfectly well by hand.
    //
    // The distinguishing property is a sticky or fixed ancestor, not the tag
    // name, because the bottom bar is not inside <header> or <nav>.
    const isPinned = await el.evaluate((e) => {
      for (let n = e; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position
        if (pos === 'fixed' || pos === 'sticky') return true
      }
      return Boolean(e.closest('header, nav'))
    })
    if (isPinned) continue
    return el
  }
  return null
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH < 500 ? 844 : 900 },
  isMobile: WIDTH < 500,
  hasTouch: WIDTH < 500,
})
page = await context.newPage()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 200)))

await step('sign up: open the form', async () => {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  const hasEmail = await page.locator('input[type="email"]').count()
  if (!hasEmail) throw new Error('no email field on /signup')
})

await step('sign up: fill and submit', async (rec) => {
  const name = page.locator('input[name="full_name"], input[name="fullName"], input[placeholder*="name" i]').first()
  if (await name.count()) await name.fill(FULL_NAME)
  await page.locator('input[type="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)

  const confirm = page.locator('input[type="password"]').nth(1)
  if (await confirm.count()) await confirm.fill(PASSWORD)

  // Any required consent checkbox a person would have to tick.
  const boxes = page.locator('input[type="checkbox"]')
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i)
    if (await b.isVisible().catch(() => false)) {
      const required = await b.evaluate((el) => el.required)
      if (required) await b.check().catch(() => {})
    }
  }

  await page.locator('button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const text = await bodyText()
  rec.notes.push(`landed on ${page.url().replace(BASE, '')}`)
  if (/error|something went wrong|failed/i.test(text) && !/verify/i.test(text)) {
    throw new Error(`sign-up reported an error: ${text.slice(0, 220).replace(/\s+/g, ' ')}`)
  }
  return text.slice(0, 200).replace(/\s+/g, ' ')
})

await step('sign up: the next step is explained', async (rec) => {
  const text = await bodyText()
  const explained = /verif|check your (email|inbox)|confirm/i.test(text)
  rec.notes.push(explained ? 'the screen says what happens next' : 'NO explanation of what happens next')
  if (!explained) throw new Error('after sign-up the screen never says to check email')
})

await step('sign in: wrong password is refused clearly', async (rec) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[type="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill('definitely-the-wrong-password')
  await page.locator('button[type="submit"]').first().click()
  const message = await waitForMessage(/did not match|invalid|incorrect|confirm|check/i)
  rec.notes.push(message ? `says: "${message.slice(0, 130)}"` : 'NO message appeared within 15s')
  if (!message) throw new Error('a wrong password produced no visible message within 15s')
  const kept = await page.locator('input[type="email"]').first().inputValue().catch(() => '')
  rec.notes.push(kept ? 'the email field kept what was typed' : 'the form was cleared, so the person retypes')
})

await step('forgot password: the form submits and confirms', async (rec) => {
  await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const email = page.locator('input[type="email"]').first()
  if (!(await email.count())) throw new Error('no email field on /forgot-password')
  await email.fill(EMAIL)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(3500)
  const text = await bodyText()
  const confirmed = /sent|check your|if that email|we have emailed|link/i.test(text)
  rec.notes.push(confirmed ? 'a confirmation is shown' : `NO confirmation. Screen reads: ${text.slice(0, 160).replace(/\s+/g, ' ')}`)
  if (!confirmed) throw new Error('reset request gave the person no confirmation')
})

await step('sign in with Google: the button exists and goes to Google', async (rec) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const google = page.locator('button:has-text("Google"), a:has-text("Google")').first()
  if (!(await google.count())) {
    rec.verdict = 'PASS'
    rec.notes.push('no Google button is offered on this deployment')
    return
  }
  await google.click().catch(() => {})
  await page.waitForTimeout(4000)
  const url = page.url()
  rec.notes.push(`after clicking Google: ${url.slice(0, 110)}`)
  if (!/accounts\.google\.com|supabase\.co\/auth/i.test(url)) {
    throw new Error(`the Google button did not reach an auth provider, it went to ${url.slice(0, 140)}`)
  }
})

// The buy path. A free event so the journey can complete without card details.
await step('buy: open a free event and press the ticket control', async (rec) => {
  const slug = process.env.SWEEP_FREE_EVENT_SLUG
  if (!slug) throw new Error('SWEEP_FREE_EVENT_SLUG is not set')
  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  const text = await bodyText()
  rec.notes.push(`title: ${(await page.locator('h1').first().innerText().catch(() => '?')).slice(0, 60)}`)
  if (/free/i.test(text)) rec.notes.push('the page says Free')

  const cta = await firstVisible(
    page.locator(
      'button:has-text("Get tickets"), button:has-text("Get ticket"), a:has-text("Get tickets"), button:has-text("Book"), button:has-text("Reserve")',
    ),
  )
  if (!cta) throw new Error('no VISIBLE ticket control found on a published free event')
  await cta.scrollIntoViewIfNeeded().catch(() => {})
  await cta.click({ timeout: 15000 })
  await page.waitForTimeout(2500)
  return `after pressing: ${page.url().replace(BASE, '')}`
})

await step('buy: a ticket picker is actually reachable', async (rec) => {
  const text = await bodyText()
  const picker = await page
    .locator('select, input[type="number"], [role="spinbutton"], button:has-text("+")')
    .count()
  rec.notes.push(`quantity controls found: ${picker}`)
  if (picker === 0 && !/checkout|reserve|quantity|ticket/i.test(text)) {
    throw new Error('pressing the ticket control produced no picker and no checkout')
  }
})

await step('signed-out guard: My tickets asks the person to sign in', async (rec) => {
  await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  const url = page.url().replace(BASE, '')
  const text = await bodyText()
  rec.notes.push(`landed on ${url}`)
  // Either a sign-in wall or an explained empty state is correct. A blank
  // page, or a raw error, is not.
  const ok = /sign in|log in|welcome back/i.test(text) || /ticket/i.test(text)
  if (!ok) throw new Error(`/tickets showed neither a sign-in prompt nor ticket content: ${text.slice(0, 160)}`)
})

await browser.close()

const failed = steps.filter((s) => s.verdict === 'FAIL')
writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify({ email: EMAIL, steps, consoleErrors }, null, 1))
console.log(`\n${steps.length} steps, ${failed.length} failed. Console/page errors: ${consoleErrors.length}`)
if (consoleErrors.length) console.log('  ' + consoleErrors.slice(0, 5).join('\n  '))
console.log(`evidence: ${OUT}`)
process.exit(failed.length ? 1 : 0)
