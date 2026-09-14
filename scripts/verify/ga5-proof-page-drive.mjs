/**
 * GA5. THE PROOF PAGE, DRIVEN.
 *
 * WHAT IT PROVES, in the order GA5 asks for it:
 *
 *   2. That nothing is typed: change one attributed order's amount on TEST and
 *      the page figure changes; insert a reversal and produced by us falls
 *      while reversals rises; change the commission in the pricing
 *      configuration and the fee due changes with no deploy.
 *   5. The snapshot: close a month, assert it stored the figures AND a source
 *      for every one of them, then insert a later reversal and assert the live
 *      page changes while the snapshot does not.
 *   6. Three states at 390, 768 and 1440: a campaign with sales, a campaign
 *      with sales and a reversal, and a campaign that has sent and sold
 *      nothing. No horizontal overflow at 390, the leading number legible, and
 *      the evidence expansion reachable with a thumb.
 *
 * Run (dev server on 3100 against TEST):
 *   UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/verify/ga5-proof-page-drive.mjs \
 *        --out C:/dev/EVIDENCE/GA5
 *
 * UPSTASH_* IS NOT OPTIONAL. This drive clears the resolved marketing
 * commission rule, and that cache lives in the store the server was started
 * with, so a process without it invalidates nothing at all and its fee checks
 * then pass or fail on whether the 60 second TTL happened to expire, which is a
 * reading about timing rather than about the product. Added 14 September 2026
 * after the identical omission in ft1-forecast-drive produced three readings of
 * the same stale fee and an accusation against a page that was correct.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { invalidatePricingRule, PRICING_RULES_CACHE_TTL_SECONDS } from '../../src/lib/payments/pricing-rules.ts'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.GA5_BASE_URL ?? 'http://localhost:3100'
const LANE = 'lane-b-ga5'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * Write the commission AND invalidate it, exactly as src/lib/admin/pricing.ts
 * does, AT EVERY SCOPE THE READER MIGHT HAVE CACHED IT UNDER.
 *
 * THE SCOPE IS THE WHOLE POINT, and the first fix here got it wrong. The row
 * this drive edits is the AU/AUD region default, so invalidating
 * `{countryCode:'AU', currency:'AUD', organisationId:null, eventId:null}` looks
 * right. It is not what the reader uses. `src/lib/proof/read.ts` resolves the
 * commission with the CAMPAIGN'S organisation and event, and `cacheKey` returns
 * `pr:v2:<ruleType>:event:<eventId>` whenever an eventId is present, holding the
 * value that event RESOLVED to, override or region fall-through alike. So the
 * region key was cleared, the event key was not, and the drive read the stale
 * value and reported "the fee went from 1450 to 1450" - the same false
 * accusation, one level down.
 *
 * Both keys are cleared here because the drive moves a region row that an
 * event-scoped read falls through to, and only the reader knows which key it
 * used.
 */
async function setCommission(ruleId, percentage) {
  await db.from('pricing_rules').update({ value_percentage: percentage }).eq('id', ruleId)
  for (const scope of [
    { organisationId: null, eventId: null },
    { organisationId: fixture.organisationId, eventId: fixture.eventId },
  ]) {
    await invalidatePricingRule({
      ruleType: 'marketing_commission_percentage',
      countryCode: 'AU',
      currency: 'AUD',
      ...scope,
    })
  }
}

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  { label: 'tablet-768', width: 768, height: 1024, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1' },
  { label: 'desktop-1440', width: 1440, height: 900, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' },
]

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const adminPassword = `${randomUUID()}Aa1`
const fixture = {
  ownerId: null,
  adminId: null,
  organisationId: null,
  eventId: null,
  slotId: null,
  senderIdentityId: null,
  audienceId: null,
  email: `${LANE}-${STAMP}@eventlinqs.test`,
  campaigns: {},
  orderIds: [],
  commissionRuleId: null,
}

/*
 * THE CONSENT BANNER'S BUTTONS SAY WHAT THIS PLATFORM SAYS, not what a generic
 * banner says. They read "That is fine" and "No thanks", so a matcher built
 * from accept / allow / ok matched nothing, the banner stayed up, and at 390 it
 * covered the half of the page the state was being photographed for. The
 * evidence was a picture of a cookie notice.
 */
async function answerTheCookieBanner(page) {
  for (const label of [/that is fine/i, /accept/i, /allow/i, /^ok$/i]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {})
      await page.waitForTimeout(400)
      return true
    }
  }
  return false
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

