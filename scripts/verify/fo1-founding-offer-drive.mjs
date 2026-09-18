/**
 * FO1 DRIVEN PROOF. The Founding Organiser offer, exercised through the same
 * interface a person uses, at 390, 768 and 1440.
 *
 * WHAT IT DRIVES, in order, and which acceptance line each one answers.
 *
 *   1. The owner signs in at the real /admin/login and GRANTS founding terms to
 *      a live organisation from /admin/network.                (acceptance 3)
 *   2. A guest opens that organiser's event page and their profile: the words
 *      "Founding Organiser" are there. A DIFFERENT organiser's event page and
 *      profile: the words are not.                             (acceptance 4)
 *   3. The guest takes a ticket on the founding organiser's paid event: the
 *      service fee reads zero and the total equals the face value, at all three
 *      widths.                                                 (acceptance 2)
 *   4. The owner EXTENDS: the window moves by exactly the referral grant.
 *   5. The owner REVOKES: the same guest, on the same event, is shown the
 *      standard fee again on the very next view, with no deploy.
 *                                                              (acceptance 3)
 *
 * WHAT IT DOES NOT DRIVE, and where that went instead. This drive stops at the
 * order row and does not take a card.
 *
 * IT USED TO SAY A CARD PAYMENT COULD NOT BE COMPLETED ON THIS MACHINE AT ALL,
 * and that was wrong. `.env.local`'s STRIPE_SECRET_KEY is empty and its
 * publishable key belongs to a different account, both true, and the conclusion
 * still did not follow: the publishable key is not fixed, so a server can be
 * started to match the key the Stripe CLI holds rather than the other way round.
 * `scripts/dev/lane-b-serve-with-stripe.mjs` starts one and
 * `fo1-founding-purchase-drive.mjs` sells a ticket through it for card 4242. The
 * stale sentence is replaced rather than deleted, because a claim that shaped a
 * Law 10 verdict should be seen to have been withdrawn.
 *
 * The referral credit, which needs a confirmed paid order, is still proved
 * against the database by fo1-founding-database-proof.mjs, which is honest about
 * being a database proof rather than a browser one.
 *
 * IT LEAVES TEST AS IT FOUND IT. The organisation it grants terms to is a
 * shared fixture, so the revoke is not merely the last step of the drive, it is
 * a `finally`. Any reservation the drive takes is expired through the product's
 * own sweep before it exits.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/fo1-founding-offer-drive.mjs --out C:/dev/EVIDENCE/FO1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE, messagesOnScreen } from '../journeys/harness.mjs'
import { chooseFoundingDriveTarget } from './lib/fo1-founding-admin.mjs'
import { buildFixture } from './lib/refund-proof-fixture.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
const failures = []
const border = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

/* ------------------------------------------------------ enumerate, never guess */

/**
 * The target is READ OUT OF THE DATABASE, never typed. It is the live, published,
 * public, future, PAID event whose organiser can actually sell and which has
 * places left, which is the only shape a buyer can reach.
 */
async function pickTargets() {
  const { data: events, error } = await db
    .from('events')
    .select(
      'id, slug, title, organisation_id, status, visibility, start_date, ' +
        'organisation:organisations!inner(id, slug, name, status, stripe_charges_enabled, is_founding, founding_fee_free_until), ' +
        'ticket_tiers(id, price, currency, total_capacity, sold_count, reserved_count)',
    )
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .limit(200)
  if (error) throw new Error(`could not enumerate events: ${error.message}`)

  const sellablePaid = (events ?? []).filter(e => {
    const org = e.organisation
    if (!org || org.status !== 'active' || org.stripe_charges_enabled !== true) return false
    const paid = (e.ticket_tiers ?? []).filter(t => Number(t.price) > 0)
    if (paid.length === 0) return false
    const free = paid.reduce(
      (n, t) => n + (Number(t.total_capacity) - Number(t.sold_count) - Number(t.reserved_count)),
      0,
    )
    return free > 1
  })

  /*
   * LANE B ONLY, AND THE RULE IS NOT A TIDINESS ONE.
   *
   * 14 September 2026, found by arming a drill and reading what this function
   * actually returns. Three lanes share TEST vkapkibzokmfaxqogypq and the
   * standing rule is that a lane never edits a row tagged for another lane.
   * This function enumerated every sellable paid event and took the first, and
   * on the day it was read the first fourteen were:
   *
   *     8 x Refund Proof Presents ...     lane A's refund fixtures
   *     4 x Northside Sound lane-c ...    lane C's fixtures
   *     2 x Lane B FO1 Founding ...       lane B's own
   *
   * So this drive, whose whole purpose is to GRANT and REVOKE founding terms,
   * was granting and revoking them on other lanes' rows. Filtering only for
   * "not already founding" does not fix it: that merely moves the pick from
   * lane A's fixture to lane C's.
   *
   * It is worse than an etiquette breach because a founding window makes the
   * platform fee zero, and a zero keep is refused at the payment step today
   * (the BORDER in REVIEW-QUEUE-B.md). A window left on another lane's charge
   * fixture makes that lane's proof fail for a reason that is not in its tree.
   *
   * So the drive uses its OWN lane-B rows and nothing else: an existing lane-B
   * fixture when one is there, and one it builds when none is, through the same
   * shared builder the purchase drive uses. Never a row it did not make.
   */
  const laneB = sellablePaid.filter(e => isLaneB(e.organisation))
  const chosen = chooseFoundingDriveTarget(laneB)
  const standard = laneB.filter(e => e.organisation?.founding_fee_free_until == null)
  return { chosen, laneB, standard }
}

