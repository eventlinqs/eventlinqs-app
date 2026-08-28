/**
 * THE STRANGER JOURNEYS. UI only: if a stranger could not click it, this does
 * not do it. Reads the confirmation link out of the console mail transport the
 * way a person reads it out of their inbox.
 */
import { chromium } from 'playwright'
import { mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs'

export const BASE = process.env.BASE ?? 'http://localhost:3311'
const SERVER_LOG = '.tmp-serve.log'

export function makeJourney(id, title, _viewport = { width: 1440, height: 1000 }) {
  const OUT = `docs/verification/journeys-2026-08-28/${id}`
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/log.txt`, `${title}\n${'='.repeat(title.length)}\n`)
  return { OUT, title, step: 0, errors: [], blockers: [], unclear: [] }
}

export function note(j, what, detail) {
  j.step += 1
  const line = `${String(j.step).padStart(2, '0')}. ${what}${detail ? `\n      ${detail}` : ''}`
  console.log(line)
  appendFileSync(`${j.OUT}/log.txt`, line + '\n')
}

export async function attach(j, page) {
  page.on('pageerror', (e) => j.errors.push(`pageerror ${String(e).slice(0, 130)}`))
  page.on('response', (r) => {
    if (r.status() >= 500) j.errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, '').slice(0, 100)}`)
  })
}

export async function see(page) {
  return page.evaluate(() => {
    const ok = (el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const o = { h: null, buttons: [], fields: [], errs: [], links: [] }
    const h = [...document.querySelectorAll('h1,h2')].filter(ok)[0]
    o.h = h ? h.textContent.trim().slice(0, 64) : null
    for (const b of document.querySelectorAll('button,a[role=button],input[type=submit]')) {
      if (!ok(b)) continue
      const t = (b.textContent || b.value || '').trim().slice(0, 32)
      if (t) o.buttons.push(t)
    }
    for (const f of document.querySelectorAll('input:not([type=hidden]),select,textarea')) {
      if (!ok(f)) continue
      const l = f.labels?.[0]?.textContent?.trim() || f.getAttribute('aria-label') || f.getAttribute('placeholder') || f.name || f.type
      o.fields.push(`${l}${f.required ? '*' : ''}`.slice(0, 28))
    }
    for (const e of document.querySelectorAll('[role=alert],.text-red-600,[data-error]')) {
      if (!ok(e)) continue
      const t = (e.textContent || '').trim().slice(0, 140)
      if (t) o.errs.push(t)
    }
    for (const a of document.querySelectorAll('a[href]')) {
      if (!ok(a)) continue
      const t = (a.textContent || '').trim().slice(0, 28)
      if (t.length > 1) o.links.push(t)
    }
    return o
  })
}

export async function describe(j, page, what) {
  const v = await see(page)
  note(j, what,
    `URL     ${page.url().replace(BASE, '')}\n      heading ${JSON.stringify(v.h)}\n      fields  ${v.fields.slice(0, 10).join(' | ') || '(none)'}\n      buttons ${v.buttons.slice(0, 9).join(' | ') || '(none)'}` +
    (v.errs.length ? `\n      ERRORS  ${v.errs.join(' // ')}` : ''))
  await page.screenshot({ path: `${j.OUT}/${String(j.step).padStart(2, '0')}-${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 38)}.png` })
  return v
}

/** The link the platform emailed, read the way a person reads their inbox. */
export function linkFromInbox(toEmail, match = /auth\/confirm/) {
  const log = readFileSync(SERVER_LOG, 'utf8')
  const blocks = log.split('[email:console] ---------------------------------------------')
  for (const b of blocks.reverse()) {
    if (!b.includes(toEmail)) continue
    for (const line of b.split('\n')) {
      const m = /\[email:console\] link\s+(\S+)/.exec(line)
      if (m && match.test(m[1])) return m[1].replaceAll('&amp;', '&')
    }
  }
  return null
}

/**
 * Widened from the original [role=alert],.text-red-600 pair. The media step
 * renders its refusal as an amber div with no role at all, so the first four
 * runs of journey 1 reported "NOTHING AT ALL" while a message sat on screen.
 */
export const MESSAGE_SELECTOR =
  '[role=alert],[role=status],.text-red-600,.text-red-700,.text-red-800,.text-error,.text-error-strong,' +
  '.text-amber-800,.text-amber-900,.bg-red-50,.bg-error\\/10,[data-error]'

/** Every refusal or status the person can actually read right now. */
export async function messagesOnScreen(page) {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 200))
        .filter(Boolean),
    MESSAGE_SELECTOR,
  )
}

