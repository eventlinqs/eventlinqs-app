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
  await shot(page, '01-event-page')

  const plus = page.getByRole('button', { name: /^(\+|increase|add)/i }).first()
  if (!(await plus.count())) throw new Error('no quantity control on the event page')
  for (let i = 0; i < qty; i += 1) { await plus.click(); await sleep(450) }
  await shot(page, '02-selected')

  await page.getByRole('button', { name: /reserve|get tickets|checkout/i }).first().click()
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
  await page.getByRole('button', { name: /pay/i }).first().click()
  await page.waitForURL(/confirmation/, { timeout: 150000 })
  await shot(page, '05-confirmation')

  return page.url().match(/orders\/([0-9a-f-]+)\//)?.[1] ?? null
}
