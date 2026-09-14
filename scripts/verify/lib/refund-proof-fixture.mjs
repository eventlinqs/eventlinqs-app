/**
 * Shared fixture + purchase driver for the refund proofs.
 *
 * Extracted so the dashboard proof (refund-dashboard-e2e.mjs) and the orphan
 * inventory drill (refund-orphan-inventory-drill.mjs) build the SAME fixture and
 * drive the SAME checkout. Two copies of a checkout driver drift, and then a
 * failure in one is impossible to compare against a pass in the other.
 *
 * TEST ONLY. Callers must have already run assertNotProduction().
 */

/**
 * Remove refund-proof fixtures INCLUDING the ones carrying orders, in the order
 * the foreign keys allow. Used by `--cleanup`, never by a proof run.
 *
 * WHY THE ORDER IS WRITTEN OUT RATHER THAN LEFT TO CASCADE. tickets and
 * refund_tickets reference each other's parents with ON DELETE RESTRICT, so
 * deleting an event first fails with 23503 and leaves half a fixture behind, which
 * is worse than leaving all of it. Children first, parents last, every time.
 *
 * It is scoped by the `refund-proof-presents-%` slug, so it can only ever reach
 * fixtures this harness created. It cannot touch a seeded or real organisation.
 */
export async function purgeFixtures(db, log = () => {}) {
  const { data: orgs } = await db
    .from('organisations')
    .select('id, owner_id, slug')
    .like('slug', 'refund-proof-presents-%')

  /**
   * EVERY DELETE IS CHECKED. The first version of this function ignored the error
   * field on each call and then reported "removed 4 fixture(s); 4 remaining",
   * which is a function claiming success while the rows were all still there. A
   * cleanup that cannot fail loudly is worse than no cleanup, because the next
   * person believes the database is clean.
   */
  const errors = []
  const del = async (label, builder) => {
    const { error } = await builder
    if (error) errors.push(`${label}: ${error.code} ${error.message}`)
  }

  let removed = 0
  for (const org of orgs ?? []) {
    const { data: events } = await db.from('events').select('id').eq('organisation_id', org.id)
    const eventIds = (events ?? []).map(e => e.id)

    let orderIds = []
    if (eventIds.length) {
      const { data: orders } = await db.from('orders').select('id').in('event_id', eventIds)
      orderIds = (orders ?? []).map(o => o.id)
    }

    if (orderIds.length) {
      // refund_tickets holds ON DELETE RESTRICT on tickets, so its rows go first,
      // and its parent refunds rows go before the order they belong to.
      const { data: refunds } = await db.from('refunds').select('id').in('order_id', orderIds)
      const refundIds = (refunds ?? []).map(r => r.id)
      if (refundIds.length) await del('refund_tickets', db.from('refund_tickets').delete().in('refund_id', refundIds))
      await del('tickets', db.from('tickets').delete().in('order_id', orderIds))
      if (refundIds.length) await del('refunds', db.from('refunds').delete().in('id', refundIds))
      await del('payments', db.from('payments').delete().in('order_id', orderIds))
      await del('order_items', db.from('order_items').delete().in('order_id', orderIds))
      await del('orders', db.from('orders').delete().in('id', orderIds))
    }

    // Money-side rows hang off the organisation rather than the order.
    await del('organiser_balance_ledger', db.from('organiser_balance_ledger').delete().eq('organisation_id', org.id))
    await del('payout_holds', db.from('payout_holds').delete().eq('organisation_id', org.id))

    /*
     * SHARE LINKS MUST GO BEFORE THE EVENT, and this is the non-obvious one.
     *
     * share_links.event_id is ON DELETE SET NULL, and share_links carries a check
     * constraint `share_links_target_exactly_one` requiring exactly one target to
     * be non-null. So deleting an event does not fail with a foreign-key error, it
     * nulls the target and then fails the CHECK:
     *
     *   23514  new row for relation "share_links" violates check constraint
     *          "share_links_target_exactly_one"
     *
     * That error names share_links while the statement names events, which is why
     * it reads as unrelated. The acquisition loop creates these automatically (6
     * per event here), so any event that has ever been shared or published hits it.
     * Worth knowing beyond this harness: the seeded-data purge deletes events and
     * will meet exactly this.
     *
     * share_link_events is NOT deleted here. Its FK is
     * `link_id ... on delete cascade` (20260704000002), so removing a share_links
     * row takes its attribution events with it. The first version deleted it
     * explicitly AND guessed the column as `share_link_id`, which errored 42703
     * on every fixture; the rows were already gone by cascade, so the error was
     * pure noise from work that did not need doing.
     */
    if (eventIds.length) {
      const { data: links } = await db.from('share_links').select('id').in('event_id', eventIds)
      const linkIds = (links ?? []).map(l => l.id)
      if (linkIds.length) await del('share_links', db.from('share_links').delete().in('id', linkIds))
    }
    const { data: orgLinks } = await db.from('share_links').select('id').eq('organisation_id', org.id)
    const orgLinkIds = (orgLinks ?? []).map(l => l.id)
    if (orgLinkIds.length) {
      await del('share_links (org)', db.from('share_links').delete().in('id', orgLinkIds))
    }

    if (eventIds.length) {
      await del('ticket_tiers', db.from('ticket_tiers').delete().in('event_id', eventIds))
      await del('events', db.from('events').delete().in('id', eventIds))
    }
    await del('organisations', db.from('organisations').delete().eq('id', org.id))
    if (org.owner_id) {
      await del('profiles', db.from('profiles').delete().eq('id', org.owner_id))
      await db.auth.admin.deleteUser(org.owner_id).catch(() => {})
    }
    removed += 1
    log(`purged ${org.slug} (${eventIds.length} event(s), ${orderIds.length} order(s))`)
  }

  if (errors.length) {
    log(`${errors.length} delete(s) FAILED:`)
    for (const e of errors) log(`    ${e}`)
  }
  return { removed, errors }
}