/** A row says on sight whose it is, or it is not this drive's to touch. */
function isLaneB(org) {
  return /lane-b/i.test(`${org?.name ?? ''} ${org?.slug ?? ''}`)
}

/**
 * The target and the control, both lane B's own, building them when TEST holds
 * none. Returns the fixtures it built so the run can say what it made.
 */
async function ensureTargets() {
  /*
   * THE CONTROL MUST START STANDARD TOO, and the first version of this function
   * only required it of the TARGET. The control exists to prove the words
   * "Founding Organiser" are ABSENT for an organiser who is not one, so a
   * control that already holds a window fails that check while the product is
   * behaving perfectly. It did, on all three viewports, on the run that found
   * it: the control was lane-b-mu0uyeif, fee free until March 2027, and the
   * page was right to say so.
   */
  const first = await pickTargets()
  if (first.standard.length >= 2) {
    return { target: first.standard[0], control: first.standard[1], built: [] }
  }

  const built = []
  const need = 2 - first.standard.length
  for (let i = 0; i < need; i += 1) {
    const stamp = `lane-b-${Date.now().toString(36)}${i}`
    built.push(await buildFixture(db, {
      stamp,
      ownerEmail: `lane-b-fo1-offer-owner-${stamp}@eventlinqs.test`,
      password: `${stamp}-Aa1!`,
      capacity: 12,
      priceCents: 2500,
      log: m => console.log(`  fixture: ${m}`),
      brand: {
        org: 'Lane B FO1 Offer',
        orgSlug: 'lane-b-fo1-offer',
        event: 'Lane B FO1 Offer Night',
        eventSlug: 'lane-b-fo1-offer-night',
        owner: 'Lane B FO1 Offer Owner',
      },
    }))
  }

  const again = await pickTargets()
  if (again.chosen.reason) throw new Error(again.chosen.reason)
  if (again.standard.length < 2) {
    throw new Error(
      `built ${built.length} lane-B fixture(s) and TEST still shows only ${again.standard.length} standard ` +
        `lane-B sellable event(s). This drive needs two: one to grant a window to and one to prove the ` +
        `words are absent without one.`,
    )
  }
  return { target: again.standard[0], control: again.standard[1], built }
}

/* ---------------------------------------------------------- the owner's login */

const adminEmail = `lane-b-fo1-admin-${Date.now().toString(36)}@eventlinqs.test`
const adminPassword = `${randomUUID()}Aa1`
let adminUserId = null

async function createAdmin() {
  const created = await db.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })
  if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
  adminUserId = created.data.user.id
  await db.from('profiles').upsert({ id: adminUserId, email: adminEmail, full_name: 'Lane B FO1 Proof' })
  const { error } = await db
    .from('admin_users')
    .insert({ id: adminUserId, role: 'super_admin', display_name: 'Lane B FO1 Proof' })
  if (error) throw new Error(`admin_users insert: ${error.message}`)
}

async function signInAsOwner(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ])
  await page.waitForTimeout(2500)
  return !new URL(page.url()).pathname.endsWith('/admin/login')
}