/** One order with a stored attribution. `billable` is the trigger's answer. */
async function makeOrder(params) {
  const orderId = randomUUID()
  const reference = `EL-${STAMP.slice(-6)}${params.tag}`
  const order = await db.from('orders').insert({
    id: orderId,
    order_number: reference,
    event_id: fixture.eventId,
    organisation_id: fixture.organisationId,
    guest_email: `${LANE}-buyer-${params.tag}-${STAMP}@eventlinqs.test`,
    guest_name: 'Lane B GA5 buyer',
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    subtotal_cents: params.totalCents,
    total_cents: params.totalCents,
    currency: 'AUD',
  })
  if (order.error) throw new Error(`order ${params.tag}: ${order.error.message}`)
  fixture.orderIds.push(orderId)

  const attribution = await db.from('marketing_attribution').insert({
    order_id: orderId,
    decision: params.campaignId ? 'attributed' : 'none',
    rung: params.rung,
    model_name: 'last-click-with-identity-ladder',
    model_version: 'v1',
    campaign_id: params.campaignId,
    confidence: params.rung === 4 ? 0.5 : 1,
    explanation: params.explanation,
    reason: params.campaignId ? null : 'no_campaign_click_for_this_event',
  })
  if (attribution.error) throw new Error(`attribution ${params.tag}: ${attribution.error.message}`)
  return { orderId, reference }
}

async function makeCampaign(name, tag) {
  const { data: tenant } = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').single()
  const campaign = await db
    .from('marketing_campaign')
    .insert({
      tenant_id: tenant.id,
      event_id: fixture.eventId,
      organisation_id: fixture.organisationId,
      name,
      state: 'active',
      reference: `${LANE}-${tag}-${STAMP}`,
    })
    .select('id')
    .single()
  if (campaign.error) throw new Error(`campaign ${tag}: ${campaign.error.message}`)
  return campaign.data.id
}

/** A send row needs an allowlist row, which needs a consent. Built once, reused. */
async function makeSend(campaignId, tag) {
  const allow = await db
    .from('marketing_recipient_allowlist')
    .insert({
      campaign_id: campaignId,
      audience_member_id: fixture.audienceId,
      channel_code: 'email',
      consent_state: true,
      consent_channel_scope: 'email',
      consent_at: new Date().toISOString(),
      consent_wording_version: 'v1',
    })
    .select('id')
    .single()
  if (allow.error) throw new Error(`allowlist ${tag}: ${allow.error.message}`)

  const fingerprint = 'a'.repeat(64)
  const approval = await db.from('marketing_send_approval').insert({
    campaign_id: campaignId,
    segment_fingerprint: fingerprint,
    approver_user_id: fixture.adminId,
    approved_sample: 'The lane B GA5 proof sample.',
  })
  if (approval.error) throw new Error(`approval ${tag}: ${approval.error.message}`)

  const send = await db.from('marketing_send').insert({
    campaign_id: campaignId,
    allowlist_id: allow.data.id,
    channel_code: 'email',
    template_key: 'event_first_word',
    sender_identity_id: fixture.senderIdentityId,
    segment_fingerprint: fingerprint,
    rendered_subject: 'Lane B GA5: a warehouse night',
    rendered_body: 'A message the GA5 proof sent.',
    rendered_html: '<p>A message the GA5 proof sent.</p>',
    unsubscribe_token: randomUUID(),
    destination: fixture.email,
    state: 'sent',
    sent_at: new Date().toISOString(),
  })
  if (send.error) throw new Error(`send ${tag}: ${send.error.message}`)
}

