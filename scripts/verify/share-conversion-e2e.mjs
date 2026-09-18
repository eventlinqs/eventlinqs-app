/**
 * SHARE CONVERSION, end to end (TEST only, guarded).
 *
 * THE QUESTION THIS SETTLES. The Launch Kit's central claim is a reach panel
 * showing tickets sold per channel. That claim rests on one cookie surviving a
 * journey it does not control: `el_share_code` is set by the tracked share
 * address (/e/[code] today, /s/[code] before it), and the
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
 *   2. click     - the tracked address reaches the event page, records a click,
 *                  and sets the cookie. Asserted from the browser's own cookie
 *                  jar. The address is taken from the mint response rather than
 *                  assumed, so a route rename cannot make this step lie
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

/*
 * THE ENV FILE IS FOUND, NOT ASSUMED (close-out FO1, 18 September 2026).
 *
 * This read `.env.test` and nothing else. That file is gitignored, so it exists
 * in the main checkout and in NO worktree, and this proof therefore could not be
 * run from a lane at all: it died on ENOENT before it reached its own safety
 * stop. A proof that only runs in one directory on one machine is a proof
 * nobody re-runs.
 *
 * The safety stop below is unchanged and is what actually matters: whichever
 * file is found, the project reference is checked, and a run pointed at
 * production stops.
 */
const ENV_FILES = ['.env.test', '.env.local']
const envFile = ENV_FILES.find(f => fs.existsSync(f))
if (!envFile) {
  throw new Error(`no environment file: looked for ${ENV_FILES.join(', ')} in ${process.cwd()}`)
}
const env = {}
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
console.log(`[share-e2e] environment from ${envFile}`)
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
/*
 * EACH RUN IS A DIFFERENT VISITOR, ON PURPOSE (close-out FO1, 18 September
 * 2026). Clicks de-duplicate per link per visitor for an hour
 * (CLICK_DEDUPE_WINDOW_SECONDS in src/lib/broadcast/crawler.ts), and the mint
 * endpoint hands back the SAME link for the same event and channel rather than
 * minting a new one. The visitor hash is built from the IP and the user agent,
 * and on a laptop the IP never changes, so two runs inside an hour were one
 * visitor tapping one link twice: the product correctly recorded nothing the
 * second time and the drive reported "click-recorded 1 -> 1" as a failure.
 *
 * A proof that can only pass once an hour is a proof that mostly fails, and
 * the thing it accuses is the de-duplication that is working. So the run
 * carries its own user agent. It is a normal Chrome string with a run-unique
 * suffix, and deliberately contains no token isPreviewCrawler looks for,
 * because a crawler records no click at all.
 */
const RUN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  `Chrome/140.0.0.0 Safari/537.36 EventLinqsShareProof/${Date.now()}`

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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: RUN_USER_AGENT })
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
      /*
       * THE CODE IS THE LAST PATH SEGMENT OF WHATEVER THE ENDPOINT RETURNED,
       * never a split on a hard-coded prefix (close-out FO1, 18 September 2026).
       * This read `shortUrl.split('/s/')[1]`. The share address moved to
       * /e/[code], which renders the event page on one request instead of
       * bouncing through a redirect, so the split returned undefined and the
       * run died at its own safety stop claiming "the server under test is not
       * writing to TEST". The server was writing to TEST perfectly. The drive
       * was asking about a code it had failed to parse.
       */
      const code = new URL(shortUrl).pathname.split('/').filter(Boolean).pop()

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
      /*
       * THE VISITOR IS ON THE EVENT PAGE. WHETHER THE URL CHANGED IS NOT THE
       * QUESTION (close-out FO1, 18 September 2026).
       *
       * This asserted that page.url() had become /events/<slug>, which made a
       * REDIRECT part of the contract. The tracked address deliberately stopped
       * redirecting: /e/[code] resolves the code, books the click, and renders
       * the event page component on ONE request, and the reasoning is written
       * out in src/app/e/[code]/page.tsx (a hop costs a round trip on a phone
       * in a venue). So the drive failed with "the tracked link did not land on
       * the event page" while standing on the event page.
       *
       * What a sharer actually needs is that the person who tapped their link
       * is looking at the event. That is asserted from the RENDERED PAGE: the
       * event's own title, and its ticket panel. Either address satisfies it,
       * and a page that 200s while rendering something else does not.
       */
      const title = (await page.title()) || ''
      const onEventPage =
        new RegExp(`/events/${ev.slug}`).test(page.url()) ||
        (title.includes(ev.title) && (await page.getByRole('button', { name: /^increase .+ quantity$/i }).count()) > 0)
      step('landed-on-the-event', onEventPage, `${page.url()} titled "${title}"`)
      if (!onEventPage) throw new Error(`the tracked link did not reach the event page: ${page.url()} titled "${title}"`)

      const cookieAfterClick = (await ctx.cookies()).find((c) => c.name === SHARE_COOKIE)
      step(
        'cookie-set',
        cookieAfterClick?.value === code,
        cookieAfterClick ? `${SHARE_COOKIE}=${cookieAfterClick.value}` : `${SHARE_COOKIE} was never set`,
      )
      if (cookieAfterClick?.value !== code) throw new Error(`the share cookie was not set by ${new URL(shortUrl).pathname}`)

      const clicksAfter = (await q(`share_link_events?link_id=eq.${linkId}&kind=eq.click&select=id`)).length
      step('click-recorded', clicksAfter > clicksBefore, `${clicksBefore} -> ${clicksAfter} click rows`)

      // --- 3. PURCHASE ---------------------------------------------------
      // THE NAME IS THE PRODUCT'S OWN, ANCHORED AT BOTH ENDS (close-out FO1,
      // 18 September 2026). This read /^(\+|increase|add)/i and took .first(),
      // so from 14 September it pressed the "Add to calendar" button that ships
      // above the ticket panel, left the quantity at 0, and reported the ticket
      // panel as missing. src/components/checkout/ticket-selector.tsx labels the
      // control `Increase ${tier.name} quantity`; guarded by
      // scripts/guards/drive-quantity-control-selector.mjs.
      const plus = page.getByRole('button', { name: /^increase .+ quantity$/i }).first()
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
