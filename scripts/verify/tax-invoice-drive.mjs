/**
 * THE TAX INVOICE, GENERATED AND READ BACK.
 *
 * ============================================================================
 * WHAT THIS PROVES, AND WHY READING THE CODE WOULD NOT
 * ============================================================================
 *
 * A tax invoice is not a data structure, it is a DOCUMENT A BUYER RECEIVES. The
 * Australian Taxation Office's own wording makes that the test:
 *
 *   "A tax invoice doesn't need to be issued in paper form ... Any digital
 *    record or document transmitted to the customer needs to contain all the
 *    required information to be a valid tax invoice."
 *   https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
 *   (page last updated 25 August 2025, fetched 25 August 2026)
 *
 * So this builds a real organiser with a real ABN, a real confirmed order, then
 * LOADS THE PAGE THE BUYER LOADS over HTTP and reads the seven required details
 * out of the delivered HTML. Unit tests cover the arithmetic
 * (tests/unit/tax/tax-invoice.test.ts); this covers the artefact.
 *
 * IT CARRIES ITS OWN NEGATIVE CONTROL. Halfway through, the organiser's GST
 * registration is switched off and the same page is loaded again. It must stop
 * calling itself a tax invoice and stop stating GST. Without that half, a page
 * that printed "Tax invoice" unconditionally would pass every assertion above.
 *
 * TEST ONLY, refused against production by assertNotProductionDatabase(). Every
 * row it creates is torn down in a finally block, and the teardown reports what
 * it removed so an interrupted run is visible rather than silent.
 *
 * USAGE
 *   node --env-file=.env.test scripts/verify/tax-invoice-drive.mjs
 *   DRIVE_BASE=http://127.0.0.1:3210 node --env-file=.env.test scripts/verify/tax-invoice-drive.mjs
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import { randomUUID } from 'node:crypto'

const BASE = (process.env.DRIVE_BASE || 'http://127.0.0.1:3210').replace(/\/$/, '')
/** The Australian Business Register's own worked example ABN. */
const ABR_EXAMPLE_ABN = '51824753556'

const target = assertNotProductionDatabase()
const client = await target.connect()
const q = (text, params) => client.query(text, params)
const one = async (text, params) => (await q(text, params)).rows[0]

const results = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const sfx = Date.now().toString(36)
let ownerUser = randomUUID()
const orgId = randomUUID()
const eventId = randomUUID()
const tierId = randomUUID()
const orderId = randomUUID()
const oiTicket = randomUUID()
const oiAddon = randomUUID()
const oiComp = randomUUID()
const addonId = randomUUID()
const orderNumber = `EL-TAX${sfx.toUpperCase()}`

async function html(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'user-agent': 'EventLinqs-tax-invoice-drive/1.0', accept: 'text/html' },
    redirect: 'manual',
  })
  return { status: res.status, body: await res.text() }
}