async function buildFixture() {
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  const { data: category } = await db.from('event_categories').select('id').eq('is_active', true).order('sort_order').limit(1).single()
  const { data: cover } = await db.from('events').select('cover_image_url').eq('status', 'published').not('cover_image_url', 'is', null).limit(1).single()
  const { data: tenant } = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').single()
  const { data: wording } = await db
    .from('consent_wordings')
    .select('body, version, channel_scope, third_party_scope, suppression_scope')
    .eq('purpose', 'facilitated_event_marketing')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser-${STAMP}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db.from('profiles').upsert({ id: fixture.ownerId, email: `${LANE}-organiser-${STAMP}@eventlinqs.test`, full_name: 'Lane B GA5' })

  const org = await db
    .from('organisations')
    .insert({ name: `Lane B GA5 ${STAMP}`, slug: `${LANE}-org-${STAMP}`, owner_id: fixture.ownerId, status: 'active' })
    .select('id')
    .single()
  if (org.error) throw new Error(`organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 20 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B GA5 proof night ${STAMP}`,
      slug: `${LANE}-event-${STAMP}`,
      organisation_id: fixture.organisationId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: 'Lane B GA5 warehouse',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the GA5 proof page drive. It is deleted when the drive ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`event: ${event.error.message}`)
  fixture.eventId = event.data.id
  await db.from('ticket_tiers').insert({ event_id: fixture.eventId, name: 'General', price: 4500, currency: 'AUD', total_capacity: 300, is_active: true })

  /*
   * A LEDGER SLOT FOR THIS EVENT. The proof page withholds the fee for an event
   * the money ledger does not hold, which is correct and is proven separately
   * below. For the three states GA5 asks to SEE, the fee has to be quotable, so
   * the slot is created here if publishing did not create one, and whether it
   * did is reported rather than assumed.
   */
  const { data: existingSlot } = await db.from('ledger_slots').select('id').eq('source_ref', fixture.eventId).maybeSingle()
  /*
   * AN OBSERVATION, NOT AN ASSERTION, and the distinction matters. A slot is
   * written by the ledger adapter when an ORDER is recorded through it, not by
   * publishing an event. This fixture writes its orders straight to the table
   * with the service role, so no adapter runs and no slot appears. That is the
   * fixture taking a shortcut rather than a defect in the product, and the
   * shortcut is recorded rather than dressed up as a finding.
   */
  check(
    'ledger.whether-a-slot-already-existed',
    true,
    existingSlot
      ? 'the event already has a money ledger slot'
      : 'no slot existed, because this fixture writes orders directly rather than through the ledger adapter, so the drive creates one to exercise the quotable path',
  )
  if (existingSlot) {
    fixture.slotId = existingSlot.id
  } else {
    const slot = await db
      .from('ledger_slots')
      .insert({
        source_ref: fixture.eventId,
        organisation_id: fixture.organisationId,
        category: 'lane-b-ga5',
        subcategory: 'lane-b-ga5-proof',
        slot_at: start.toISOString(),
      })
      .select('id')
      .single()
    if (slot.error) throw new Error(`ledger slot: ${slot.error.message}`)
    fixture.slotId = slot.data.id
  }

  const identity = await db
    .from('marketing_sender_identity')
    .insert({
      organisation_id: fixture.organisationId,
      from_name: `Lane B GA5 ${STAMP}`,
      reply_to: `${LANE}-replies-${STAMP}@eventlinqs.test`,
      identity_line: 'Lane B GA5, 1 Test Street, Geelong VIC 3220.',
      is_verified: true,
    })
    .select('id')
    .single()
  if (identity.error) throw new Error(`sender identity: ${identity.error.message}`)
  fixture.senderIdentityId = identity.data.id

  // The consent record first: it refreshes the audience from a person's orders.
  await db.from('marketing_consents').upsert(
    {
      email: fixture.email,
      status: 'granted',
      consent_text: wording.body,
      consent_version: wording.version,
      source: 'ga5-proof',
      granted_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  )
  const consent = await db.from('consent_events').insert({
    tenant_id: tenant.id,
    subject_email: fixture.email,
    purpose: 'facilitated_event_marketing',
    channel_scope: 'email',
    decision: 'granted',
    wording: wording.body,
    wording_version: wording.version,
    capture_surface: 'ga5-proof',
    third_party_scope: wording.third_party_scope,
    suppression_scope: wording.suppression_scope,
  })
  if (consent.error) throw new Error(`consent: ${consent.error.message}`)
  const member = await db
    .from('audience_members')
    .upsert(
      {
        email: fixture.email,
        consent_state: true,
        consent_channel: 'email',
        consent_at: new Date().toISOString(),
        consent_text: wording.body,
        consent_version: wording.version,
        consent_source: 'ga5-proof',
        first_order_at: new Date().toISOString(),
        last_order_at: new Date().toISOString(),
        order_count: 1,
        lifetime_spend_cents: 4500,
        price_band: '30-to-59',
      },
      { onConflict: 'email' },
    )
    .select('id')
    .single()
  if (member.error) throw new Error(`audience: ${member.error.message}`)
  fixture.audienceId = member.data.id

  const admin = await db.auth.admin.createUser({
    email: `${LANE}-admin-${STAMP}@eventlinqs.test`,
    password: adminPassword,
    email_confirm: true,
  })
  if (admin.error) throw new Error(`admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: `${LANE}-admin-${STAMP}@eventlinqs.test`, full_name: 'Lane B GA5 Owner' })
  const staff = await db.from('admin_users').insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B GA5 Owner' })
  if (staff.error) throw new Error(`admin_users: ${staff.error.message}`)

  /*
   * FOUR CAMPAIGNS. GA5's acceptance 6 names three states to photograph, and
   * step 7 asks for a designed empty state "when a campaign has not sent yet",
   * which is a FOURTH and is not any of the three. It was built and never
   * driven, so it is driven here: a campaign with no send row at all.
   */
  fixture.campaigns.sales = await makeCampaign(`Lane B GA5 with sales ${STAMP}`, 'sales')
  fixture.campaigns.reversed = await makeCampaign(`Lane B GA5 with a reversal ${STAMP}`, 'reversed')
  fixture.campaigns.nothing = await makeCampaign(`Lane B GA5 sold nothing ${STAMP}`, 'nothing')
  fixture.campaigns.quiet = await makeCampaign(`Lane B GA5 has not sent ${STAMP}`, 'quiet')
  for (const [tag, id] of Object.entries(fixture.campaigns)) {
    if (tag === 'quiet') continue
    await makeSend(id, tag)
  }

  fixture.sold = [
    await makeOrder({ tag: 'A', totalCents: 4500, campaignId: fixture.campaigns.sales, rung: 1, explanation: 'Credited because the buyer carried the identifier from the email link.' }),
    await makeOrder({ tag: 'B', totalCents: 9000, campaignId: fixture.campaigns.sales, rung: 3, explanation: 'Credited because the buyer is the person the email was sent to.' }),
  ]
  fixture.reversedOrder = await makeOrder({
    tag: 'C',
    totalCents: 6000,
    campaignId: fixture.campaigns.reversed,
    rung: 1,
    explanation: 'Credited because the buyer carried the identifier from the email link.',
  })
  fixture.organic = await makeOrder({ tag: 'D', totalCents: 3300, campaignId: null, rung: 5, explanation: 'No campaign click is on record for this event, so nothing is credited.' })
}

async function teardown() {
  for (const id of Object.values(fixture.campaigns)) {
    await db.from('marketing_proof_snapshot').delete().eq('campaign_id', id)
    await db.from('marketing_send').delete().eq('campaign_id', id)
    await db.from('marketing_send_approval').delete().eq('campaign_id', id)
    await db.from('marketing_recipient_allowlist').delete().eq('campaign_id', id)
    await db.from('marketing_campaign').delete().eq('id', id)
  }
  for (const orderId of fixture.orderIds) {
    await db.from('marketing_attribution_reversal').delete().eq('order_id', orderId)
    await db.from('marketing_attribution').delete().eq('order_id', orderId)
    await db.from('orders').delete().eq('id', orderId)
  }
  if (fixture.senderIdentityId) await db.from('marketing_sender_identity').delete().eq('id', fixture.senderIdentityId)
  await db.from('audience_members').delete().eq('email', fixture.email)
  await db.from('marketing_consents').delete().eq('email', fixture.email)
  if (fixture.eventId) {
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('ledger_entries').delete().eq('slot_id', fixture.slotId ?? randomUUID())
    await db.from('ledger_slots').delete().eq('source_ref', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.ownerId) await db.auth.admin.deleteUser(fixture.ownerId).catch(() => {})
  if (fixture.adminId) {
    await db.from('admin_users').delete().eq('id', fixture.adminId)
    await db.auth.admin.deleteUser(fixture.adminId).catch(() => {})
  }
  if (fixture.commissionRuleId) await db.from('pricing_rules').delete().eq('id', fixture.commissionRuleId)
}

let browser = null
const ADMIN_SESSION = join(out, 'ga5-admin-session.json')

try {
  await buildFixture()

  const { readProof, closeMonth } = await import('../../src/lib/proof/read.ts')
  const { FIGURE } = await import('../../src/lib/proof/compose.ts')

  /* ---- acceptance 2: nothing is typed ---- */
  {
    const before = await readProof(fixture.campaigns.sales)
    check(
      'ga5.sourced.produced-by-us-is-the-sum-of-the-attributed-orders',
      before.result.figures[FIGURE.PRODUCED_BY_US].value === 13500,
      `the page reads ${before.result.figures[FIGURE.PRODUCED_BY_US].value} cents from ${before.result.figures[FIGURE.PRODUCED_BY_US].source.rowIds.length} order rows`,
    )
    check(
      'ga5.sourced.every-figure-names-its-source',
      before.unsourced.length === 0,
      before.unsourced.length === 0 ? 'no figure rendered without naming where it came from' : before.unsourced.join(', '),
    )

    // CHANGE ONE ORDER'S AMOUNT AND THE FIGURE MOVES.
    await db.from('orders').update({ total_cents: 5500, subtotal_cents: 5500 }).eq('id', fixture.sold[0].orderId)
    const afterAmount = await readProof(fixture.campaigns.sales)
    check(
      'ga5.nothing-is-typed.changing-an-order-amount-changes-the-figure',
      afterAmount.result.figures[FIGURE.PRODUCED_BY_US].value === 14500,
      `13500 became ${afterAmount.result.figures[FIGURE.PRODUCED_BY_US].value} when one order went from 4500 to 5500`,
    )

    // CHANGE THE COMMISSION AND THE FEE MOVES, WITH NO DEPLOY.
    const feeBefore = afterAmount.result.figures[FIGURE.FEE_DUE].value
    const { data: rule } = await db
      .from('pricing_rules')
      .select('id')
      .eq('rule_type', 'marketing_commission_percentage')
      .is('effective_until', null)
      .limit(1)
      .single()
    /*
     * SET THE COMMISSION THE WAY /admin/pricing SETS IT: a row write AND an
     * invalidation. `getPricingRule` caches a resolved rule for
     * PRICING_RULES_CACHE_TTL_SECONDS and `src/lib/admin/pricing.ts` invalidates
     * after every change, so a real edit lands at once and a row write alone is
     * read stale for up to a minute.
     *
     * Corrected 14 September 2026 alongside the identical defect in
     * ft1-forecast-drive, which reported "$68.50, then $68.50, and $68.50" and
     * for an hour looked like the fee law being broken, and in
     * ga2-matcher-drive, where an un-invalidated RESTORE left the next block
     * pressing a button the drive had switched off. This one had not failed
     * yet, which is the worst of the three states to be in: with a TTL and no
     * invalidation it passes or fails on WHEN it runs, so a green here was
     * never evidence. The old message said the fee moved "on a row update
     * alone", which was the thing that was wrong.
     */
    await setCommission(rule.id, 20)
    const afterFee = await readProof(fixture.campaigns.sales)
    check(
      'ga5.nothing-is-typed.changing-the-fee-configuration-changes-the-fee-with-no-deploy',
      afterFee.result.figures[FIGURE.FEE_DUE].value === Math.round(14500 * 0.2) && feeBefore !== afterFee.result.figures[FIGURE.FEE_DUE].value,
      `the fee went from ${feeBefore} to ${afterFee.result.figures[FIGURE.FEE_DUE].value} once the row was updated AND the rule invalidated the way /admin/pricing does (cache TTL ${PRICING_RULES_CACHE_TTL_SECONDS}s)`,
    )
    await setCommission(rule.id, 10)
  }

  /* ---- acceptance 5: the snapshot, and what a later reversal does to it ---- */
  {
    const periodStart = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10)
    // EXCLUSIVE, so today's sales are inside the period being closed.
    const periodEnd = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const stored = await closeMonth({ campaignId: fixture.campaigns.reversed, periodStart, periodEnd })
    check('ga5.snapshot.month-closes', stored.stored, stored.reason ?? 'the month was closed and the figures stored')

    const { data: snapshot } = await db
      .from('marketing_proof_snapshot')
      .select('figures, sources')
      .eq('campaign_id', fixture.campaigns.reversed)
      .maybeSingle()
    const figureKeys = Object.keys(snapshot?.figures ?? {})
    check(
      'ga5.snapshot.stores-a-source-for-every-figure',
      figureKeys.length > 0 && figureKeys.every(k => (snapshot.sources ?? {})[k] !== undefined),
      `${figureKeys.length} figures stored, every one with a source beside it`,
    )
    const snapshotProduced = snapshot.figures[FIGURE.PRODUCED_BY_US]
    check(
      'ga5.snapshot.holds-what-was-true-then',
      snapshotProduced === 6000,
      `the snapshot holds ${snapshotProduced} cents produced`,
    )

    // A LATER REVERSAL: the live page moves, the snapshot does not.
    const reversal = await db.from('marketing_attribution_reversal').insert({
      order_id: fixture.reversedOrder.orderId,
      reason: 'refund',
      reversed_amount_cents: 6000,
      source: `${LANE}-drive`,
    })
    check('ga5.reversal.was-recorded', !reversal.error, reversal.error?.message ?? 'a refund reversal was written')

    const live = await readProof(fixture.campaigns.reversed)
    check(
      'ga5.reversal.produced-by-us-falls-and-reversals-rises',
      live.result.figures[FIGURE.PRODUCED_BY_US].value === 0 && live.result.figures[FIGURE.REVERSED].value === 6000,
      `produced is now ${live.result.figures[FIGURE.PRODUCED_BY_US].value} and taken back is ${live.result.figures[FIGURE.REVERSED].value}`,
    )

    const { data: after } = await db
      .from('marketing_proof_snapshot')
      .select('figures')
      .eq('campaign_id', fixture.campaigns.reversed)
      .maybeSingle()
    check(
      'ga5.snapshot.a-later-reversal-changes-the-live-page-and-not-the-snapshot',
      after.figures[FIGURE.PRODUCED_BY_US] === 6000,
      `the snapshot still holds ${after.figures[FIGURE.PRODUCED_BY_US]} while the live page holds ${live.result.figures[FIGURE.PRODUCED_BY_US].value}`,
    )
  }

  /* ---- the fee is withheld when the ledger cannot answer ---- */
  {
    const slotBefore = fixture.slotId
    await db.from('ledger_slots').delete().eq('id', slotBefore)
    const withheld = await readProof(fixture.campaigns.sales)
    check(
      'ga5.refusal.the-fee-is-withheld-when-the-ledger-cannot-answer',
      withheld.result.figures[FIGURE.FEE_DUE].value === null &&
        withheld.result.figures[FIGURE.FEE_DUE].unavailable?.border !== null,
      `the fee reads as words and points at ${withheld.result.figures[FIGURE.FEE_DUE].unavailable?.border ?? 'no border, which is the failure'}`,
    )
    check(
      'ga5.refusal.the-revenue-is-still-shown-and-still-sourced',
      withheld.result.figures[FIGURE.PRODUCED_BY_US].value !== null,
      'a figure that CAN be sourced is not withheld just because another cannot',
    )
    const slot = await db
      .from('ledger_slots')
      .insert({
        id: slotBefore,
        source_ref: fixture.eventId,
        organisation_id: fixture.organisationId,
        category: 'lane-b-ga5',
        subcategory: 'lane-b-ga5-proof',
        slot_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (slot.error) throw new Error(`could not restore the ledger slot: ${slot.error.message}`)
    fixture.slotId = slot.data.id
  }

  /* ---- acceptance 6: three states at three widths ---- */
  browser = await chromium.launch({ headless: true })
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: VIEWPORTS[2].userAgent })
    const page = await context.newPage()
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1200)
    await answerTheCookieBanner(page)
    await page.locator('input[name="email"]').fill(`${LANE}-admin-${STAMP}@eventlinqs.test`)
    await page.locator('input[name="password"]').fill(adminPassword)
    await Promise.all([
      page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').first().click(),
    ])
    await page.waitForTimeout(2500)
    await context.storageState({ path: ADMIN_SESSION })
    await context.close()
  }

  const STATES = [
    { tag: 'sales', label: 'with-sales', expect: /Revenue we produced/i },
    { tag: 'reversed', label: 'with-a-reversal', expect: /Taken back/i },
    { tag: 'nothing', label: 'sold-nothing', expect: /Revenue we produced/i },
    { tag: 'quiet', label: 'has-not-sent', expect: /has not sent anything yet/i },
  ]

  for (const vp of VIEWPORTS) {
    for (const state of STATES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: vp.userAgent,
        storageState: ADMIN_SESSION,
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/admin/campaigns/${fixture.campaigns[state.tag]}/proof`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      await page.waitForTimeout(2200)
      await answerTheCookieBanner(page)
      const body = await page.locator('body').innerText()

      check(
        `ga5.${vp.label}.${state.label}.renders`,
        state.expect.test(body),
        `the page reads as the ${state.label} state`,
      )
      check(
        `ga5.${vp.label}.${state.label}.no-horizontal-overflow`,
        !(await horizontalOverflow(page)),
        `the page fits ${vp.width} across`,
      )
      check(
        `ga5.${vp.label}.${state.label}.no-unsourced-number-on-screen`,
        !/NaN|undefined|Infinity/.test(body),
        'nothing on screen is a number the page could not work out',
      )

      if (state.tag === 'quiet') {
        check(
          `ga5.${vp.label}.${state.label}.the-empty-state-says-what-to-do-next`,
          /Approve the segment/i.test(body) && /run the pacing/i.test(body),
          'the empty state names the two steps that fill this page rather than stating an absence',
        )
        check(
          `ga5.${vp.label}.${state.label}.no-figure-is-shown-before-there-is-one`,
          !/\$/.test(body),
          'nothing that looks like money is on the screen before a message has left',
        )
      }

      if (state.tag === 'sales') {
        const leading = await page
          .locator('p.font-display')
          .filter({ hasText: /\$/ })
          .first()
          .evaluate(el => Number.parseFloat(window.getComputedStyle(el).fontSize))
          .catch(() => 0)
        check(
          `ga5.${vp.label}.${state.label}.the-leading-number-is-legible-without-zoom`,
          leading >= 36,
          `the leading number renders at ${leading} pixels`,
        )
        const summary = page.locator('summary').first()
        const box = await summary.boundingBox().catch(() => null)
        check(
          `ga5.${vp.label}.${state.label}.the-evidence-expansion-is-a-thumb-target`,
          Boolean(box) && box.height >= 44,
          `the expansion control is ${box ? Math.round(box.height) : 0} pixels tall`,
        )
        await summary.click({ timeout: 20000 }).catch(() => {})
        await page.waitForTimeout(600)
        const opened = await page.locator('body').innerText()
        check(
          `ga5.${vp.label}.${state.label}.the-evidence-opens-to-the-orders-behind-it`,
          opened.includes(fixture.sold[0].reference),
          `the order reference ${fixture.sold[0].reference} is one interaction away`,
        )
      }

      /*
       * EVERY EXPANSION OPEN, AND THE WHOLE PAGE. The thumb target and the
       * overflow were measured above, on the page as it arrives; the picture is
       * taken with the evidence showing, because a screenshot of a collapsed
       * page proves the headline and nothing about the sources beneath it,
       * which is the half GA5 exists for.
       */
      await page.locator('details').evaluateAll(all => all.forEach(d => { d.open = true }))
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(out, `${vp.label}-${state.label}.png`), fullPage: true })
      await context.close()
    }
  }

  /* ---- the reversal condition ---- */
  {
    await db.from('marketing_campaigner_config').update({ proof_page_enabled: false }).eq('id', true)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: VIEWPORTS[2].userAgent, storageState: ADMIN_SESSION })
    const page = await context.newPage()
    const response = await page.goto(`${BASE}/admin/campaigns/${fixture.campaigns.sales}/proof`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    check(
      'ga5.reversal-condition.the-route-answers-404-when-switched-off',
      (response?.status() ?? 0) === 404,
      `the route answered ${response?.status()}`,
    )
    await context.close()
    await db.from('marketing_campaigner_config').update({ proof_page_enabled: true }).eq('id', true)

    const stillThere = await readProof(fixture.campaigns.sales)
    check(
      'ga5.reversal-condition.every-row-stays-intact',
      stillThere.result.figures[FIGURE.PRODUCED_BY_US].value !== null,
      'switching the page off hid a read and destroyed nothing',
    )
  }
} catch (error) {
  check('ga5.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await db.from('marketing_campaigner_config').update({ proof_page_enabled: true }).eq('id', true)
    await teardown()
    const { count } = await db
      .from('marketing_campaign')
      .select('id', { count: 'exact', head: true })
      .like('reference', `${LANE}-%-${STAMP}`)
    check('ga5.teardown.left-as-found', (count ?? 0) === 0, `${count ?? 0} lane B GA5 campaign row(s) remain`)
  } catch (error) {
    check('ga5.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'ga5-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`GA5 DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
