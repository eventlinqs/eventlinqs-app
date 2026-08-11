/**
 * SHARE CONVERSION, end to end (TEST only, guarded).
 *
 * THE QUESTION THIS SETTLES. The Launch Kit's central claim is a reach panel
 * showing tickets sold per channel. That claim rests on one cookie surviving a
 * journey it does not control: `el_share_code` is set at `/s/[code]`, and the
 * conversion is written much later, on the order confirmation render, after the
 * browser has left the site for Stripe and come back. Nothing in the codebase
 * proves that survival. `reach-integrity` cannot settle it either: production
 * has no paid order, so its zero conversions prove nothing, and TEST's ten are
 * historical rows from earlier sessions that say nothing about the code at HEAD.
 *
 * The founder ranked this first among the unfixed. It is settled here the only
 * way it can be: by driving a real card-4242 purchase through a freshly minted
 * tracked link and asserting the conversion row appears against THAT order.
 *
 * WHAT EACH STEP PROVES, so a pass cannot be a coincidence:
 *   1. mint      - the public share-link endpoint returns a real short URL, and
 *                  the row lands in TEST (this is also the database guard: a
 *                  server pointed at production could not create this row here)
 *   2. click     - /s/[code] 302s to the event page, records a click, and sets
 *                  the cookie. Asserted from the browser's own cookie jar
 *   3. survival  - the cookie is still present at checkout, and again on the
 *                  confirmation page after the round trip through Stripe
 *   4. conversion- a share_link_events row of kind 'conversion' exists carrying
 *                  THIS order id and THIS link id
 *
 * Step 4 is the one that matters and steps 1 to 3 exist so that a failure names
 * the leg that broke rather than reporting "no conversion" and leaving the
 * reader to guess whether the cookie, the redirect, or the write was at fault.
 *
 * ON THE WEBHOOK. The conversion is written when the confirmation page renders
 * with a confirmed order, and Stripe's redirect carries `redirect_status=
 * succeeded`, so the conversion does not wait on webhook delivery. The webhook
 * leg has its own harness (paid-purchase-webhook-e2e.mjs) and is not re-proven
 * here; this harness reports the order status it observed either way so a
 * pending order is visible rather than hidden.
 *
 * Usage: node scripts/verify/share-conversion-e2e.mjs [baseUrl]
 * SAFETY: refuses to run unless the Supabase project is the TEST one, and
 * refuses to accept a base URL it has not proven writes to TEST.
 */