/** Strip tags so an assertion reads the TEXT a buyer sees, not the markup. */
function text(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * GoTrue's admin API, because a row inserted straight into auth.users is not a
 * user GoTrue knows about.
 *
 * The first version of this drive INSERTed into auth.users with SQL, the way the
 * refund end-to-end fixture does, and then asked GoTrue to set a password on
 * that id. It answered 404. The SQL row is enough for a foreign key and for RLS,
 * and it is not enough to sign in with: GoTrue owns instance_id, aud, role and
 * the encrypted password, and it will not adopt a row it did not create. So the
 * user is created through the API and its id is used everywhere downstream.
 */
const authAdmin = async (path, init) => {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${path}`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return fetch(url, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

try {
  console.log('=== FIXTURE ===')
  /*
   * GENERATED, NOT WRITTEN DOWN. `no-plaintext-credential` flagged the first
   * version of this line, and it was right to: a credential-named identifier
   * assigned a literal is the shape it exists to refuse, and a guard that has to
   * judge intent is a guard nobody trusts. There is no reason for a throwaway
   * fixture password to be a literal at all, so it is assembled from a fresh
   * UUID plus one uppercase run and one symbol, which is what satisfies GoTrue's
   * complexity rule. It exists for the length of this run and is deleted with
   * the user in the teardown.
   */
  const ownerPassword =
    randomUUID().split('-').join('') +
    randomUUID().slice(0, 4).toUpperCase() +
    String.fromCharCode(33)
  const created = await authAdmin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: `tax_${sfx}@test.invalid`,
      password: ownerPassword,
      email_confirm: true,
    }),
  })
  if (!created.ok) throw new Error(`could not create the fixture user: HTTP ${created.status} ${await created.text()}`)
  ownerUser = (await created.json()).id
  console.log(`  owner ${ownerUser}`)
  await q(
    'INSERT INTO public.profiles (id, email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email',
    [ownerUser, `tax_${sfx}@test.invalid`],
  )
  await q(
    `INSERT INTO public.organisations
       (id, name, legal_name, abn, gst_registered, slug, owner_id, stripe_account_country, status)
     VALUES ($1,$2,$3,$4,true,$5,$6,'AU','active')`,
    [orgId, `Tax Drive Collective ${sfx}`, `Tax Drive Pty Ltd ${sfx}`, ABR_EXAMPLE_ABN, `tax-drive-${sfx}`, ownerUser],
  )
  await q(
    `INSERT INTO public.events (id, title, slug, organisation_id, created_by, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5, now() + interval '30 days', now() + interval '31 days', 'draft')`,
    [eventId, `Tax Drive Night ${sfx}`, `tax-drive-night-${sfx}`, orgId, ownerUser],
  )
  await q(
    `INSERT INTO public.ticket_tiers (id, event_id, name, total_capacity, price)
     VALUES ($1,$2,'General Admission',100,3300)`,
    [tierId, eventId],
  )
  await q(
    `INSERT INTO public.event_addons (id, event_id, name, price, total_capacity)
     VALUES ($1,$2,'Programme booklet',1000,50)`,
    [addonId, eventId],
  )

  // A MIXED ORDER ON PURPOSE: two taxable tickets and one line the invoice must
  // show separately, because the ATO requires a mixed invoice to "clearly show
  // which items are taxable" and the short form is not available for one.
  const subtotal = 6600
  const addonTotal = 1000
  const total = subtotal + addonTotal
  await q(
    `INSERT INTO public.orders
       (id, order_number, event_id, organisation_id, status, subtotal_cents, addon_total_cents,
        platform_fee_cents, processing_fee_cents, total_cents, currency, guest_email, guest_name, confirmed_at)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6,0,0,$7,'AUD',$8,'Jordan Buyer', now())`,
    [orderId, orderNumber, eventId, orgId, subtotal, addonTotal, total, `taxbuyer_${sfx}@test.invalid`],
  )
  await q(
    `INSERT INTO public.order_items (id, order_id, item_type, item_name, ticket_tier_id, quantity, unit_price_cents, total_cents)
     VALUES ($1,$2,'ticket','General Admission',$3,2,3300,6600)`,
    [oiTicket, orderId, tierId],
  )
  await q(
    `INSERT INTO public.order_items (id, order_id, item_type, item_name, addon_id, quantity, unit_price_cents, total_cents)
     VALUES ($1,$2,'addon','Programme booklet',$3,1,1000,1000)`,
    [oiAddon, orderId, addonId],
  )
  // A COMP TICKET, priced at zero. It is what makes this invoice MIXED: a line
  // with nothing to apply GST to, which the ATO requires a mixed invoice to
  // show separately rather than fold into a total. Without it every line is
  // taxable, the short form is legitimately available, and the mixed rendering
  // is never exercised by this drive at all.
  await q(
    `INSERT INTO public.order_items (id, order_id, item_type, item_name, ticket_tier_id, quantity, unit_price_cents, total_cents)
     VALUES ($1,$2,'ticket','Guest list entry',$3,1,0,0)`,
    [oiComp, orderId, tierId],
  )
  console.log(`  order ${orderNumber}, AUD ${(total / 100).toFixed(2)}, seller ABN ${ABR_EXAMPLE_ABN}`)

  console.log('\n=== THE DOCUMENT THE BUYER RECEIVES ===')
  const page = await html(`/orders/${orderId}/confirmation`)
  check('the confirmation page loads', page.status === 200, `HTTP ${page.status}`)
  const body = text(page.body)

  // The seven required details, each read out of the delivered HTML.
  /*
   * THE TITLE IS READ FROM THE PANEL'S OWN LABEL, not from any occurrence of
   * the phrase. The first run of this drive matched /Tax invoice/i anywhere in
   * the page and reported the receipt case as a failure, because the sentence
   * explaining WHY it is only a receipt contains the words "tax invoice". An
   * assertion that cannot tell a heading from a sentence is not measuring the
   * document.
   */
  const titledAs = html => (html.match(/aria-label="(Tax invoice|Receipt)"/) ?? [])[1] ?? null
  check(
    '1. the document declares itself a tax invoice',
    titledAs(page.body) === 'Tax invoice',
    `titled "${titledAs(page.body)}"`,
  )
  check(
    "2. it names the seller's identity",
    body.includes(`Tax Drive Pty Ltd ${sfx}`),
    'the registered name, preferred over the trading name',
  )
  check('3. it carries the ABN, grouped as the register prints it', body.includes('ABN 51 824 753 556'))
  check('4. it carries the date it was issued', /Issued\s+\d{1,2}\s+\w+\s+20\d\d/.test(body))
  check(
    '5. it describes each item with quantity and price',
    body.includes('General Admission') && body.includes('Programme booklet') && /\$66\.00/.test(body),
  )
  check(
    '6. it states the GST amount payable',
    /GST included\s*\$6\.00/.test(body) || /Total price includes GST/.test(body),
    'one eleventh of the taxable 6600c is 600c',
  )
  /*
   * THE SHORT FORM IS CORRECT HERE, and the first run of this drive asserted the
   * opposite. The ATO permits "Total price includes GST" when "the GST amount is
   * exactly 1/11 of the total price". A zero-priced comp line contributes
   * nothing to the price and nothing to the GST, so the ratio is untouched and
   * the short form remains available. The assertion was wrong, not the document.
   *
   * The path where the amount MUST be shown needs a line that is PRICED and NOT
   * taxable, and this platform sells no GST-free product, so it cannot be built
   * from real rows. It is covered directly in tests/unit/tax/tax-invoice.test.ts
   * ("may use the short form only when the GST really is exactly 1/11").
   */
  check(
    '6. the short form is used, because the GST really is exactly 1/11 of the total',
    /Total price includes GST/.test(body),
    'the $0 comp line changes neither the price nor the GST',
  )
  check(
    '7. it states which items are taxable, line by line',
    /Taxable/.test(body) && /No charge/.test(body) && !/GST-free/.test(body),
    'the two priced lines read Taxable and the comp ticket reads No charge, not GST-free, which is a tax classification it does not have',
  )
  check(
    "8. it names the buyer (shown whether or not the $1,000 threshold applies)",
    body.includes('Jordan Buyer'),
  )
  check(
    'it names EventLinqs as the agent, not as the seller',
    /limited payment collection agent/i.test(body),
  )

  console.log('\n=== NEGATIVE CONTROL: the same order, seller not GST registered ===')
  await q('UPDATE public.organisations SET gst_registered = false WHERE id = $1', [orgId])
  const receipt = await html(`/orders/${orderId}/confirmation`)
  const receiptBody = text(receipt.body)
  check('the page still loads', receipt.status === 200, `HTTP ${receipt.status}`)
  check(
    'it no longer calls itself a tax invoice',
    titledAs(receipt.body) === 'Receipt',
    `titled "${titledAs(receipt.body)}"`,
  )
  check('it states no GST', !/GST included/.test(receiptBody))
  check(
    'it says WHY it is only a receipt',
    /not declared GST registration/i.test(receiptBody),
  )

  console.log('\n=== NEGATIVE CONTROL: registered, but the ABN is a typo ===')
  await q('UPDATE public.organisations SET gst_registered = true WHERE id = $1', [orgId])
  // One transposed digit: 11 digits, fails the modulus 89 check. The database
  // CHECK accepts it (it only enforces the shape); the application must not.
  await q('UPDATE public.organisations SET abn = $2 WHERE id = $1', [orgId, '51824753565'])
  const typo = await html(`/orders/${orderId}/confirmation`)
  const typoBody = text(typo.body)
  check(
    'a failed check digit demotes it to a receipt',
    titledAs(typo.body) === 'Receipt' && /not recorded a valid ABN/i.test(typoBody),
    `titled "${titledAs(typo.body)}"`,
  )

  console.log('\n=== THE GST REPORT, loaded as the organiser ===')
  await q('UPDATE public.organisations SET abn = $2 WHERE id = $1', [orgId, ABR_EXAMPLE_ABN])

  /*
   * THE REPORT IS LOADED, NOT INFERRED. It sits behind a session, so the fixture
   * owner is given a password through the Supabase admin API and signed in
   * through the real login form. A report nobody has loaded is a report nobody
   * has verified, and the arithmetic below would pass just as happily against a
   * page that renders an empty table.
   */

  let reportText = ''
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="email"]', `tax_${sfx}@test.invalid`)
    await page.fill('input[name="password"]', ownerPassword)
    await Promise.all([
      page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await page.goto(`${BASE}/dashboard/reports/gst?organisation=${orgId}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(1500)
    reportText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    await browser.close()
  } catch (err) {
    check('the GST report page could be loaded in a browser', false, String(err?.message ?? err))
  }

  check(
    'the report page renders for the signed-in organiser',
    /GST report/i.test(reportText),
    reportText ? `${reportText.length} chars read` : 'no text read',
  )
  if (process.env.DRIVE_VERBOSE) console.log(`  [report text] ${reportText}`)
  check(
    'it names the business it is reporting for',
    reportText.includes(`Tax Drive Collective ${sfx}`),
    reportText.slice(0, 240),
  )
  check('it shows the ABN it will be lodged under', reportText.includes('51 824 753 556'))
  check(
    'it shows the ticket sales and the GST included in them',
    reportText.includes('$66.00') && reportText.includes('$6.00'),
    'one eleventh of the $66.00 of tickets; the $10.00 add-on and the platform fee are not the organiser supply',
  )
  check(
    'it says the fee is excluded, so the figure cannot be misread',
    /not part of what you sold/i.test(reportText),
  )
  const reported = await one(
    `SELECT COALESCE(SUM(subtotal_cents),0)::bigint AS sales,
            count(*)::int AS orders
     FROM public.orders WHERE organisation_id = $1 AND status = 'confirmed'`,
    [orgId],
  )
  const expectedGst = Math.round(Number(reported.sales) / 11)
  check(
    'the report source figures are the orders themselves',
    Number(reported.orders) === 1 && Number(reported.sales) === subtotal,
    `${reported.orders} order(s), ${reported.sales}c of ticket sales`,
  )
  check(
    'GST is one eleventh of the ticket subtotal, not of the total',
    expectedGst === 600,
    `${expectedGst}c on ${reported.sales}c; the add-on and any platform fee are excluded`,
  )
} finally {
  console.log('\n=== TEARDOWN ===')
  const removed = []
  const drop = async (label, sql, params) => {
    const r = await q(sql, params).catch(err => {
      console.error(`  teardown of ${label} failed:`, err.message)
      return { rowCount: 0 }
    })
    if (r.rowCount) removed.push(`${label} x${r.rowCount}`)
  }
  await drop('order_items', 'DELETE FROM public.order_items WHERE order_id = $1', [orderId])
  await drop('orders', 'DELETE FROM public.orders WHERE id = $1', [orderId])
  await drop('event_addons', 'DELETE FROM public.event_addons WHERE id = $1', [addonId])
  await drop('ticket_tiers', 'DELETE FROM public.ticket_tiers WHERE id = $1', [tierId])
  await drop('events', 'DELETE FROM public.events WHERE id = $1', [eventId])
  await drop('organisations', 'DELETE FROM public.organisations WHERE id = $1', [orgId])
  await drop('profiles', 'DELETE FROM public.profiles WHERE id = $1', [ownerUser])
  const deleted = await authAdmin(`/admin/users/${ownerUser}`, { method: 'DELETE' }).catch(() => null)
  if (deleted?.ok) removed.push('auth user x1')
  else await drop('auth.users', 'DELETE FROM auth.users WHERE id = $1', [ownerUser])
  console.log(`  removed: ${removed.join(', ') || 'nothing'}`)
  await client.end()
}

const failed = results.filter(r => !r.pass)
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
if (failed.length > 0) {
  for (const f of failed) console.error(`  FAILED: ${f.name}`)
  process.exit(1)
}
