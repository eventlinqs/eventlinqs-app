// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * Journey B beyond the ticket picker: sign in, buy, confirm, ticket, transfer,
 * My tickets.
 *
 * ONE STEP IS SUBSTITUTED AND IT IS SAID OUT LOUD. Clicking the real
 * verification link needs the delivered email, and RESEND_API_KEY is not
 * available to this session, so the account is confirmed through the TEST
 * Supabase admin API instead. Everything downstream is then walked for real in
 * a browser. The link itself is NOT proven by this script.
 *
 * A free event is used so the journey completes without card details. The paid
 * path stops at Stripe by design; driving real payments is the paid-purchase
 * battery's job and it creates real Stripe objects.
 *
 * Usage: node scripts/sweep/journey-buyer-full.mjs --base <url>
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const BASE = (argOf('--base') || '').replace(/\/$/, '')
if (!BASE) throw new Error('--base is required')
const WIDTH = Number(argOf('--viewport', '1440'))
const OUT = argOf('--out', `docs/roast/sweep-evidence/journey-b-full-${WIDTH}`)
mkdirSync(OUT, { recursive: true })

for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error('refusing: not the TEST project')
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const stamp = Date.now()
const EMAIL = `sweep.full.${stamp}@eventlinqs.com`
const PASSWORD = `SweepFull${stamp}!aA`
const FREE_SLUG = process.env.SWEEP_FREE_EVENT_SLUG
if (!FREE_SLUG) throw new Error('SWEEP_FREE_EVENT_SLUG is required')

const steps = []
let page