import fs from 'node:fs'
import { chromium } from 'playwright'
import { capture } from '../lib/capture.mjs'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const SHARE_COOKIE = 'el_share_code'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SB = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (SB.includes(PROD_REF)) throw new Error('SAFETY STOP: pointed at the PRODUCTION project')
if (!SB.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const H = { apikey: SVC, authorization: `Bearer ${SVC}` }

const q = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const GUEST_EMAIL = `share-conversion-${Date.now()}@mailinator.com`
const OUT = 'docs/roast/share-conversion'
fs.mkdirSync(OUT, { recursive: true })
// WebP q80 via the shared helper: 81 percent smaller than lossless PNG on this
// repo's own captures, with a worst-case mean pixel difference of 1.92 of 255.
const shot = (page, name) => capture(page, `${OUT}/${name}.png`, { fullPage: false }).catch(() => {})

const steps = []
const step = (name, ok, detail) => {
  steps.push({ name, ok, detail })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`)
  return ok
}

/**
 * A paid, general-admission, published event whose organiser can actually take
 * a charge. Selecting on the event alone is not enough: an organisation with a
 * null stripe_account_country is rejected before Stripe is called, so the
 * payment element never mounts and the harness would fail for a reason that has
 * nothing to do with share attribution.
 */
async function candidateEvents() {
  const orgs = await q(
    'organisations?stripe_charges_enabled=is.true&stripe_payouts_enabled=is.true&payout_status=eq.active&stripe_account_country=not.is.null&select=id,name&limit=50',
  )
  if (!orgs.length) throw new Error('no charge-ready organisation on TEST')
  const ids = orgs.map((o) => o.id).join(',')
  const rows = await q(
    `events?status=eq.published&has_reserved_seating=is.false&organiser_assigns_seats=is.false&is_free=is.false&organisation_id=in.(${ids})&select=id,slug,title&order=slug&limit=40`,
  )
  if (!rows.length) throw new Error('no published paid GA event under a charge-ready organisation')
  console.log(`[setup] ${rows.length} candidate event(s) under ${orgs.length} charge-ready organisation(s)`)
  return rows
}

const result = { base: BASE, startedAt: new Date().toISOString(), guestEmail: GUEST_EMAIL }
const browser = await chromium.launch()

try {
  const candidates = await candidateEvents()
  const before = await q('share_link_events?kind=eq.conversion&select=id')
  result.conversionsBefore = before.length
  console.log(`[setup] conversions on TEST before this run: ${before.length}\n`)

  let done = false
  for (const ev of candidates.slice(0, 6)) {
    if (done) break
    console.log(`[drive] ${ev.slug}`)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    try {
      // --- 1. MINT -------------------------------------------------------
      const mint = await fetch(`${BASE}/api/broadcast/share-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: ev.slug, channels: ['whatsapp'] }),
      })
      const minted = await mint.json()
      const shortUrl = minted?.links?.whatsapp
      if (!shortUrl) {
        console.log(`  no tracked link minted (${JSON.stringify(minted).slice(0, 160)}), skipping`)
        await ctx.close()
        continue
      }
      const code = shortUrl.split('/s/')[1]

      // The database guard. This row can only be in TEST if the server under
      // test writes to TEST, so a misconfigured base URL stops here rather than
      // producing a confident result about the wrong database.
      const linkRows = await q(`share_links?code=eq.${code}&select=id,event_id,channel`)
      if (!linkRows.length || linkRows[0].event_id !== ev.id) {
        throw new Error(
          `SAFETY STOP: ${BASE} minted code ${code} but no matching row is in TEST. The server under test is not writing to TEST.`,
        )
      }
      const linkId = linkRows[0].id
      step('mint', true, `${shortUrl} (link ${linkId}, channel ${linkRows[0].channel})`)

      // --- 2. CLICK ------------------------------------------------------
      const clicksBefore = (await q(`share_link_events?link_id=eq.${linkId}&kind=eq.click&select=id`)).length
      await page.goto(shortUrl, { waitUntil: 'load', timeout: 90000 })
      const landedOnEvent = new RegExp(`/events/${ev.slug}`).test(page.url())
      step('redirect', landedOnEvent, `landed on ${page.url()}`)
      if (!landedOnEvent) throw new Error('the tracked link did not land on the event page')

      const cookieAfterClick = (await ctx.cookies()).find((c) => c.name === SHARE_COOKIE)
      step(
        'cookie-set',
        cookieAfterClick?.value === code,
        cookieAfterClick ? `${SHARE_COOKIE}=${cookieAfterClick.value}` : `${SHARE_COOKIE} was never set`,
      )
      if (cookieAfterClick?.value !== code) throw new Error('the share cookie was not set by /s/[code]')

      const clicksAfter = (await q(`share_link_events?link_id=eq.${linkId}&kind=eq.click&select=id`)).length
      step('click-recorded', clicksAfter > clicksBefore, `${clicksBefore} -> ${clicksAfter} click rows`)

      // --- 3. PURCHASE ---------------------------------------------------
      const plus = page.getByRole('button', { name: /^(\+|increase|add)/i }).first()
      if (!(await plus.count())) {
        console.log('  no quantity control, skipping')
        await ctx.close()
        continue
      }
      await plus.click()
      await page.waitForTimeout(500)
      const reserve = page.getByRole('button', { name: /reserve|get tickets|checkout/i }).first()
      if (!(await reserve.count())) {
        console.log('  no reserve button, skipping')
        await ctx.close()
        continue
      }
      await shot(page, '1-event-page-via-tracked-link')
      await reserve.click()
      try {
        await page.waitForURL(/\/checkout\//, { timeout: 20000 })
      } catch {
        console.log('  did not reach checkout, skipping')
        await ctx.close()
        continue
      }
      await page.waitForTimeout(2000)

      const cookieAtCheckout = (await ctx.cookies()).find((c) => c.name === SHARE_COOKIE)
      step(
        'cookie-survives-to-checkout',
        cookieAtCheckout?.value === code,
        cookieAtCheckout ? `still ${cookieAtCheckout.value}` : 'the cookie was lost before checkout',
      )

      const fillField = async (labelRe, placeholder, value) => {
        let el = page.getByLabel(labelRe).first()
        if (!(await el.count()) && placeholder) el = page.getByPlaceholder(placeholder).first()
        if (!(await el.count())) return false
        if (!(await el.inputValue())) await el.fill(value)
        return true
      }
      const gotFirst = await fillField(/first name/i, null, 'Share')
      if (gotFirst) await fillField(/last name/i, null, 'Conversion')
      else await fillField(/full name|^name$/i, 'Jane Smith', 'Share Conversion')
      await fillField(/e-?mail/i, 'you@example.com', GUEST_EMAIL)
      for (const el of await page.locator('input[required]:not([type=checkbox])').all()) {
        if (!(await el.inputValue())) {
          const type = await el.getAttribute('type')
          await el.fill(type === 'email' ? GUEST_EMAIL : 'Proof')
        }
      }
      await shot(page, '2-checkout')

      await page.getByRole('button', { name: /continue to payment/i }).click()
      const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
      await frame.locator('input[name="number"]').fill('4242424242424242', { timeout: 60000 })
      await frame.locator('input[name="expiry"]').fill('12/30')
      await frame.locator('input[name="cvc"]').fill('123')
      const postal = frame.locator('input[name="postalCode"]')
      if (await postal.count()) await postal.fill('3220')
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: /pay/i }).first().click()
      await page.waitForURL(/confirmation/, { timeout: 120000 })

      const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1] ?? null
      if (!orderId) throw new Error('landed on confirmation with no order id in the URL')
      result.orderId = orderId
      result.slug = ev.slug
      result.code = code
      result.linkId = linkId
      await shot(page, '3-confirmation')

      const cookieAtConfirmation = (await ctx.cookies()).find((c) => c.name === SHARE_COOKIE)
      step(
        'cookie-survives-stripe-round-trip',
        cookieAtConfirmation?.value === code,
        cookieAtConfirmation
          ? `still ${cookieAtConfirmation.value} after returning from Stripe`
          : 'the cookie was lost across the Stripe round trip, so no conversion can ever be attributed',
      )

      // --- 4. CONVERSION -------------------------------------------------
      // The confirmation render writes it. Poll briefly: the first render may
      // race the payment-intent redirect, and a reload is a legitimate retry
      // because the (link_id, order_id) unique index makes the write idempotent.
      let conversion = null
      const started = Date.now()
      while (Date.now() - started < 60000) {
        const rows = await q(
          `share_link_events?kind=eq.conversion&order_id=eq.${orderId}&select=id,link_id,occurred_at`,
        )
        if (rows.length) {
          conversion = rows[0]
          break
        }
        await new Promise((r) => setTimeout(r, 3000))
        await page.reload({ waitUntil: 'load' }).catch(() => {})
      }
      result.secondsToConversion = Math.round((Date.now() - started) / 1000)

      const order = (await q(`orders?id=eq.${orderId}&select=order_number,status,total_cents,currency`))[0]
      result.order = order
      result.conversion = conversion

      step(
        'conversion-recorded',
        Boolean(conversion),
        conversion
          ? `share_link_events ${conversion.id} kind=conversion order=${orderId} link=${conversion.link_id} at ${conversion.occurred_at}`
          : `no conversion row for order ${orderId} after ${result.secondsToConversion}s`,
      )
      step(
        'conversion-credits-the-right-link',
        conversion?.link_id === linkId,
        conversion ? `${conversion.link_id} (minted ${linkId})` : 'no conversion to check',
      )
      step(
        'order-is-a-real-paid-order',
        Boolean(order) && order.total_cents > 0,
        order ? `${order.order_number} ${order.status} ${order.total_cents}c ${order.currency}` : 'no order row',
      )

      done = true
    } finally {
      await ctx.close()
    }
  }

  if (!done) throw new Error('could not complete a tracked purchase on any candidate event')

  const after = await q('share_link_events?kind=eq.conversion&select=id')
  result.conversionsAfter = after.length
  console.log(`\nconversions on TEST: ${result.conversionsBefore} -> ${result.conversionsAfter}`)
} catch (err) {
  result.error = String(err)
  console.error('\nFAILED:', err)
} finally {
  result.finishedAt = new Date().toISOString()
  result.steps = steps
  const failed = steps.filter((s) => !s.ok)
  result.verdict = !result.error && steps.length > 0 && failed.length === 0 ? 'PASS' : 'FAIL'
  fs.writeFileSync(`${OUT}/share-conversion-e2e.json`, JSON.stringify(result, null, 2))
  console.log(`\nverdict: ${result.verdict}`)
  if (failed.length) for (const f of failed) console.log(`  broken leg: ${f.name} - ${f.detail}`)
  await browser.close()
  process.exitCode = result.verdict === 'PASS' ? 0 : 2
}