/** Fill if present and fillable. Never throws: a field can legitimately vanish. */
export async function fillIf(page, sel, val) {
  try {
    const el = await page.$(sel)
    if (!el) return false
    await el.fill(val)
    return true
  } catch {
    return false
  }
}

export async function clickText(page, t) {
  const b = await page.$(`button:has-text("${t}")`)
  if (!b) return false
  await b.click()
  return true
}

/** Sign in through the real form. Returns the path it landed on. */
export async function signIn(j, page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
  await fillIf(page, 'input[type="email"]', email)
  await fillIf(page, 'input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(6000)
  const landed = new URL(page.url()).pathname
  note(j, 'Signed in', `${email} -> ${landed}`)
  if (landed.startsWith('/login')) {
    j.blockers.push(`sign-in refused: ${(await messagesOnScreen(page)).join(' // ') || 'NOTHING SHOWN'}`)
  }
  return landed
}

/**
 * Sign up through the real form and confirm through the emailed link.
 * Returns true only if the account is confirmed and signed in.
 */
export async function signUpAndConfirm(j, page, { name, email, password }) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle', timeout: 60000 })
  await fillIf(page, 'input#fullName', name)
  await fillIf(page, 'input[type="email"]', email)
  await fillIf(page, 'input[type="password"]', password)
  await page.click('button[type="submit"]')
  /*
   * WAIT FOR AN ANSWER, NOT FOR A CLOCK.
   *
   * This was `waitForTimeout(7000)`, and on a cold `next start` the signup POST
   * regularly takes longer than that: it calls GoTrue and then sends the
   * confirmation email before it answers. The journey then read the page while
   * the request was still in flight, found the URL unchanged and no message
   * rendered yet, and reported "signup refused: NOTHING SHOWN".
   *
   * That is the worst possible failure mode for a journey script, because it
   * indicts the product for the harness's impatience, and it did exactly that
   * twice on 29 August before being caught by probing the same submit by hand
   * and watching a perfectly good 502-with-a-message arrive at 15s.
   *
   * So: settle on the first REAL outcome, either the redirect or something the
   * person can read, and only then fall through to a verdict.
   */
  await Promise.race([
    page.waitForURL(/\/verify-email-sent/, { timeout: 45000 }).catch(() => {}),
    page
      .waitForFunction(
        sel => [...document.querySelectorAll(sel)].some(e => e.getBoundingClientRect().width > 0 && e.textContent.trim()),
        MESSAGE_SELECTOR,
        { timeout: 45000 },
      )
      .catch(() => {}),
  ])
  await page.waitForTimeout(1500)
  const landed = new URL(page.url()).pathname
  if (!landed.startsWith('/verify-email-sent')) {
    const shown = await messagesOnScreen(page)
    note(j, 'Signup did not ask for confirmation', `${landed} :: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
    j.blockers.push(`signup refused: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
    return false
  }
  const link = linkFromInbox(email)
  if (!link) {
    j.blockers.push('no confirmation email reached the inbox')
    return false
  }
  await page.goto(link, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3500)
  note(j, 'Signed up and confirmed', `${email} -> ${new URL(page.url()).pathname}`)
  return true
}

/**
 * Walk the create-event wizard the way a person does, and stop at Review.
 *
 * TWO THINGS ARE DELIBERATE AND BOTH COST A DAY TO LEARN.
 *
 * Sale Starts and Sale Ends are NEVER filled. They default to empty and are
 * optional, and filling every date field on every step set a sale window that
 * ran to the event's own end time. The wizard then refused to advance and said
 * nothing at all, which reads exactly like a dead Continue button.
 *
 * The cover is made and then ACCEPTED. The composer offers a preview and does
 * not apply it until "Use this cover" is pressed, so skipping that reaches
 * Review with no cover and a correctly disabled Publish.
 *
 * Returns what the review step actually offers, so the caller can judge it.
 */
export async function createEventThroughWizard(j, page, opts) {
  const { title, summary, description, price = null, capacity = '100', wantCover = true } = opts

  await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  // The organisation step appears only for an organiser who has none yet.
  if (await page.$('button:has-text("Continue to event details")')) {
    await fillIf(page, 'input#name, input[name="name"]', opts.orgName ?? `${title} Presents`)
    await fillIf(page, 'textarea#description, textarea[name="description"]', 'Events for our community.')
    await clickText(page, 'Continue to event details')
    await page.waitForTimeout(6000)
  }

  await fillIf(page, 'input[placeholder^="e.g. Summer Music Festival"]', title)
  await fillIf(page, 'input[placeholder^="A brief one-line"]', summary)
  await fillIf(page, 'textarea[placeholder^="Describe your event in detail"]', description)
  const sel = await page.$('select')
  if (sel) {
    const opt = await page.evaluate(() => {
      const s = document.querySelector('select')
      const o = [...s.options].find((x) => /arts/i.test(x.textContent)) ?? [...s.options].find((x) => x.value)
      return o?.value ?? null
    })
    if (opt) await page.selectOption('select', opt)
  }
  await clickText(page, 'Continue')
  await page.waitForTimeout(4000)

  let madeCover = false
  for (let i = 0; i < 9; i += 1) {
    const onTicketing = Boolean(await page.$('button:has-text("Add Ticket Tier")'))
    if (!onTicketing) {
      const dates = await page.$$('input[type="date"], input[type="datetime-local"]')
      for (let d = 0; d < dates.length; d += 1) {
        const when = new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
        const type = await page.evaluate((e) => e.type, dates[d])
        await dates[d]
          .fill(type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16))
          .catch(() => {})
      }
      await fillIf(page, 'input[placeholder*="Venue"], input[placeholder*="Address"]', 'The Wool Exchange, Geelong')
    }

    /*
     * UPLOAD a cover rather than compose one, when asked. The composer is
     * currently broken (see the j1 findings), and a journey that cannot get past
     * the media step cannot test anything downstream of it. Uploading is also
     * the path most organisers take: they have their own artwork.
     */
    if (opts.uploadCover && !madeCover && (await page.$('input[type="file"]'))) {
      const input = await page.$('input[type="file"]')
      await input.setInputFiles(opts.uploadCover)
      const started = Date.now()
      while (Date.now() - started < 60000) {
        madeCover = await page.evaluate(() =>
          [...document.querySelectorAll('img')].some((im) => {
            const r = im.getBoundingClientRect()
            return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
          }),
        )
        if (madeCover) break
        await page.waitForTimeout(1500)
      }
      const shown = await messagesOnScreen(page)
      note(j, 'Uploaded a cover', madeCover ? 'it appeared immediately' : `NOTHING APPEARED: ${shown.join(' // ') || 'no message'}`)
      if (!madeCover) j.blockers.push(`uploading a cover showed nothing: ${shown.join(' // ') || 'no message'}`)
    }

    if (wantCover && !madeCover && (await page.$('button:has-text("Make a cover")'))) {
      await clickText(page, 'Make a cover')
      const started = Date.now()
      while (Date.now() - started < 45000) {
        madeCover = await page.evaluate(() =>
          [...document.querySelectorAll('img')].some((im) => {
            const r = im.getBoundingClientRect()
            return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
          }),
        )
        if (madeCover) break
        const shown = await messagesOnScreen(page)
        if (shown.some((t) => /could not make a cover/i.test(t))) break
        await page.waitForTimeout(1500)
      }
      const shown = await messagesOnScreen(page)
      note(j, 'Made a cover', madeCover ? 'the platform composed one' : `FAILED: ${shown.join(' // ') || 'no message'}`)
      if (!madeCover) {
        j.blockers.push(
          `the cover composer failed: ${shown.join(' // ') || 'no message'} (known: it works once per server process)`,
        )
      } else if (await page.$('button:has-text("Use this cover")')) {
        await clickText(page, 'Use this cover')
        await page.waitForTimeout(6000)
      }
    }

    if (onTicketing) {
      await fillIf(page, '#tier-name-0, input[placeholder^="e.g. General Admission"]', 'General admission')
      const typeSel = await page.$('#type-21, select')
      if (typeSel) {
        const want = price === null || price === 0 ? 'free' : 'general_admission'
        // page.evaluate takes ONE argument; a second is a hard error.
        const has = await page.evaluate(
          ({ s, w }) => [...s.options].some((o) => o.value === w),
          { s: typeSel, w: want },
        )
        if (has) await typeSel.selectOption(want)
      }
      // By the price input's own name, not by the label's htmlFor: that pointed
      // at the CURRENCY select until 28 August, so filling it left the ticket at
      // zero and the "paid" event published as free.
      if (price) {
        const filled =
          (await fillIf(page, 'input[aria-label^="Ticket price for tier"]', String(price))) ||
          (await fillIf(page, '#tier-price-0', String(price)))
        if (!filled) j.blockers.push('could not find the ticket price field on the ticketing step')
      }
      await fillIf(page, '#tier-capacity-0', capacity)
      await page.waitForTimeout(1200)
    }

    if (await page.$('button:has-text("Publish and get your launch kit")')) break
    if (!(await clickText(page, 'Continue'))) break
    await page.waitForTimeout(4000)
  }

  const pub = await page.$('button:has-text("Publish and get your launch kit")')
  if (!pub) {
    j.blockers.push('never reached the Review step: no Publish button')
    return { reachedReview: false, madeCover }
  }
  const disabled = await page.evaluate((b) => b.disabled, pub)
  const reviewText = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' '))
  return { reachedReview: true, madeCover, publishDisabled: disabled, reviewText, publishButton: pub }
}