/**
 * Presses one of Grant, Extend or Revoke on the row for `orgName`, through the
 * real screen, and reads back what the screen then says.
 */
async function pressFoundingTerm(page, orgName, label, shotPath) {
  // Found through the screen's own search, the way the owner finds one of two
  // hundred and fifty organisations.
  await page.goto(`${BASE}/admin/network?org=${encodeURIComponent(orgName)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(2500)
  const row = page.locator('li', { hasText: orgName }).first()
  if ((await row.count()) === 0) return { ok: false, message: `no row for ${orgName} on /admin/network` }
  await row.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(4000)
  const text = (await row.innerText().catch(() => '')) || ''
  if (shotPath) await page.screenshot({ path: shotPath, fullPage: false })
  return { ok: true, message: text.replace(/\s+/g, ' ').slice(0, 200) }
}

/* -------------------------------------------------------------- the buyer's view */

/** Opens the event, takes one ticket, and reads the money the selector shows. */
async function readSelectorMoney(page, slug, shotPrefix) {
  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(3500)

  const badgeVisible = await page.getByText('Founding Organiser', { exact: false }).first().isVisible().catch(() => false)
  await page.screenshot({ path: `${shotPrefix}-event-page.png`, fullPage: false })

  for (const el of await page.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/^(get tickets|buy tickets|select tickets)/i.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      break
    }
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

  const money = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')]
      .filter(d => d.children.length === 2 && /Subtotal|Service fee|^Total$/.test(d.children[0]?.textContent?.trim() ?? ''))
      .map(d => [d.children[0].textContent.trim(), d.children[1].textContent.trim()])
    const total = document.querySelector('[data-order-total]')?.textContent?.trim() ?? null
    return { rows, total }
  })
  await page.screenshot({ path: `${shotPrefix}-ticket-selector.png`, fullPage: false })
  return { badgeVisible, ...money }
}

function lineValue(money, label) {
  const row = money.rows.find(r => r[0] === label)
  return row ? row[1] : null
}

/**
 * The money a person actually reads, in cents.
 *
 * "Free" is how the selector renders zero, and it means zero. Treating it as
 * unreadable made the first run of this drive report a failure against a screen
 * that was correct, which is the harness indicting the product for the
 * harness's own vocabulary.
 */
function centsFromLabel(text) {
  if (!text) return null
  if (/^free$/i.test(text.trim())) return 0
  const m = text.replace(/[^0-9.]/g, '')
  if (!m) return null
  return Math.round(Number(m) * 100)
}

/**
 * Takes the buyer from the selector to the moment the ORDER ROW IS WRITTEN.
 *
 * The checkout action prices the cart, inserts the order, and only then asks the
 * payment gateway for an intent. Against a server started without a Stripe
 * secret key the gateway call fails and the buyer is shown "Payment system
 * error"; against one started WITH the key, a founding organiser's charge is
 * refused a step later by `assertOrganiserCanReceiveFunds`, which cannot tell a
 * deliberate fee waiver from a pricing table that returned nothing. Either way
 * the ORDER IS ALREADY ON THE TABLE, carrying the fee the calculator resolved
 * and the amount the founding waiver took off it, which is exactly what FO1 asks
 * the ledger to record.
 *
 * So this proves the ledger through the product's own path and does not pretend
 * to be a completed purchase. The completed purchase lives in
 * `fo1-founding-purchase-drive.mjs`, which takes a real card and reports what
 * the screen says when the charge is refused.
 */
async function reachOrderRow(page, slug, buyerEmail, shotPrefix) {
  const clickAny = async rx => {
    for (const el of await page.$$('button, a')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (rx.test(t) && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {})
        return true
      }
    }
    return false
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

  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(3500)
  await clickAny(/^(get tickets|buy tickets|select tickets)/i)
  await page.waitForTimeout(2500)
  for (const b of await page.$$('button')) {
    const t = ((await b.innerText().catch(() => '')) || '').trim()
    if (t === '+') {
      await b.click().catch(() => {})
      break
    }
  }
  await page.waitForTimeout(2000)
  /*
   * THE CHECKOUT BUTTON IS CLICKED THROUGH A LOCATOR, NOT THE SWALLOWING LOOP.
   *
   * The loop above reports success on the first element whose TEXT matches and
   * catches whatever the click then throws. A locator scrolls to the control,
   * and the navigation is WAITED FOR, so a failure to move is a failure here
   * rather than a missing order row two steps later that reads as a product
   * fault. This drive spent three runs on exactly that, because the regex it
   * was handed carried a literal backspace where a word boundary was meant.
   */
  const checkoutButton = page.getByRole('button', { name: /^checkout/i }).first()
  await checkoutButton.scrollIntoViewIfNeeded().catch(() => {})
  await checkoutButton.click({ timeout: 30000 }).catch(() => {})
  await page.waitForURL(u => u.pathname.startsWith('/checkout/'), { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${shotPrefix}-checkout.png`, fullPage: false })

  await byLabel(/full name/i, 'Lane B FO1 Buyer')
  await byLabel(/^email/i, buyerEmail)
  await page.waitForTimeout(800)
  await clickAny(/use my details for all tickets/i)
  await page.waitForTimeout(1200)
  await clickAny(/^continue to payment/i)
  await page.waitForTimeout(12000)
  await page.screenshot({ path: `${shotPrefix}-order-written.png`, fullPage: false })
  return { path: page.url().replace(BASE, ''), messages: await messagesOnScreen(page) }
}