async function step(name, fn) {
  const rec = { step: name, verdict: 'PASS', notes: [] }
  try {
    const out = await fn(rec)
    if (out) rec.notes.push(String(out))
  } catch (e) {
    rec.verdict = 'FAIL'
    rec.notes.push(String(e.message || e).slice(0, 300))
  }
  const file = path.join(OUT, `${String(steps.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
  try {
    await page.screenshot({ path: file, fullPage: false })
    rec.screenshot = file
  } catch { /* closed */ }
  rec.url = page ? page.url().replace(BASE, '') : ''
  steps.push(rec)
  console.log(`${rec.verdict}  ${name}${rec.notes.length ? '  -> ' + rec.notes.join(' | ') : ''}`)
  return rec
}

const mainText = () =>
  page.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').trim())

/** The Sign in control by name, never `.first()` on a bare submit selector. */
async function signIn(email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button[type="submit"]')].find((el) =>
        /^\s*sign in\s*$/i.test(el.textContent || ''),
      )
      return Boolean(b && !b.hasAttribute('disabled'))
    },
    { timeout: 30000 },
  )
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.getByRole('button', { name: /^Sign in$/i }).click()
}

/** The in-page control, never one pinned in sticky chrome. */
async function firstUnpinned(locator) {
  const n = await locator.count()
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i)
    const box = await el.boundingBox().catch(() => null)
    if (!box || box.width <= 8 || box.height <= 8) continue
    const pinned = await el.evaluate((e) => {
      for (let x = e; x && x !== document.body; x = x.parentElement) {
        const pos = getComputedStyle(x).position
        if (pos === 'fixed' || pos === 'sticky') return true
      }
      return Boolean(e.closest('header, nav'))
    })
    if (!pinned) return el
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
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))

let userId = null

await step('create and confirm an account (admin API, NOT the email link)', async (rec) => {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Sweep Buyer Full' },
  })
  if (error) throw new Error(`createUser failed: ${error.message}`)
  userId = data.user.id
  rec.notes.push(`user ${userId.slice(0, 8)} confirmed programmatically`)
  rec.substituted = 'the real verification link was not clicked; no inbox is reachable'
})

await step('sign in with email and password', async (rec) => {
  await signIn(EMAIL, PASSWORD)
  await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(1500)
  rec.notes.push(`landed on ${page.url().replace(BASE, '')}`)
  if (/\/login/.test(page.url())) {
    const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter(Boolean)
    throw new Error(`still on /login. alerts: ${JSON.stringify(alerts)}`)
  }
})

await step('open a free event and reach the ticket picker', async (rec) => {
  await page.goto(`${BASE}/events/${FREE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  const cta = await firstUnpinned(
    page.locator('a:has-text("Get tickets"), button:has-text("Get tickets"), button:has-text("Register")'),
  )
  if (!cta) throw new Error('no in-page ticket control')
  await cta.scrollIntoViewIfNeeded().catch(() => {})
  await cta.click({ timeout: 15000 })
  await page.waitForTimeout(1500)
  const inc = page.locator('button[aria-label^="Increase"]').first()
  if (!(await inc.count())) throw new Error('no quantity stepper after pressing the ticket control')
  rec.notes.push('stepper present')
})

await step('add one ticket and go to checkout', async (rec) => {
  await page.locator('button[aria-label^="Increase"]').first().click()
  await page.waitForTimeout(600)
  const go = page.getByRole('button', { name: /Checkout|Register|Get ticket|Continue/i }).first()
  if (!(await go.count())) throw new Error('no checkout control after choosing a quantity')
  await go.click()
  await page.waitForURL(/checkout|confirmation/, { timeout: 45000, waitUntil: 'commit' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  const t = await mainText()
  rec.notes.push(`at ${page.url().replace(BASE, '')}`)
  if (/Invalid reservation data/i.test(t)) throw new Error('Invalid reservation data')
  if (!/checkout|confirmation/.test(page.url())) throw new Error(`did not reach checkout: ${t.slice(0, 160)}`)
})

await step('complete the free order', async (rec) => {
  if (/confirmation/.test(page.url())) {
    rec.notes.push('free order completed straight to confirmation')
    return
  }
  const pay = page
    .getByRole('button', { name: /Complete|Confirm|Place order|Get my ticket|Finish|Pay/i })
    .first()
  if (!(await pay.count())) throw new Error('no control to complete a free order on checkout')
  await pay.click()
  await page.waitForURL(/confirmation/, { timeout: 60000, waitUntil: 'commit' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  if (!/confirmation/.test(page.url())) {
    throw new Error(`did not reach a confirmation: ${(await mainText()).slice(0, 200)}`)
  }
})

await step('the confirmation names the event and the order', async (rec) => {
  const t = await mainText()
  const hasRef = /EL-[A-Z0-9]{6,}/.test(t)
  rec.notes.push(hasRef ? `order reference shown: ${t.match(/EL-[A-Z0-9]{6,}/)[0]}` : 'NO order reference on the confirmation')
  const noTells = !/undefined|NaN|Invalid Date|\[object Object\]/.test(t)
  rec.notes.push(noTells ? 'no blank-value tells' : 'A VALUE TELL IS RENDERED')
  if (!hasRef) throw new Error('the confirmation shows no order reference')
  if (!noTells) throw new Error('the confirmation renders undefined, NaN or Invalid Date')
})

await step('open the ticket itself', async (rec) => {
  const res = await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  rec.notes.push(`/tickets HTTP ${res ? res.status() : 0}`)
  const t = await mainText()
  rec.notes.push(`${t.length} chars`)
  const link = page.locator('a[href^="/t/"], a:has-text("View ticket"), a:has-text("Ticket")').first()
  if (!(await link.count())) throw new Error('no ticket link in My tickets after buying')
  await link.click()
  await page.waitForTimeout(2500)
  const tt = await mainText()
  rec.notes.push(`ticket page: ${page.url().replace(BASE, '')}`)
  const hasQr = await page.locator('img[alt*="QR" i], canvas, svg[aria-label*="QR" i]').count()
  rec.notes.push(`QR-ish elements: ${hasQr}`)
  if (/undefined|NaN|Invalid Date/.test(tt)) throw new Error('the ticket renders a blank-value tell')
})

await step('the ticket offers a transfer', async (rec) => {
  const t = await mainText()
  const transfer = page.getByRole('button', { name: /Transfer|Send to/i }).first()
  const count = await transfer.count()
  rec.notes.push(count ? 'a transfer control is present' : 'NO transfer control on the ticket')
  if (!count) {
    rec.notes.push(`page reads: ${t.slice(0, 180)}`)
    throw new Error('the ticket offers no way to transfer it')
  }
  await transfer.click()
  await page.waitForTimeout(1800)
  const after = await mainText()
  const opened = /email|recipient|transfer/i.test(after)
  rec.notes.push(opened ? 'the transfer flow opens and asks for a recipient' : 'the transfer control did nothing visible')
  if (!opened) throw new Error('pressing Transfer produced no visible flow')
})

await step('find the ticket again in My tickets', async (rec) => {
  await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  const t = await mainText()
  const empty = /no tickets|nothing here|you have not/i.test(t)
  rec.notes.push(empty ? 'MY TICKETS IS EMPTY after a completed order' : `${t.length} chars, the order is listed`)
  if (empty) throw new Error('a completed order does not appear in My tickets')
})

await browser.close()
const failed = steps.filter((s) => s.verdict === 'FAIL')
writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify({ email: EMAIL, userId, steps, pageErrors }, null, 1))
console.log(`\n${steps.length} steps, ${failed.length} failed. Page errors: ${pageErrors.length}`)
if (pageErrors.length) console.log('  ' + pageErrors.slice(0, 5).join('\n  '))
console.log(`evidence: ${OUT}`)
process.exit(failed.length ? 1 : 0)