/**
 * Clear fixtures left by an earlier run that failed before buying anything. A
 * fixture carrying orders is KEPT: it is the evidence. Without this, TEST
 * accumulates an organisation and an auth user on every iteration.
 */
export async function clearEmptyFixtures(db, log = () => {}) {
  const { data: priorOrgs } = await db
    .from('organisations')
    .select('id, owner_id, slug')
    .like('slug', 'refund-proof-presents-%')
  for (const p of priorOrgs ?? []) {
    const { data: evs } = await db.from('events').select('id').eq('organisation_id', p.id)
    const ids = (evs ?? []).map(e => e.id)
    let hasOrders = false
    if (ids.length) {
      const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).in('event_id', ids)
      hasOrders = (count ?? 0) > 0
    }
    if (hasOrders) { log(`keeping prior fixture ${p.slug} (carries orders, it is evidence)`); continue }
    if (ids.length) {
      await db.from('ticket_tiers').delete().in('event_id', ids)
      await db.from('events').delete().in('id', ids)
    }
    await db.from('organisations').delete().eq('id', p.id)
    if (p.owner_id) {
      await db.from('profiles').delete().eq('id', p.owner_id)
      await db.auth.admin.deleteUser(p.owner_id).catch(() => {})
    }
    log(`cleared prior empty fixture ${p.slug}`)
  }
}

/**
 * An isolated organisation + published paid event + GA tier, owned by a user
 * created here. Nothing shared is modified and no existing password changes.
 *
 * The Stripe posture is COPIED from an organisation that is already charge-ready,
 * because assertCanCreateDestinationCharge reads stripe_account_id,
 * stripe_charges_enabled, stripe_account_country and payout_status, and refuses a
 * null country with `org_country_unsupported` before Stripe is ever called. An
 * invented account id fails at Stripe instead.
 *
 * The cover image is copied for the same reason: constraint
 * events_published_real_cover (20260504000001) refuses a published-public event
 * with no cover, an empty cover, or a picsum placeholder.
 */