/**
 * Buy one ticket as a signed-out stranger, from the public event page through
 * Stripe, and return where it landed.
 *
 * Extracted from journey 3, which proved it end to end. Three traps are baked in
 * because each cost a run there:
 *   - the quantity stepper is a "+" BUTTON. The only <select> on an event page
 *     is the footer language picker, and choosing from it sets the site language
 *     while leaving the cart empty.
 *   - the real CTA carries the all-in total ("Checkout · AUD 26.87"). A loose
 *     match on /checkout|get tickets/ hits the page's own heading button.
 *   - checkout asks for the BUYER and then for each ATTENDEE. There is a "Use my
 *     details for all tickets" control; without it, required fields stay empty
 *     and "Continue to payment" does nothing.
 */
export async function buyTicket(j, page, slug, buyerEmail, buyerName = 'Robin Ashe') {
  const clickAny = async rx => {
    for (const el of await page.$$('button, a')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (rx.test(t) && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {})
        return t
      }
    }
    return null
  }
  const byLabel = async (rx, value) => {
    for (const el of await page.$$('input')) {
      if (!(await el.isVisible().catch(() => false))) continue
      const n = await el.evaluate(
        e => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
      )
      if (rx.test(n)) {
        await el.fill(value).catch(() => {})
        return true
      }
    }
    return false
  }

  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  if (!(await clickAny(/^(get tickets|buy tickets|select tickets)/i))) {
    j.blockers.push(`no way to start buying on /events/${slug}`)
    return null
  }
  await page.waitForTimeout(2500)
  for (const b of await page.$$('button')) {
    const t = ((await b.innerText().catch(() => '')) || '').trim()
    if (t === '+') {
      await b.click().catch(() => {})
      break
    }
  }
  await page.waitForTimeout(2500)
  if (!(await clickAny(/^checkout\b/i))) {
    j.blockers.push('ticket selection offers no way to continue to checkout')
    return null
  }
  await page.waitForTimeout(6000)

  await byLabel(/full name/i, buyerName)
  await byLabel(/^email/i, buyerEmail)
  await page.waitForTimeout(800)
  await clickAny(/use my details for all tickets/i)
  await page.waitForTimeout(1200)
  await clickAny(/^continue to payment/i)
  await page.waitForTimeout(8000)

  let carded = false
  for (const frame of page.frames()) {
    const num = await frame.$('input[name="number"], input[autocomplete="cc-number"]')
    if (!num) continue
    await num.fill('4242424242424242').catch(() => {})
    await (await frame.$('input[name="expiry"], input[autocomplete="cc-exp"]'))?.fill('12 / 34').catch(() => {})
    await (await frame.$('input[name="cvc"], input[autocomplete="cc-csc"]'))?.fill('123').catch(() => {})
    await (await frame.$('input[name="postalCode"], input[autocomplete="postal-code"]'))?.fill('3000').catch(() => {})
    carded = true
    break
  }
  if (!carded) {
    j.blockers.push(`no card field on checkout: ${(await messagesOnScreen(page)).join(' // ') || 'no message'}`)
    return null
  }
  await clickAny(/^pay\b/i)
  await page.waitForTimeout(20000)
  const url = page.url().replace(BASE, '')
  const orderId = url.match(/\/orders\/([0-9a-f-]{36})/)?.[1] ?? null
  note(j, 'Bought a ticket', `${buyerEmail} -> ${url.slice(0, 80)}`)
  if (!orderId) j.blockers.push(`the purchase did not reach an order: ${url}`)
  return orderId
}

export async function finish(j) {
  writeFileSync(`${j.OUT}/errors.txt`, j.errors.join('\n'))
  console.log(`\n--- ${j.title}`)
  console.log(`--- server errors : ${j.errors.length}`)
  for (const e of [...new Set(j.errors)].slice(0, 8)) console.log(`    ${e}`)
  console.log(`--- BLOCKERS      : ${j.blockers.length}`)
  for (const b of j.blockers) console.log(`    ${b}`)
  console.log(`--- unclear steps : ${j.unclear.length}`)
  for (const u of j.unclear) console.log(`    ${u}`)
}

export { chromium }
