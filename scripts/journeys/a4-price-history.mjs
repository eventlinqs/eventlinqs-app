/**
 * A4, SCOPE v5 3.3: THE PRICE HISTORY ON THE EVENT PAGE.
 *
 * One organiser, two buyers and a stranger, through the real screens on a local
 * production server against TEST, at the viewport JOURNEY_VIEWPORT names
 * (desktop-1440, tablet-768, mobile-390).
 *
 *   1. THE ORGANISER is the single-organisation, Stripe-connected owner already
 *      on TEST (Test Org: charges and payouts enabled, country AU). No password
 *      is known, so the run takes the REAL forgot-password path: the form, the
 *      email read out of the console transport, the reset page, a new password,
 *      then sign in. A real person does every step with a mouse and a keyboard.
 *   2. Creates a PAID event through the wizard: one tier at AUD 30.00, capacity
 *      4, a composed cover, published. The public page carries the price
 *      history block with one entry: listed at 30.00.
 *   3. Edits the event, tier price to 28.00, Save Changes. The page shows the
 *      move (lowered to 28.00) and the note under the price (down from 30.00).
 *   4. Opens the event overview, clicks the Pricing tab (the way in that did not
 *      exist before 4 September 2026), turns dynamic pricing on with two steps
 *      (up to 25 percent at 28.00, up to 100 percent at 40.00), saves. No new
 *      entry: the effective price is unchanged, and the page still shows two.
 *   5. BUYER A buys one ticket with the test card and pays 28.00 (25 percent
 *      sold is still the first step).
 *   6. BUYER B buys one ticket: the reservation takes the tier to 50 percent,
 *      checkout shows 40.00, the order item is 4000 cents.
 *   7. A STRANGER opens the page: current price 40.00, "Up from AUD 28.00"
 *      under it, and three entries: listed, lowered, rose at 50 percent sold.
 *      The rows on TEST read listed, changed, step.
 *
 * Usage: powershell -File C:\dev\run-journey.ps1 -Script scripts\journeys\a4-price-history.mjs
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  messagesOnScreen,
  fillIf,
  clickText,
  linkFromInbox,
  signIn,
  createEventThroughWizard,
} from './harness.mjs'

const j = makeJourney('a4-price-history', 'A4: the price history on the event page')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const VIEWPORTS = {
  'mobile-390': { width: 390, height: 844 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1440': { width: 1440, height: 1000 },
}
const viewport = VIEWPORTS[viewportLabel] ?? VIEWPORTS['desktop-1440']
const ORGANISER_EMAIL = process.env.A4_ORGANISER_EMAIL ?? 'owner_1781981785246@example.com'
const NEW_PASSWORD = `Str0ng-${stamp}-Price!`
const TITLE = `Price Steps ${stamp}`
const BUYER_A = `buyer.a.${stamp}@example.com`
const BUYER_B = `buyer.b.${stamp}@example.com`

const browser = await chromium.launch()
const results = []
function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  note(j, `${ok ? 'PASS' : 'FAIL'}  ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail ?? ''}`)
}

const run = { viewport: viewportLabel, base: BASE, organiserEmail: ORGANISER_EMAIL }

async function keepSession(ctx, name) {
  if (!process.env.EVIDENCE_DIR) return
  const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
  mkdirSync(dest, { recursive: true })
  await ctx.storageState({ path: join(dest, `session-${name}.json`) })
}

const db = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) return null
  if (/gndnldyfudbytbboxesk/.test(url)) throw new Error('refusing to run a journey against production')
  return createClient(url, service, { auth: { persistSession: false } })
})()

async function textOnPage(p) {
  return (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

/** Click a visible button or link whose text matches. */
async function clickAny(p, rx) {
  for (const el of await p.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

/** Click Continue until the selector is on screen, or give up. */
async function advanceTo(p, selector, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    if (await p.$(selector)) return true
    if (!(await clickText(p, 'Continue'))) break
    await p.waitForTimeout(2500)
  }
  return Boolean(await p.$(selector))
}

/** What the page says about the price history: the block, its sentences, its note. */
async function readHistory(p) {
  return p.evaluate(() => {
    const block = document.querySelector('[data-testid="price-history"]')
    const entries = block ? [...block.querySelectorAll('li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) : []
    const summary = block ? (block.querySelector('h2 + p, p')?.textContent ?? '').trim() : ''
    const note = document.querySelector('[data-testid="price-history-note"]')?.textContent?.trim() ?? null
    const main = (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ')
    const prices = [...new Set(main.match(/AUD \d+\.\d{2}/g) ?? [])]
    return { present: Boolean(block), entries, summary, note, prices }
  })
}

async function rowsFor(eventId) {
  if (!db || !eventId) return []
  const { data } = await db
    .from('ticket_price_history')
    .select('tier_name, price_cents, previous_price_cents, reason, percent_sold, recorded_at')
    .eq('event_id', eventId)
    .order('recorded_at', { ascending: true })
  return data ?? []
}

async function waitForConfirmed(orderId, ms = 90000) {
  if (!db || !orderId) return null
  const started = Date.now()
  while (Date.now() - started < ms) {
    const { data: order } = await db.from('orders').select('status').eq('id', orderId).maybeSingle()
    if (order?.status === 'confirmed') {
      const { data: items } = await db.from('order_items').select('unit_price_cents, item_type').eq('order_id', orderId)
      return { status: order.status, unit: items?.find((i) => i.item_type === 'ticket')?.unit_price_cents ?? null }
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  const { data: order } = await db.from('orders').select('status').eq('id', orderId).maybeSingle()
  return { status: order?.status ?? 'missing', unit: null }
}

/**
 * Buy one ticket as a guest, the way journey 3 does, with the screens captured
 * and the checkout's own words kept so the drive can say what the buyer was
 * told before paying.
 */
async function buyOne(p, slug, email, label) {
  const byLabel = async (rx, value) => {
    for (const el of await p.$$('input')) {
      if (!(await el.isVisible().catch(() => false))) continue
      const n = await el.evaluate(
        (e) => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
      )
      if (rx.test(n)) {
        await el.fill(value).catch(() => {})
        return true
      }
    }
    return false
  }
  await p.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(3000)
  await describe(j, p, `${label}: the event page before buying`)
  if (!(await clickAny(p, /^(get tickets|buy tickets|select tickets)/i))) {
    j.blockers.push(`${label}: no way to start buying on /events/${slug}`)
    return null
  }
  await p.waitForTimeout(2500)
  const plus = await p.$('button[aria-label*="ncrease" i]')
  if (plus) await plus.click().catch(() => {})
  else {
    for (const b of await p.$$('button')) {
      const t = ((await b.innerText().catch(() => '')) || '').trim()
      if (t === '+') {
        await b.click().catch(() => {})
        break
      }
    }
  }
  await p.waitForTimeout(2500)
  const selection = await textOnPage(p)
  if (!(await clickAny(p, /^checkout\b/i))) {
    j.blockers.push(`${label}: ticket selection offers no way to continue to checkout`)
    return null
  }
  await p.waitForTimeout(6000)
  const checkoutText = await textOnPage(p)
  await describe(j, p, `${label}: checkout`)
  await byLabel(/full name/i, label)
  await byLabel(/^email/i, email)
  await p.waitForTimeout(800)
  await clickAny(p, /use my details for all tickets/i)
  await p.waitForTimeout(1200)
  await clickAny(p, /^continue to payment/i)
  let carded = false
  const deadline = Date.now() + 60000
  while (Date.now() < deadline && !carded) {
    for (const frame of p.frames()) {
      const num = frame.locator('input[name="number"], input[autocomplete="cc-number"]').first()
      if (await num.count().catch(() => 0)) {
        await num.fill('4242424242424242').catch(() => {})
        await frame.locator('input[name="expiry"], input[autocomplete="cc-exp"]').first().fill('12 / 34').catch(() => {})
        await frame.locator('input[name="cvc"], input[autocomplete="cc-csc"]').first().fill('123').catch(() => {})
        await frame.locator('input[name="postalCode"], input[autocomplete="postal-code"]').first().fill('3000').catch(() => {})
        carded = true
        break
      }
    }
    if (!carded) await p.waitForTimeout(2000)
  }
  if (!carded) {
    j.blockers.push(`${label}: no card field on checkout: ${(await messagesOnScreen(p)).join(' // ') || 'no message'}`)
    return null
  }
  await clickAny(p, /^pay\b/i)
  await p.waitForTimeout(20000)
  const url = p.url().replace(BASE, '')
  const orderId = url.match(/\/orders\/([0-9a-f-]{36})/)?.[1] ?? null
  note(j, `${label}: paid`, `${email} -> ${url.slice(0, 90)}`)
  await describe(j, p, `${label}: after paying`)
  if (!orderId) j.blockers.push(`${label}: the purchase did not reach an order: ${url}`)
  return { orderId, selection, checkoutText }
}

try {
  // ── THE ORGANISER: the real forgot-password path, then sign in ─────────────
  const orgCtx = await browser.newContext({ viewport, locale: 'en-AU' })
  const org = await orgCtx.newPage()
  await attach(j, org)
  await org.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 30000 }).catch(() => {})
  await fillIf(org, 'input#email, input[type="email"]', ORGANISER_EMAIL)
  await describe(j, org, 'Forgot password')
  await org.click('button[type="submit"]')
  await org.waitForTimeout(4000)
  const asked = await messagesOnScreen(org)
  note(j, 'Asked for a reset link', asked.join(' // ') || (await textOnPage(org)).slice(0, 160))
  let resetLink = null
  for (let i = 0; i < 10 && !resetLink; i += 1) {
    resetLink = linkFromInbox(ORGANISER_EMAIL, /type=recovery/)
    if (!resetLink) await org.waitForTimeout(1500)
  }
  verdict('the reset email reached the inbox with a recovery link', Boolean(resetLink), resetLink ? 'link read from the console transport' : 'no recovery link in the server log')
  if (!resetLink) throw new Error('no reset link')
  await org.goto(resetLink, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForTimeout(2500)
  await org.waitForSelector('input#password', { timeout: 30000 }).catch(() => {})
  await describe(j, org, 'Set a new password')
  await fillIf(org, 'input#password', NEW_PASSWORD)
  await fillIf(org, 'input#confirm', NEW_PASSWORD)
  await org.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 30000 }).catch(() => {})
  await org.click('button[type="submit"]')
  await org.waitForTimeout(6000)
  let landed = new URL(org.url()).pathname
  note(j, 'After setting the password', `${landed} :: ${(await messagesOnScreen(org)).join(' // ') || 'no message'}`)
  if (landed.startsWith('/login') || landed.startsWith('/auth')) {
    landed = await signIn(j, org, ORGANISER_EMAIL, NEW_PASSWORD)
  }
  const signedIn = !landed.startsWith('/login') && !landed.startsWith('/auth')
  verdict('the organiser reset the password through the real path and is signed in', signedIn, landed)
  if (!signedIn) throw new Error('organiser not signed in')
  await keepSession(orgCtx, 'organiser')

  // ── THE EVENT: paid, one tier at 30.00, capacity 4 ─────────────────────────
  const review = await createEventThroughWizard(j, org, {
    title: TITLE,
    summary: 'Four seats, a rising price, and every move on record.',
    description: 'A small room and an honest price. Two sets, doors at eight.',
    price: 30,
    capacity: '4',
    wantCover: true,
  })
  if (!review.reachedReview) throw new Error('never reached Review')
  await describe(j, org, 'Review, paid event')
  verdict('a Stripe-connected organiser can publish a paid event', review.publishDisabled === false, review.publishDisabled ? `Publish disabled :: ${review.reviewText.slice(0, 200)}` : 'Publish enabled')
  await review.publishButton.click()
  await org.waitForTimeout(12000)
  const afterPublish = org.url()
  const shownAfterPublish = await messagesOnScreen(org)
  const published = /launch-kit|\/dashboard\/events\//.test(afterPublish) && !shownAfterPublish.some((s) => /could not|refused|failed/i.test(s))
  verdict('the event published', published, `${afterPublish.replace(BASE, '')} ${shownAfterPublish.join(' // ')}`)
  await describe(j, org, 'After publish')
  const eventId = afterPublish.match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  const slug = await org.evaluate(() => {
    const skip = new Set(['create', 'browse', 'map', 'search'])
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href')?.match(/^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?$/)
      if (m && !skip.has(m[1])) return m[1]
    }
    return null
  })
  if (!eventId || !slug) throw new Error(`no event id or slug after publish (${eventId} / ${slug})`)
  run.eventId = eventId
  run.slug = slug
  run.organiserOverviewUrl = `/dashboard/events/${eventId}`
  run.organiserPricingUrl = `/dashboard/events/${eventId}/pricing`
  note(j, 'Public slug', `${slug} (event ${eventId})`)

  // The page, freshly listed.
  await org.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForTimeout(2000)
  let h = await readHistory(org)
  verdict(
    'the event page carries the price history block with the listing price',
    h.present && h.entries.length === 1 && /Listed at AUD 30\.00/.test(h.entries[0]) && /No price changes/.test(h.summary),
    h.present ? `${h.entries.join(' | ')} :: ${h.summary}` : 'no block',
  )
  await org.locator('[data-testid="price-history"]').scrollIntoViewIfNeeded().catch(() => {})
  await org.waitForTimeout(800)
  await describe(j, org, 'Price history, freshly listed')

  // ── THE EDIT: 30.00 to 28.00 ────────────────────────────────────────────────
  await org.goto(`${BASE}/dashboard/events/${eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForTimeout(3000)
  const onTicketing = await advanceTo(org, '#tier-price-0')
  verdict('the edit form reaches the ticket tier', onTicketing)
  if (onTicketing) {
    await org.fill('#tier-price-0', '28')
    await org.waitForTimeout(600)
    await describe(j, org, 'Editing the tier price to 28.00')
    const onSave = await advanceTo(org, 'button:has-text("Save Changes")')
    verdict('the edit form reaches Save Changes', onSave)
    if (onSave) {
      await clickText(org, 'Save Changes')
      await org.waitForTimeout(9000)
      note(j, 'After Save Changes', `${org.url().replace(BASE, '')} :: ${(await messagesOnScreen(org)).join(' // ') || 'no message'}`)
    }
  }
  await org.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForTimeout(2000)
  h = await readHistory(org)
  verdict(
    'the page shows the organiser change: lowered to 28.00, down from 30.00, changed once',
    h.entries.length === 2 && /Lowered to AUD 28\.00/.test(h.entries[1]) && h.note === 'Down from AUD 30.00' && /changed once/.test(h.summary),
    `${h.entries.join(' | ')} :: note=${h.note} :: ${h.summary}`,
  )
  await org.locator('[data-testid="price-history"]').scrollIntoViewIfNeeded().catch(() => {})
  await org.waitForTimeout(800)
  await describe(j, org, 'Price history after the organiser lowered the price')

  // ── DYNAMIC PRICING, reached by clicking the new Pricing tab ───────────────
  await org.goto(`${BASE}/dashboard/events/${eventId}`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForTimeout(2500)
  await describe(j, org, 'Event overview with the Pricing tab')
  const tab = org.locator('nav[aria-label="Event sections"] a', { hasText: /^Pricing$/ }).first()
  verdict('the event overview offers a Pricing tab', (await tab.count()) > 0)
  if (await tab.count()) {
    await tab.click()
    await org.waitForTimeout(3500)
  }
  const onPricing = new URL(org.url()).pathname.endsWith('/pricing') && /Dynamic Pricing/.test(await textOnPage(org))
  verdict('clicking it opens the dynamic pricing screen', onPricing, org.url().replace(BASE, ''))
  await describe(j, org, 'Dynamic pricing, off')
  if (onPricing) {
    const toggle = org.locator('button[role="switch"]').first()
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
    await org.waitForTimeout(800)
    await org.fill('input[aria-label="Up to percent sold, step 1"]', '25')
    await org.locator('input[aria-label="Up to percent sold, step 1"]').blur()
    await org.fill('input[aria-label="Price at step 1"]', '28')
    await org.locator('input[aria-label="Price at step 1"]').blur()
    await clickText(org, 'Add step')
    await org.waitForTimeout(500)
    await org.fill('input[aria-label="Up to percent sold, step 2"]', '100')
    await org.locator('input[aria-label="Up to percent sold, step 2"]').blur()
    await org.fill('input[aria-label="Price at step 2"]', '40')
    await org.locator('input[aria-label="Price at step 2"]').blur()
    await org.waitForTimeout(500)
    await describe(j, org, 'Two steps: up to 25 percent at 28.00, up to 100 percent at 40.00')
    await clickText(org, 'Save')
    await org.waitForTimeout(5000)
    const saved = /Pricing saved/.test(await textOnPage(org))
    verdict('the steps save', saved, (await messagesOnScreen(org)).join(' // ') || (saved ? 'Pricing saved.' : 'no message'))
    await describe(j, org, 'Dynamic pricing saved')
    if (db) {
      const { data: rules } = await db
        .from('dynamic_pricing_rules')
        .select('step_order, capacity_threshold_percent, price_cents, ticket_tier_id')
        .order('step_order')
      const own = (rules ?? []).filter(() => true)
      const { data: tiers } = await db.from('ticket_tiers').select('id, dynamic_pricing_enabled').eq('event_id', eventId)
      const tierIds = new Set((tiers ?? []).map((t) => t.id))
      const mine = own.filter((r) => tierIds.has(r.ticket_tier_id))
      verdict(
        'the rows on TEST carry the two steps and the switch',
        mine.length === 2 && Number(mine[0].capacity_threshold_percent) === 25 && mine[0].price_cents === 2800 && Number(mine[1].capacity_threshold_percent) === 100 && mine[1].price_cents === 4000 && tiers?.[0]?.dynamic_pricing_enabled === true,
        JSON.stringify(mine.map((r) => [Number(r.capacity_threshold_percent), r.price_cents])),
      )
    }
  }
  await org.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await org.waitForTimeout(2000)
  h = await readHistory(org)
  verdict(
    'saving the steps recorded no move, because the price a buyer pays did not change',
    h.entries.length === 2 && h.prices.includes('AUD 28.00') && !h.prices.includes('AUD 40.00'),
    `${h.entries.length} entries :: prices ${h.prices.join(', ')}`,
  )
  await keepSession(orgCtx, 'organiser')
  await orgCtx.close()

  // ── BUYER A: 25 percent sold is still the first step ───────────────────────
  const ctxA = await browser.newContext({ viewport, locale: 'en-AU' })
  const pA = await ctxA.newPage()
  await attach(j, pA)
  const a = await buyOne(pA, slug, BUYER_A, 'Buyer A')
  const aState = await waitForConfirmed(a?.orderId)
  verdict('buyer A holds a confirmed ticket at 28.00', aState?.status === 'confirmed' && aState.unit === 2800, aState ? `${aState.status}, unit ${aState.unit}` : 'no order')
  await ctxA.close()

  // ── BUYER B: the reservation takes the tier to 50 percent, the second step ──
  const ctxB = await browser.newContext({ viewport, locale: 'en-AU' })
  const pB = await ctxB.newPage()
  await attach(j, pB)
  const b = await buyOne(pB, slug, BUYER_B, 'Buyer B')
  verdict('buyer B was shown 40.00 at checkout, the second step, before paying', Boolean(b?.checkoutText) && /AUD 40\.00/.test(b.checkoutText), b ? (b.checkoutText.match(/AUD \d+\.\d{2}/g) ?? []).slice(0, 4).join(', ') : 'no checkout')
  const bState = await waitForConfirmed(b?.orderId)
  verdict('buyer B holds a confirmed ticket at 40.00', bState?.status === 'confirmed' && bState.unit === 4000, bState ? `${bState.status}, unit ${bState.unit}` : 'no order')
  await ctxB.close()

  // ── THE STRANGER: what the page says now ───────────────────────────────────
  const ctxS = await browser.newContext({ viewport, locale: 'en-AU' })
  const s = await ctxS.newPage()
  await attach(j, s)
  await s.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await s.waitForTimeout(2500)
  h = await readHistory(s)
  verdict('the current price on the page is 40.00', h.prices.includes('AUD 40.00'), h.prices.join(', '))
  verdict('the note under the price says what it moved from', h.note === 'Up from AUD 28.00', String(h.note))
  verdict(
    'the history reads listed, lowered, rose at 50 percent sold',
    h.entries.length === 3 && /Listed at AUD 30\.00/.test(h.entries[0]) && /Lowered to AUD 28\.00/.test(h.entries[1]) && /Rose to AUD 40\.00 at 50% sold/.test(h.entries[2]) && /changed 2 times/.test(h.summary),
    `${h.entries.join(' | ')} :: ${h.summary}`,
  )
  await describe(j, s, 'A stranger sees the current price and the note')
  await s.locator('[data-testid="price-history"]').scrollIntoViewIfNeeded().catch(() => {})
  await s.waitForTimeout(800)
  await describe(j, s, 'A stranger reads the price history')
  const rows = await rowsFor(eventId)
  verdict(
    'the rows on TEST read listed, changed, step, with the previous price and the percent on the step',
    rows.map((r) => r.reason).join(',') === 'listed,changed,step' && rows[1]?.previous_price_cents === 3000 && rows[2]?.previous_price_cents === 2800 && Number(rows[2]?.percent_sold) === 50,
    JSON.stringify(rows.map((r) => [r.reason, r.previous_price_cents, r.price_cents, r.percent_sold])),
  )
  await ctxS.close()
} catch (err) {
  j.blockers.push(`journey stopped: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  const passed = results.filter((r) => r.ok).length
  note(j, 'Verdicts', `${passed} of ${results.length} passed`)
  if (process.env.EVIDENCE_DIR) {
    const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(j.OUT)) copyFileSync(join(j.OUT, f), join(dest, f))
    run.verdicts = results
    writeFileSync(join(dest, 'run.json'), JSON.stringify(run, null, 2))
    note(j, 'Evidence copied', dest)
  }
  await finish(j, browser)
  if (!existsSync(j.OUT)) process.exit(1)
  process.exit(results.some((r) => !r.ok) || j.blockers.length > 0 ? 1 : 0)
}