export async function buildFixture(db, { stamp, ownerEmail, password, capacity = 10, priceCents = 2500, log = () => {} }) {
  const { data: donor } = await db
    .from('organisations')
    .select('stripe_account_id, stripe_account_country')
    .eq('stripe_charges_enabled', true)
    .eq('stripe_payouts_enabled', true)
    .not('stripe_account_country', 'is', null)
    .eq('payout_status', 'active')
    .limit(1)
    .maybeSingle()
  if (!donor?.stripe_account_id) throw new Error('no charge-ready organisation on TEST to copy a Stripe posture from')
  log(`copying Stripe posture from ${donor.stripe_account_id} (${donor.stripe_account_country})`)

  const { data: coverDonor } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .not('cover_image_url', 'ilike', 'https://picsum.photos/%')
    .limit(1)
    .maybeSingle()
  if (!coverDonor?.cover_image_url) throw new Error('no published TEST event with a real cover to copy')

  const created = await db.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
  if (created.error) throw new Error(`create owner: ${created.error.message}`)
  const ownerId = created.data.user.id
  await db.from('profiles').upsert({
    id: ownerId, email: ownerEmail, full_name: 'Refund Proof Owner',
    display_name: 'Refund Proof Owner', is_verified: true,
  })
  log(`owner ${ownerEmail} (${ownerId})`)

  const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()

  const { data: org, error: orgErr } = await db.from('organisations').insert({
    name: `Refund Proof Presents ${stamp}`,
    slug: `refund-proof-presents-${stamp}`,
    owner_id: ownerId,
    email: ownerEmail,
    status: 'active',
    payout_status: 'active',
    stripe_account_id: donor.stripe_account_id,
    stripe_account_country: donor.stripe_account_country,
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_onboarding_complete: true,
  }).select('id, name').single()
  if (orgErr) throw new Error(`organisation: ${orgErr.message}`)

  const startDate = new Date(Date.now() + 21 * 864e5)
  const { data: event, error: evErr } = await db.from('events').insert({
    title: `Refund Proof Night ${stamp}`,
    slug: `refund-proof-night-${stamp}`,
    description: 'Fixture event for the refund proofs.',
    summary: 'Refund proof fixture',
    organisation_id: org.id,
    created_by: ownerId,
    category_id: cat?.id ?? null,
    start_date: startDate.toISOString(),
    end_date: new Date(startDate.getTime() + 3 * 36e5).toISOString(),
    timezone: 'Australia/Sydney',
    event_type: 'in_person',
    venue_name: 'Proof Hall', venue_address: '1 Proof St',
    venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
    status: 'published', visibility: 'public', published_at: new Date().toISOString(),
    cover_image_url: coverDonor.cover_image_url,
    is_age_restricted: false, max_capacity: capacity,
    is_free: false, fee_pass_type: 'pass_to_buyer',
  }).select('id, slug, title').single()
  if (evErr) throw new Error(`event: ${evErr.message}`)

  const { data: tier, error: tErr } = await db.from('ticket_tiers').insert({
    event_id: event.id,
    name: 'General Admission',
    description: 'Refund proof tier',
    tier_type: 'general_admission',
    price: priceCents, currency: 'AUD',
    total_capacity: capacity, sold_count: 0, reserved_count: 0,
    min_per_order: 1, max_per_order: 10, sort_order: 0,
    is_visible: true, is_active: true,
    dynamic_pricing_enabled: false, requires_access_code: false,
  }).select('id, name, price, total_capacity, sold_count').single()
  if (tErr) throw new Error(`tier: ${tErr.message}`)

  log(`event ${event.slug}  tier ${tier.id}  price ${tier.price}c  capacity ${tier.total_capacity}`)
  return { ownerId, ownerEmail, org, event, tier }
}

/**
 * Drive a real card-4242 purchase of `qty` tickets through the real checkout.
 * Returns the order id parsed from the confirmation URL.
 *
 * Selectors are the ones proven by scripts/verify/paid-purchase-webhook-e2e.mjs:
 * the attendee form has moved between one "Jane Smith" field and split
 * First/Last, so the label is tried before the placeholder rather than pinning
 * either shape, and any remaining required input is filled because one blank
 * required field silently blocks native validation and the form never advances.
 */