/* --------------------------------------------------------------------- the run */

let browser = null
let target = null
let granted = false
/*
 * WHAT THE ORGANISATION HELD BEFORE THE DRIVE TOUCHED IT, read once and kept
 * out here so the `finally` can put it back. "Left as found" is a claim about
 * the state at the start, so a teardown that cannot see that state cannot make
 * the claim, and the version that revoked unconditionally made it anyway.
 */
let before = null

try {
  const picked = await ensureTargets()
  target = picked.target
  const control = picked.control
  console.log(`target event  ${target.slug} (${target.organisation.name})`)
  console.log(`control event ${control.slug} (${control.organisation.name})`)
  if (picked.built.length) console.log(`built ${picked.built.length} lane-B fixture(s) because TEST held too few`)
  check(
    'fo1.setup.both-rows-are-lane-b',
    isLaneB(target.organisation) && isLaneB(control.organisation),
    `target ${target.organisation.slug}, control ${control.organisation.slug}`,
  )

  before = {
    is_founding: target.organisation.is_founding,
    founding_fee_free_until: target.organisation.founding_fee_free_until,
  }
  check(
    'fo1.setup.target-starts-standard',
    before.founding_fee_free_until === null,
    `${target.organisation.name} holds no founding window before the drive (${String(before.founding_fee_free_until)})`,
  )

  await createAdmin()
  browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const owner = await context.newPage()

    check(`fo1.${vp.label}.owner-signed-in`, await signInAsOwner(owner), 'the owner reached the admin console through /admin/login')

    // 1. GRANT, through the screen.
    const grant = await pressFoundingTerm(
      owner,
      target.organisation.name,
      'Grant',
      join(out, `${vp.label}-01-admin-grant.png`),
    )
    granted = true
    check(
      `fo1.${vp.label}.grant`,
      grant.ok && /Fee free until \d/.test(grant.message),
      grant.message,
    )

    // 2. The guest, in a separate context with no admin session at all.
    const guestContext = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const guest = await guestContext.newPage()

    const waived = await readSelectorMoney(guest, target.slug, join(out, `${vp.label}-02-founding`))
    check(`fo1.${vp.label}.badge-on-event-page`, waived.badgeVisible, 'the event page carries the words Founding Organiser')

    const subtotal = centsFromLabel(lineValue(waived, 'Subtotal'))
    const serviceFee = centsFromLabel(lineValue(waived, 'Service fee'))
    const total = centsFromLabel(waived.total)
    check(
      `fo1.${vp.label}.no-service-fee`,
      serviceFee === 0,
      `service fee reads ${lineValue(waived, 'Service fee') ?? 'NOTHING'} for a founding organiser (parsed as ${serviceFee} cents)`,
    )
    check(
      `fo1.${vp.label}.total-equals-face-value`,
      subtotal !== null && total !== null && subtotal === total,
      `subtotal ${waived.rows.find(r => r[0] === 'Subtotal')?.[1] ?? '?'} vs total ${waived.total ?? '?'}`,
    )

    // The organiser's own profile.
    await guest.goto(`${BASE}/organisers/${target.organisation.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await guest.waitForTimeout(2500)
    const profileBadge = await guest.getByText('Founding Organiser', { exact: false }).first().isVisible().catch(() => false)
    await guest.screenshot({ path: join(out, `${vp.label}-03-organiser-profile.png`), fullPage: false })
    check(`fo1.${vp.label}.badge-on-organiser-profile`, profileBadge, 'the organiser profile carries the words Founding Organiser')

    // And a STANDARD organiser, where the words must not appear.
    await guest.goto(`${BASE}/organisers/${control.organisation.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await guest.waitForTimeout(2000)
    const controlProfileBadge = await guest
      .getByText('Founding Organiser', { exact: false })
      .first()
      .isVisible()
      .catch(() => false)
    await guest.screenshot({ path: join(out, `${vp.label}-04-standard-organiser.png`), fullPage: false })
    check(
      `fo1.${vp.label}.no-badge-for-standard-organiser`,
      controlProfileBadge === false,
      `${control.organisation.name} does not carry the words`,
    )

    await guest.goto(`${BASE}/events/${control.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await guest.waitForTimeout(2500)
    const controlEventBadge = await guest
      .getByText('Founding Organiser', { exact: false })
      .first()
      .isVisible()
      .catch(() => false)
    await guest.screenshot({ path: join(out, `${vp.label}-05-standard-event.png`), fullPage: false })
    check(
      `fo1.${vp.label}.no-badge-on-standard-event`,
      controlEventBadge === false,
      `${control.slug} does not carry the words`,
    )

    // 3. THE LEDGER. Once, at desktop, because it writes a real order row and one
    //    is enough to prove what the column holds.
    if (vp.label === 'desktop-1440') {
      const buyerEmail = `lane-b-fo1-waived-${Date.now().toString(36)}@eventlinqs.test`
      // A FRESH page. The guest page above has already been through the selector
      // twice and round two other surfaces; the first run of this step clicked
      // Checkout on that worn page and went nowhere, which indicted the product
      // for the harness re-using a tab.
      const buyer = await guestContext.newPage()
      const landed = await reachOrderRow(buyer, target.slug, buyerEmail, join(out, `${vp.label}-09-ledger`))
      const { data: order } = await db
        .from('orders')
        .select('order_number, status, subtotal_cents, platform_fee_cents, founding_fee_waived_cents, total_cents')
        .eq('guest_email', buyerEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      check(
        `fo1.${vp.label}.order-row-written`,
        Boolean(order),
        `the checkout wrote an order row (${landed.path}); ${order?.order_number ?? 'NONE'}`,
      )
      if (order) {
        check(
          `fo1.${vp.label}.ledger-carries-the-waived-amount`,
          Number(order.platform_fee_cents) === 0 && Number(order.founding_fee_waived_cents) > 0,
          `platform fee charged ${order.platform_fee_cents}, waived ${order.founding_fee_waived_cents}, subtotal ${order.subtotal_cents}, total ${order.total_cents}`,
        )
        check(
          `fo1.${vp.label}.buyer-paid-face-value`,
          Number(order.total_cents) === Number(order.subtotal_cents),
          `total ${order.total_cents} against a subtotal of ${order.subtotal_cents}`,
        )
      }

      /*
       * AND WHAT THE BUYER IS THEN TOLD, recorded rather than swallowed.
       *
       * The charge precondition in src/lib/payments/application-fee.ts refuses a
       * composed platform fee of zero, and a Founding Organiser's platform fee
       * is zero BY DESIGN, so the sale is refused after the order is written.
       * That file is lane A's territory and FO1 names this exact boundary, so
       * lane B stopped at it and wrote the BORDER line in REVIEW-QUEUE-B.md
       * rather than reaching across. This is here so the drive's own report
       * carries the finding instead of leaving it to a paragraph somebody has to
       * go and read.
       */
      border.push({
        where: 'src/lib/payments/application-fee.ts (assertOrganiserCanReceiveFunds)',
        what: 'refuses a composed platform fee of zero, which is exactly what a Founding Organiser has',
        buyerIsTold: landed.messages,
        landedOn: landed.path,
      })
      console.log(`BORDER  the sale is refused after the order is written: ${landed.messages.join(' // ') || 'no message'}`)
      await buyer.close()
    }

    // 4. EXTEND, and the date moves.
    const extend = await pressFoundingTerm(
      owner,
      target.organisation.name,
      'Extend',
      join(out, `${vp.label}-06-admin-extend.png`),
    )
    check(`fo1.${vp.label}.extend`, extend.ok && /Fee free until \d/.test(extend.message), extend.message)

    // 5. REVOKE, and the SAME guest sees the standard fee again on the next view.
    const revoke = await pressFoundingTerm(
      owner,
      target.organisation.name,
      'Revoke',
      join(out, `${vp.label}-07-admin-revoke.png`),
    )
    granted = false
    check(`fo1.${vp.label}.revoke`, revoke.ok && /Window cleared/.test(revoke.message), revoke.message)

    const afterRevoke = await readSelectorMoney(guest, target.slug, join(out, `${vp.label}-08-after-revoke`))
    const feeBack = centsFromLabel(lineValue(afterRevoke, 'Service fee'))
    check(
      `fo1.${vp.label}.fee-returns-without-a-deploy`,
      feeBack !== null && feeBack > 0,
      `service fee reads ${lineValue(afterRevoke, 'Service fee') ?? 'NOTHING'} on the next view after the revoke`,
    )
    check(
      `fo1.${vp.label}.badge-gone-after-revoke`,
      afterRevoke.badgeVisible === false,
      'the words Founding Organiser are gone once the terms are revoked',
    )

    const noise = await messagesOnScreen(guest)
    check(`fo1.${vp.label}.no-refusal-on-screen`, noise.every(m => !/error|failed|something went wrong/i.test(m)), noise.join(' // ') || 'nothing')

    await guestContext.close()
    await context.close()
  }
} catch (error) {
  failures.push(`drive threw: ${String(error?.message ?? error)}`)
  console.error(error)
} finally {
  /*
   * LEAVE TEST AS IT WAS FOUND, AND "AS FOUND" MEANS `before`, NOT "standard".
   * The previous version revoked unconditionally and then asserted the window
   * was gone, which is the same sentence for two different outcomes: restoring
   * an organisation that started standard, and DESTROYING one that did not.
   * The target filter above should now make the second impossible, and this is
   * the second lock on it, because a precondition and a teardown that disagree
   * is how the first one got through.
   */
  if (target && before) {
    const restore = before.founding_fee_free_until === null
      ? { p_org_id: target.organisation_id, p_until: null, p_override: false, p_membership: 'revoke' }
      : { p_org_id: target.organisation_id, p_until: before.founding_fee_free_until, p_override: true, p_membership: 'grant' }
    await db.rpc('admin_set_founding_waiver', restore)
    const { data: after } = await db
      .from('organisations')
      .select('is_founding, founding_fee_free_until')
      .eq('id', target.organisation_id)
      .maybeSingle()
    const same =
      String(after?.founding_fee_free_until ?? null) === String(before.founding_fee_free_until ?? null) &&
      Boolean(after?.is_founding) === Boolean(before.is_founding)
    check(
      'fo1.teardown.left-as-found',
      same,
      `${target.organisation.name}: found is_founding=${before.is_founding} window=${String(before.founding_fee_free_until)}, ` +
        `left is_founding=${after?.is_founding} window=${String(after?.founding_fee_free_until)} (granted during the run: ${granted})`,
    )
  }
  // The drive took holds on the only paid event on TEST. Nothing on TEST expires
  // them on a timer, so it expires its own through the product's own sweep.
  try {
    await db.rpc('expire_stale_reservations')
  } catch (sweepError) {
    // Housekeeping must not hide the drive's verdict, and it must not vanish
    // either: an unexpired hold is inventory the next run cannot buy.
    console.warn(`[fo1-drive] the reservation sweep failed: ${String(sweepError?.message ?? sweepError)}`)
  }
  if (adminUserId) {
    await db.from('admin_users').delete().eq('id', adminUserId)
    await db.auth.admin.deleteUser(adminUserId).catch(() => {})
  }
  if (browser) await browser.close()
}

writeFileSync(
  join(out, 'fo1-drive-report.json'),
  JSON.stringify({ base: BASE, when: new Date().toISOString(), checks, failures, border }, null, 2),
)
console.log(`\n${checks.filter(c => c.ok).length} of ${checks.length} checks passed`)
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log('PASS - the founding offer behaves as the page promises, at 390, 768 and 1440.')