export async function drivePurchase(page, { base, slug, qty, buyerEmail, shot = async () => {} }) {
  const sleep = ms => new Promise(r => setTimeout(r, ms))

  await page.goto(`${base}/events/${slug}`, { waitUntil: 'load', timeout: 120000 })

  /*
   * IT WAITS FOR THE PAGE, AND IT NAMES WHAT IT GOT INSTEAD. 14 September 2026.
   *
   * A drive of this file reported "no quantity control on the event page" and a
   * reserve button that never appeared, on two of three viewports, and both read
   * as product failures. The screenshot settled it: 14,672 bytes of UNSTYLED
   * html saying "Loading event", against 115,219 for the same page minutes
   * earlier. That is the route's loading shell served with no stylesheet, which
   * is what a running `next start` serves once something has rebuilt `.next`
   * underneath it: the HTML references chunk URLs the new build no longer has.
   *
   * `waitUntil: 'load'` cannot tell that apart from a slow stream, and a bare
   * count() a moment later cannot either, so the harness accused the product of
   * a fault that belonged to the machine. Now it WAITS for the control, and on
   * timeout it says which of the two it is looking at. A harness that cannot
   * tell its own environment from the product under test is worse than no
   * harness, because its failures get believed.
   */
  const plus = page.getByRole('button', { name: /^(\+|increase|add)/i }).first()
  try {
    await plus.waitFor({ state: 'visible', timeout: 45000 })
  } catch {
    await shot(page, '01-event-page')
    const stylesheets = await page.locator('link[rel="stylesheet"]').count()
    const shell = await page.getByText(/^Loading event/i).count()
    const title = (await page.title()) || '(no title)'
    if (shell > 0 || stylesheets === 0) {
      throw new Error(
        `the server served its LOADING SHELL, not the event page ` +
          `(${stylesheets} stylesheet link(s), title "${title}"). This is the ` +
          `environment, not the product: a running next start whose .next was ` +
          `rebuilt underneath it serves html pointing at chunks that no longer ` +
          `exist. Re-run the drive with nothing else building.`,
      )
    }
    throw new Error(
      `no quantity control on the event page after 45s, and the page is a real ` +
        `rendered page (${stylesheets} stylesheet link(s), title "${title}"), so ` +
        `this IS about the product.`,
    )
  }
  await shot(page, '01-event-page')
  for (let i = 0; i < qty; i += 1) { await plus.click(); await sleep(450) }
  await shot(page, '02-selected')

  /*
   * THE SAME RULE FOR THE RESERVE BUTTON. At tablet-768 on 14 September 2026
   * this click timed out after the quantity control had already worked, so the
   * page WAS real and the button was the question. A bare click that times out
   * says only "not clickable", which is true of a button that is missing, one
   * that is disabled, and one that is off screen, and those are three different
   * findings.
   */
  const reserve = page.getByRole('button', { name: /reserve|get tickets|checkout/i }).first()
  try {
    await reserve.click({ timeout: 45000 })
  } catch {
    await shot(page, '02-reserve-would-not-take')
    const present = await reserve.count()
    const label = present ? ((await reserve.textContent()) || '').trim() : '(absent)'
    const enabled = present ? await reserve.isEnabled() : false
    const visible = present ? await reserve.isVisible() : false
    throw new Error(
      `the reserve button would not take a click: present=${present > 0} ` +
        `visible=${visible} enabled=${enabled} label="${label}". A DISABLED ` +
        `button here means the ticket panel refused the selection; an ABSENT one ` +
        `means the panel never rendered.`,
    )
  }
  await page.waitForURL(/\/checkout\//, { timeout: 60000 })
  await sleep(2500)

  const fillField = async (labelRe, placeholder, value) => {
    let el = page.getByLabel(labelRe).first()
    if (!(await el.count()) && placeholder) el = page.getByPlaceholder(placeholder).first()
    if (!(await el.count())) return false
    if (!(await el.inputValue())) await el.fill(value)
    return true
  }
  const gotFirst = await fillField(/first name/i, null, 'Refund')
  if (gotFirst) await fillField(/last name/i, null, 'Proof')
  else await fillField(/full name|^name$/i, 'Jane Smith', 'Refund Proof')
  await fillField(/e-?mail/i, 'you@example.com', buyerEmail)
  for (const el of await page.locator('input[required]:not([type=checkbox])').all()) {
    if (!(await el.inputValue())) {
      const type = await el.getAttribute('type')
      await el.fill(type === 'email' ? buyerEmail : 'Proof')
    }
  }
  await shot(page, '03-checkout-details')

  await page.getByRole('button', { name: /continue to payment/i }).click()
  const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await frame.locator('input[name="number"]').fill('4242424242424242', { timeout: 90000 })
  await frame.locator('input[name="expiry"]').fill('12/30')
  await frame.locator('input[name="cvc"]').fill('123')
  const postal = frame.locator('input[name="postalCode"]')
  if (await postal.count()) await postal.fill('3220')
  await sleep(900)
  await shot(page, '04-card-entered')
  /*
   * DISMISS ANY NATIVE POPUP BEFORE PRESSING PAY, AND THE REASON IS EVIDENCE
   * RATHER THAN SUPERSTITION.
   *
   * At tablet-768 this drive failed three times running while mobile-390 and
   * desktop-1440 passed the identical step in the same run. The instrumentation
   * settled what it was: the button still read "Pay AUD 26.87" three seconds
   * after the click rather than "Processing...", the console was silent, the
   * page showed no error and Stripe's element showed none either. The submit
   * handler NEVER RAN. The screenshot shows why: Stripe's payment element at
   * this width renders a Country <select>, focus lands on it once the security
   * code is complete, and its native option list was open over the page. In
   * Chromium a click made while a native select popup is open is consumed
   * CLOSING THE POPUP and never reaches the element underneath.
   *
   * SO THIS IS THE HARNESS, NOT THE PRODUCT, and the distinction is the whole
   * point: the page cannot respond to an event the browser never delivered to
   * it, and a real buyer moving a finger from the card fields to the Pay button
   * does not leave a country list hanging open. Escape is what closes it, and it
   * is a no-op on the two viewports that never had one open, which is why it is
   * unconditional rather than a width special case.
   */
  await page.keyboard.press('Escape')
  await sleep(300)

  const payButton = page.getByRole('button', { name: /pay/i }).first()
  const payLabel = ((await payButton.textContent()) || '').trim()
  const console_ = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console_.push(`${m.type()}: ${m.text()}`.slice(0, 300)) })
  page.on('pageerror', err => console_.push(`pageerror: ${err.message}`.slice(0, 300)))
  await payButton.click()
  /*
   * DID THE HANDLER EVEN RUN. The button reads "Processing..." for as long as
   * confirmPayment is in flight (checkout-form.tsx), so its label is the one
   * observable that separates "the click never reached the submit handler" from
   * "the payment was attempted and did not come back". At tablet-768 on
   * 14 September 2026 it still read "Pay AUD 26.87" after 150 seconds, which is
   * the first of those two and a completely different investigation.
   */
  let labelAfter = '(not read)'
  try {
    await payButton.waitFor({ state: 'visible', timeout: 3000 })
    labelAfter = ((await payButton.textContent()) || '').trim()
  } catch { labelAfter = '(the button went away, which is what a submit looks like)' }
  try {
    await page.waitForURL(/confirmation/, { timeout: 150000 })
  } catch {
    /*
     * THE PAY WENT IN AND NOTHING CAME BACK, AND THAT IS THREE DIFFERENT
     * FINDINGS. 14 September 2026: the tablet-768 leg of the R1 drive timed out
     * here while mobile-390 and desktop-1440 passed the identical step in the
     * same run. The server's own log showed a payment_intent.created for that
     * leg and NO charge after it, so the click landed and the confirmation did
     * not complete. `waitForURL timed out` says none of that.
     *
     * A card declined inside Stripe's element, a validation error Stripe is
     * showing, and a confirmation that is simply still in flight are three
     * separate things, and the page is holding the answer to which at the
     * moment it gives up. So it is read and reported rather than thrown away.
     */
    await shot(page, '05-pay-did-not-complete')
    const errors = await page
      .locator('[role="alert"], .text-red-600, [data-testid*="error"], p.text-danger')
      .allTextContents()
    let stripeError = ''
    try {
      stripeError = (
        await page
          .frameLocator('iframe[name^="__privateStripeFrame"]')
          .first()
          .locator('[role="alert"], .p-FieldError, .Error')
          .allTextContents()
      ).join(' | ')
    } catch {
      stripeError = '(the Stripe frame could not be read)'
    }
    throw new Error(
      `the payment did not reach the confirmation in 150s. Pressed "${payLabel}", ` +
        `button read "${labelAfter}" three seconds later (it reads "Processing..." ` +
        `while confirmPayment is in flight, so an unchanged label means the SUBMIT ` +
        `HANDLER NEVER RAN and the click was swallowed). ` +
        `Console: ${console_.slice(0, 5).join(' || ') || '(silent)'}. ` +
        `still at ${page.url()}. Page said: ${errors.filter(Boolean).join(' | ') || '(nothing)'}. ` +
        `Stripe's own element said: ${stripeError || '(nothing)'}. Cross-check the ` +
        `server log for a payment_intent.succeeded on this attempt: a created ` +
        `intent with no charge after it means the confirmation never completed, ` +
        `not that the platform refused it.`,
    )
  }
  await shot(page, '05-confirmation')

  return page.url().match(/orders\/([0-9a-f-]+)\//)?.[1] ?? null
}
