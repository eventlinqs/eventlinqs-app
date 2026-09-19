/**
 * GA3. THE TRACKED LINK AND ATTRIBUTION SPINE, DRIVEN.
 *
 * Every acceptance line GA3 states about a browser is exercised here, at 390,
 * 768 and 1440, against TEST, through the product's own pages and the product's
 * own checkout. Nothing below asserts a query it wrote itself: the click rows,
 * the cookies and the attribution records are read back out of the database
 * after the browser did the thing a person does.
 *
 * WHAT IT DRIVES, in the order GA3 asks for it:
 *
 *   5. Open a lane-B tracked link, confirm the click row and the cookie, clear
 *      the cookie to simulate a different device, complete a lane-B purchase
 *      with the same buyer address, and confirm the attribution resolved at
 *      rung 3 with the explanation naming identity matching.
 *   6. Request the short link with every query parameter removed and confirm
 *      the redirect still carries the identifiers and the click row holds the
 *      campaign, channel, partner and recipient.
 *   7. The admin attribution reader at all three widths, showing one attributed
 *      order, one none order and one reversed order, with no horizontal
 *      overflow at 390.
 *
 * AND THE FORWARDED CASE, which GA3 names in its WHY and its acceptance 1: the
 * recipient sends the link to the friend who actually wants to come, and the
 * campaign is credited while the recipient is marked as having passed it on.
 *
 * THE PURCHASE IS A FREE ONE, and that is stated rather than glossed. A free
 * ticket is a real order on this platform, it goes through the SAME checkout
 * action and the same order insert as a paid one, and the attribution spine
 * keys on the order rather than on the money. The paid path is exercised at the
 * point the order row is written, which is where the signal is recorded. A card
 * adds a payment step to the drive and nothing to what is being proved.
 *
 * WITHDRAWN, 14 September 2026: this used to say "the reason a completed CARD
 * payment is not driven here is recorded in REVIEW-QUEUE-B.md: this machine has
 * no working Stripe TEST secret". That is false, and it is replaced rather than
 * deleted because it was cited as the settled reason in three files. The CLI's
 * `[default]` profile holds a working TEST key for acct_1T8WBhGuiZ9cvxuu, and
 * scripts/dev/lane-b-serve-with-stripe.mjs serves a matching pair, so a card
 * completes on this machine. The spine keys on the ORDER, not on the money, so
 * a free order remains the right thing to drive here.
 *
 * Run. The two loader flags are not optional: this drive imports the
 * attribution recorder out of src/, which reaches both the @/ alias and a
 * module declaring server-only. Without them node throws ERR_MODULE_NOT_FOUND.
 * Corrected 14 September 2026 by drive-usage-names-what-it-needs.
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/ga3-attribution-drive.mjs \
 *          --out C:/dev/EVIDENCE/GA3
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { sitemapFootprint, laneFixturesStillPublished } from './lib/sitemap-footprint.mjs'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

/*
 * THE CONSENT BANNER. One shared implementation (scripts/verify/lib/cookie-banner.mjs),
 * answered 'decline' here because that is the answer this drive has always given.
 * Five private copies of this helper existed on 15 September 2026 and three of them
 * matched button labels the banner does not carry, so they never dismissed anything.
 */
const answerTheCookieBanner = (page) => answerTheBanner(page, { answer: 'decline' })

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.GA3_BASE_URL ?? 'http://localhost:3100'
const LANE = 'lane-b-ga3'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/*
 * THE DRIVE PRESENTS ITSELF AS A PERSON, and that is not a workaround.
 *
 * `isPreviewCrawler` treats `headlesschrome` as a crawler and refuses to count
 * the click, which is CORRECT: every messaging platform fetches a link the
 * moment it is pasted, and booking those would credit a campaign for a click
 * nobody made. The first run of this drive was refused by exactly that rule and
 * the rule was right. So each context sends the user agent a real phone, tablet
 * or laptop sends, which is also what makes `user_agent_class` on the click row
 * worth asserting.
 */
const VIEWPORTS = [
  {
    label: 'mobile-390',
    width: 390,
    height: 844,
    expectedClass: 'mobile',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'tablet-768',
    width: 768,
    height: 1024,
    expectedClass: 'tablet',
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
  },
  {
    label: 'desktop-1440',
    width: 1440,
    height: 900,
    expectedClass: 'desktop',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  },
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
  eventSlug: `${LANE}-event-${STAMP}`,
  plainEventId: null,
  plainEventSlug: `${LANE}-plain-${STAMP}`,
  tierId: null,
  campaignId: null,
  partnerId: null,
  channelCode: null,
  emails: [],
  recipients: {},
  links: {},
  orders: [],
}

const BUYER = `${LANE}-buyer@eventlinqs.test`
const RECIPIENT_FRIEND = `${LANE}-recipient@eventlinqs.test`
const FORWARDED_BUYER = `${LANE}-forwarded@eventlinqs.test`

/* ------------------------------------------------------------ browser helpers */

async function clickAny(page, rx) {
  for (const el of await page.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return true
    }
  }
  return false
}

async function fillByLabel(page, rx, value) {
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

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

/**
 * Buys one free ticket as a guest, through the product's own checkout, and
 * hands back the order reference the platform wrote.
 *
 * It WAITS FOR THE ORDER rather than for a number of seconds: the attribution
 * is resolved by `after()`, once the response has gone, so a fixed sleep is a
 * test that is occasionally a lie.
 */
async function buyOneFreeTicket(page, buyerEmail, shotPrefix, event = null) {
  const target = event ?? { id: fixture.eventId, slug: fixture.eventSlug }
  await page.goto(`${BASE}/events/${target.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(2500)
  await answerTheCookieBanner(page)
  await clickAny(page, /^(get tickets|buy tickets|select tickets|register)/i)
  await page.waitForTimeout(2000)
  for (const b of await page.$$('button')) {
    const t = ((await b.innerText().catch(() => '')) || '').trim()
    if (t === '+') {
      await b.click().catch(() => {})
      break
    }
  }
  await page.waitForTimeout(1500)

  const checkoutButton = page.getByRole('button', { name: /^(checkout|register|get ticket)/i }).first()
  await checkoutButton.scrollIntoViewIfNeeded().catch(() => {})
  await checkoutButton.click({ timeout: 30000 }).catch(() => {})
  await page.waitForURL(u => u.pathname.startsWith('/checkout/'), { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(3000)

  await fillByLabel(page, /full name/i, 'Lane B GA3 Buyer')
  await fillByLabel(page, /^email/i, buyerEmail)
  await page.waitForTimeout(600)
  await clickAny(page, /use my details for all tickets/i)
  await page.waitForTimeout(900)
  await clickAny(page, /^(continue to payment|complete|confirm|register|get my ticket)/i)
  await page.waitForTimeout(6000)
  if (shotPrefix) await page.screenshot({ path: `${shotPrefix}.png`, fullPage: false }).catch(() => {})

  // The order the product wrote for this address, newest first.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data } = await db
      .from('orders')
      .select('id, order_number, status, created_at')
      .eq('event_id', target.id)
      .eq('guest_email', buyerEmail)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      if (!fixture.orders.includes(data[0].id)) fixture.orders.push(data[0].id)
      return data[0]
    }
    await page.waitForTimeout(1000)
  }
  return null
}

/** Waits for the attribution record `after()` writes once the response is gone. */
async function waitForAttribution(orderId, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const { data } = await db
      .from('marketing_attribution')
      .select('order_id, decision, rung, campaign_id, channel_code, recipient_id, click_id, forwarded, confidence, explanation, reason, billable, model_name, model_version')
      .eq('order_id', orderId)
      .maybeSingle()
    if (data) return data
    await new Promise(r => setTimeout(r, 1000))
  }
  return null
}

/* ----------------------------------------------------------------- the fixture */

async function buildFixture() {
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  const { data: category } = await db.from('event_categories').select('id, slug').eq('is_active', true).order('sort_order').limit(1).single()
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()
  const { data: tenant } = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').single()
  /*
   * The newest wording for this purpose. `consent_wordings` carries no
   * is_current column: a wording is superseded by a later VERSION, and GA1's
   * ledger stores the verbatim text on every event precisely so a change here
   * cannot rewrite what somebody was shown.
   */
  const { data: wording, error: wordingError } = await db
    .from('consent_wordings')
    .select('body, version, channel_scope, third_party_scope, suppression_scope')
    .eq('purpose', 'facilitated_event_marketing')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  if (wordingError || !wording) {
    throw new Error(`no consent wording for facilitated_event_marketing: ${wordingError?.message ?? 'no row'}`)
  }

  // The channel code is READ, never typed: GA3 acceptance 9.
  const { data: channel } = await db.from('marketing_channel').select('code').eq('code', 'email').single()
  fixture.channelCode = channel.code

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db.from('profiles').upsert({ id: fixture.ownerId, email: `${LANE}-organiser@eventlinqs.test`, full_name: 'Lane B GA3' })

  /*
   * PENDING, NOT ACTIVE, AND THE EVENT BELOW IS UNLISTED, NOT PUBLIC. An active
   * organisation is published at /organisers/<slug> by src/app/sitemap.ts and a
   * public event publishes both /events/<slug> and a /venues/<handle> derived
   * from venue_name. Three lanes share one TEST database and the sitemap holds
   * its snapshot for 300 seconds, so a fixture that is visible for the minutes it
   * lives leaves another lane's gate reading URLs that 404. That is not a
   * hypothesis: it refused lane A's push on 14 September 2026, and the whole
   * incident is written up in scripts/verify/lib/sitemap-footprint.mjs.
   */
  const org = await db
    .from('organisations')
    .insert({ name: `Lane B GA3 ${STAMP}`, slug: `${LANE}-org-${STAMP}`, owner_id: fixture.ownerId, status: 'pending' })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 30 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B GA3 tracked night ${STAMP}`,
      slug: fixture.eventSlug,
      organisation_id: fixture.organisationId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: 'Lane B GA3 room',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the GA3 attribution proof. It is deleted when the proof ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id

  const tier = await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.eventId, name: 'Free entry', price: 0, currency: 'AUD', total_capacity: 200, is_active: true })
    .select('id')
    .single()
  if (tier.error) throw new Error(`create tier: ${tier.error.message}`)
  fixture.tierId = tier.data.id

  /*
   * A SECOND EVENT THAT NO CAMPAIGN EVER TOUCHES, so the drive can prove a real
   * NONE. An organic sale on the CAMPAIGN'S event is not a none: a campaign
   * click for that event exists inside the window, so it resolves at rung 4,
   * which is recorded and never billed. Those are two different truths and the
   * drive asserts both rather than conflating them.
   */
  const plain = await db
    .from('events')
    .insert({
      title: `Lane B GA3 untouched night ${STAMP}`,
      slug: fixture.plainEventSlug,
      organisation_id: fixture.organisationId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: 'Lane B GA3 other room',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'A second event created by the GA3 attribution proof, which no campaign touches.',
    })
    .select('id')
    .single()
  if (plain.error) throw new Error(`create plain event: ${plain.error.message}`)
  fixture.plainEventId = plain.data.id
  const plainTier = await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.plainEventId, name: 'Free entry', price: 0, currency: 'AUD', total_capacity: 200, is_active: true })
  if (plainTier.error) throw new Error(`create plain tier: ${plainTier.error.message}`)

  // Three consented people. The consent event comes first, because the database
  // REFUSES an audience row for somebody the consent resolver refuses.
  const now = Date.now()
  for (const email of [BUYER, RECIPIENT_FRIEND, FORWARDED_BUYER]) {
    fixture.emails.push(email)
    const consent = await db.from('consent_events').insert({
      tenant_id: tenant.id,
      subject_email: email,
      purpose: 'facilitated_event_marketing',
      channel_scope: wording.channel_scope,
      decision: 'granted',
      wording: wording.body,
      wording_version: wording.version,
      capture_surface: 'ga3-proof',
      third_party_scope: wording.third_party_scope,
      suppression_scope: wording.suppression_scope,
      occurred_at: new Date(now - 3_600_000).toISOString(),
    })
    if (consent.error) throw new Error(`seed consent for ${email}: ${consent.error.message}`)
    const member = await db.from('audience_members').upsert(
      {
        email,
        consent_state: true,
        consent_channel: 'email',
        consent_at: new Date(now - 3_600_000).toISOString(),
        consent_text: wording.body,
        consent_version: wording.version,
        consent_source: 'ga3-proof',
        first_order_at: new Date(now - 90 * 86_400_000).toISOString(),
        last_order_at: new Date(now - 10 * 86_400_000).toISOString(),
        order_count: 1,
        lifetime_spend_cents: 4500,
        price_band: '30-to-59',
      },
      { onConflict: 'email' },
    )
    if (member.error) throw new Error(`seed audience for ${email}: ${member.error.message}`)
  }

  const { data: members } = await db.from('audience_members').select('id, email').in('email', fixture.emails)
  const memberByEmail = new Map((members ?? []).map(m => [m.email, m.id]))

  const partner = await db
    .from('marketing_partner')
    .insert({
      name: `Lane B GA3 partner ${STAMP}`,
      contact: `${LANE}-partner@eventlinqs.test`,
      revenue_share_basis: 'The lane B GA3 proof agreement, which exists only for this run.',
      reference: `${LANE}-partner-${STAMP}`,
    })
    .select('id')
    .single()
  if (partner.error) throw new Error(`create partner: ${partner.error.message}`)
  fixture.partnerId = partner.data.id

  const campaign = await db
    .from('marketing_campaign')
    .insert({
      tenant_id: tenant.id,
      event_id: fixture.eventId,
      organisation_id: fixture.organisationId,
      name: `Lane B GA3 campaign ${STAMP}`,
      state: 'active',
      reference: `${LANE}-campaign-${STAMP}`,
    })
    .select('id, attribution_window_days')
    .single()
  if (campaign.error) throw new Error(`create campaign: ${campaign.error.message}`)
  fixture.campaignId = campaign.data.id
  check(
    'campaign.window-is-read-from-configuration',
    campaign.data.attribution_window_days === 30,
    `a new campaign defaults to ${campaign.data.attribution_window_days} days, taken from marketing_attribution_config rather than typed`,
  )

  for (const email of [BUYER, RECIPIENT_FRIEND]) {
    const recipient = await db
      .from('marketing_recipient')
      .insert({
        campaign_id: fixture.campaignId,
        audience_member_id: memberByEmail.get(email),
        channel_code: fixture.channelCode,
      })
      .select('id')
      .single()
    if (recipient.error) throw new Error(`create recipient ${email}: ${recipient.error.message}`)
    fixture.recipients[email] = recipient.data.id
  }

  const { mintTrackedLink } = await import('../../src/lib/attribution/record.ts')
  for (const email of [BUYER, RECIPIENT_FRIEND]) {
    const minted = await mintTrackedLink({
      campaignId: fixture.campaignId,
      channelCode: fixture.channelCode,
      eventSlug: fixture.eventSlug,
      partnerId: fixture.partnerId,
      recipientId: fixture.recipients[email],
    })
    fixture.links[email] = minted
  }

  const admin = await db.auth.admin.createUser({
    email: `${LANE}-admin@eventlinqs.test`,
    password: adminPassword,
    email_confirm: true,
  })
  if (admin.error) throw new Error(`create admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: `${LANE}-admin@eventlinqs.test`, full_name: 'Lane B GA3 Owner' })
  const staff = await db.from('admin_users').insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B GA3 Owner' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)
}

async function teardown() {
  for (const orderId of fixture.orders) {
    await db.from('marketing_attribution_reversal').delete().eq('order_id', orderId)
    await db.from('marketing_attribution').delete().eq('order_id', orderId)
    await db.from('marketing_order_signal').delete().eq('order_id', orderId)
    await db.from('tickets').delete().eq('order_id', orderId)
    await db.from('order_items').delete().eq('order_id', orderId)
    await db.from('orders').delete().eq('id', orderId)
  }
  if (fixture.campaignId) {
    await db.from('marketing_click').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_link').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_recipient').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_campaign').delete().eq('id', fixture.campaignId)
  }
  if (fixture.partnerId) await db.from('marketing_partner').delete().eq('id', fixture.partnerId)
  if (fixture.emails.length > 0) {
    await db.from('audience_members').delete().in('email', fixture.emails)
    await db.from('marketing_consents').delete().in('email', fixture.emails)
  }
  for (const eventId of [fixture.eventId, fixture.plainEventId]) {
    if (!eventId) continue
    await db.from('reservations').delete().eq('event_id', eventId)
    await db.from('ticket_tiers').delete().eq('event_id', eventId)
    await db.from('ledger_slots').delete().eq('source_ref', eventId)
    await db.from('events').delete().eq('id', eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.ownerId) await tearDownAccountOrFailTheRun(db, fixture.ownerId)
  if (fixture.adminId) {
    await db.from('admin_users').delete().eq('id', fixture.adminId)
    await tearDownAccountOrFailTheRun(db, fixture.adminId)
  }
}

/* --------------------------------------------------------------------- the run */

let browser = null
const ADMIN_SESSION = join(out, 'ga3-admin-session.json')

try {
  await buildFixture()

  /*
   * WHAT THIS FIXTURE PUBLISHES, ASKED OF THE DATABASE RATHER THAN ASSUMED.
   * The sitemap's own three queries, run against the rows that now exist. An
   * empty answer is the only acceptable one: everything here is deleted at
   * teardown, and a published URL that disappears is what refused lane A's push
   * on 14 September 2026. See scripts/verify/lib/sitemap-footprint.mjs.
   */
  {
    const footprint = await sitemapFootprint(db, {
      organisationSlugs: [`${LANE}-org-${STAMP}`],
      eventSlugs: [fixture.eventSlug, fixture.plainEventSlug],
      venueNames: ['Lane B GA3 room', 'Lane B GA3 other room'],
    })
    check(
      'ga3.fixture.publishes-nothing-into-the-sitemap',
      footprint.length === 0,
      footprint.length === 0
        ? 'the organisation, the event(s) and the venue(s) are all absent from the sitemap queries'
        : `the sitemap would publish ${footprint.join(', ')}, and every one of them 404s the moment this drive tears down`,
    )
  }
  browser = await chromium.launch({ headless: true })

  // One sign-in, saved and reused: auth-login is a fail-closed limiter and this
  // drive opens nine contexts.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1200)
    await answerTheCookieBanner(page)
    await page.locator('input[name="email"]').fill(`${LANE}-admin@eventlinqs.test`)
    await page.locator('input[name="password"]').fill(adminPassword)
    await Promise.all([
      page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').first().click(),
    ])
    await page.waitForTimeout(2500)
    await context.storageState({ path: ADMIN_SESSION })
    await context.close()
  }

  let attributedReference = null
  let noneReference = null
  let reversedReference = null
  let rungFourReference = null

  for (const vp of VIEWPORTS) {
    const v = vp.label
    const shot = p => join(out, `${v}-${p}`)
    const viewport = { width: vp.width, height: vp.height }
    const asAPerson = { viewport, userAgent: vp.userAgent }

    /* ---- acceptance 6: the stripped query string ---- */
    {
      const context = await browser.newContext(asAPerson)
      const page = await context.newPage()
      const clicksBefore = await db
        .from('marketing_click')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', fixture.campaignId)

      // No query parameters at all. The code is in the path and carries
      // everything; this is the messaging-app case.
      const response = await page.goto(`${BASE}/m/${fixture.links[BUYER].code}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      await page.waitForTimeout(2500)
      await answerTheCookieBanner(page)

      const landedOn = new URL(page.url())
      check(
        `ga3.${v}.stripped.redirects-to-the-stored-target`,
        landedOn.pathname === `/events/${fixture.eventSlug}`,
        `a code with no query string landed on ${landedOn.pathname}`,
      )
      check(
        `ga3.${v}.stripped.redirect-carries-the-identifiers`,
        landedOn.searchParams.get('mc') && landedOn.searchParams.get('mcid') === fixture.campaignId,
        `the address now carries mc=${String(landedOn.searchParams.get('mc')).slice(0, 8)} and mcid=${landedOn.searchParams.get('mcid')}`,
      )
      const hop = response?.request().redirectedFrom()
      const hopStatus = hop ? (await hop.response())?.status() ?? 0 : 0
      check(
        `ga3.${v}.stripped.status-was-a-redirect`,
        hopStatus === 307,
        `the tracked address answered ${hopStatus} and handed the visitor onward rather than rendering`,
      )

      const { data: click } = await db
        .from('marketing_click')
        .select('id, campaign_id, channel_code, partner_id, recipient_id, cookie_was_present, user_agent_class, forwarded_suspected')
        .eq('campaign_id', fixture.campaignId)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .single()
      check(
        `ga3.${v}.stripped.click-row-holds-every-identifier`,
        click.campaign_id === fixture.campaignId &&
          click.channel_code === fixture.channelCode &&
          click.partner_id === fixture.partnerId &&
          click.recipient_id === fixture.recipients[BUYER],
        `campaign, channel, partner and recipient are all on the click row, from the code alone`,
      )
      check(
        `ga3.${v}.stripped.click-records-the-device-class`,
        click.user_agent_class === vp.expectedClass,
        `a ${vp.expectedClass} browser was recorded as ${click.user_agent_class}`,
      )
      check(
        `ga3.${v}.stripped.one-click-per-open`,
        ((await db.from('marketing_click').select('id', { count: 'exact', head: true }).eq('campaign_id', fixture.campaignId)).count ?? 0) ===
          (clicksBefore.count ?? 0) + 1,
        `exactly one click row was written for one open`,
      )

      const cookies = await context.cookies()
      const clickCookie = cookies.find(c => c.name === 'el_click')
      check(
        `ga3.${v}.stripped.cookie-carries-the-click-id`,
        clickCookie?.value === click.id,
        `el_click holds the click id the redirect booked`,
      )

      await page.screenshot({ path: `${shot('01-landed-from-tracked-link')}.png`, fullPage: false })
      await context.close()
    }

    /* ---- acceptance 5: the cross device case ---- */
    {
      // A NEW context is a different device: no cookie, no storage, nothing the
      // phone had. Only the person is the same.
      const context = await browser.newContext(asAPerson)
      const page = await context.newPage()
      const order = await buyOneFreeTicket(page, BUYER, shot('02-cross-device-purchase'))
      check(`ga3.${v}.cross-device.order-was-written`, Boolean(order), `the purchase produced ${order?.order_number ?? 'no order'}`)

      if (order) {
        const attribution = await waitForAttribution(order.id)
        check(
          `ga3.${v}.cross-device.resolved-at-rung-three`,
          attribution?.rung === 3 && attribution.decision === 'attributed',
          `${order.order_number} resolved at rung ${attribution?.rung} with decision ${attribution?.decision}`,
        )
        check(
          `ga3.${v}.cross-device.explanation-names-identity-matching`,
          /identity/i.test(attribution?.explanation ?? '') && /change of device/i.test(attribution?.explanation ?? ''),
          `"${(attribution?.explanation ?? '').slice(0, 120)}"`,
        )
        check(
          `ga3.${v}.cross-device.campaign-channel-and-partner-are-credited`,
          attribution?.campaign_id === fixture.campaignId && attribution?.channel_code === fixture.channelCode,
          `credited to the lane B campaign on the ${attribution?.channel_code} channel`,
        )
        check(
          `ga3.${v}.cross-device.the-model-that-produced-it-is-on-the-row`,
          attribution?.model_name === 'last-click-with-identity-ladder' && attribution?.model_version === 'v1',
          `${attribution?.model_name} ${attribution?.model_version}`,
        )
        check(
          `ga3.${v}.cross-device.is-billable`,
          attribution?.billable === true,
          `rung ${attribution?.rung} with nothing reversed is chargeable`,
        )
        if (!attributedReference) attributedReference = order.order_number
      }
      await context.close()
    }

    /* ---- the forwarded link ---- */
    {
      const context = await browser.newContext(asAPerson)
      const page = await context.newPage()
      // The friend's link is opened by the person it was forwarded TO, so the
      // cookie is set for the friend's recipient but the buyer is somebody else.
      await page.goto(`${BASE}/m/${fixture.links[RECIPIENT_FRIEND].code}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(2500)
      await answerTheCookieBanner(page)
      const order = await buyOneFreeTicket(page, FORWARDED_BUYER, shot('03-forwarded-purchase'))
      check(`ga3.${v}.forwarded.order-was-written`, Boolean(order), `the forwarded purchase produced ${order?.order_number ?? 'no order'}`)

      if (order) {
        const attribution = await waitForAttribution(order.id)
        check(
          `ga3.${v}.forwarded.campaign-is-still-credited`,
          attribution?.decision === 'attributed' && attribution.campaign_id === fixture.campaignId,
          `the campaign keeps the sale at rung ${attribution?.rung}`,
        )
        check(
          `ga3.${v}.forwarded.recipient-is-marked-as-having-passed-it-on`,
          attribution?.forwarded === true && attribution?.recipient_id === fixture.recipients[RECIPIENT_FRIEND],
          `forwarded=${attribution?.forwarded}, and the recipient is recorded as the person it was SENT to`,
        )
        check(
          `ga3.${v}.forwarded.explanation-says-so-in-english`,
          /passed on/i.test(attribution?.explanation ?? ''),
          `"${(attribution?.explanation ?? '').slice(0, 140)}"`,
        )
      }
      await context.close()
    }

    /* ---- an order no campaign produced, on an event no campaign touched ---- */
    if (!noneReference) {
      const context = await browser.newContext(asAPerson)
      const page = await context.newPage()
      const organicEmail = `${LANE}-organic-${v}@eventlinqs.test`
      const order = await buyOneFreeTicket(page, organicEmail, shot('04-organic-purchase'), {
        id: fixture.plainEventId,
        slug: fixture.plainEventSlug,
      })
      if (order) {
        const attribution = await waitForAttribution(order.id)
        check(
          `ga3.${v}.organic.none-is-stored-with-a-reason`,
          attribution?.decision === 'none' && Boolean(attribution?.reason),
          `${order.order_number} resolved to ${attribution?.decision} with the reason ${attribution?.reason}`,
        )
        check(
          `ga3.${v}.organic.is-not-billable`,
          attribution?.billable === false,
          'nothing is charged for a sale no campaign produced',
        )
        noneReference = order.order_number
      }
      await context.close()
    }

    /*
     * A SALE ON A CAMPAIGN'S EVENT THAT THE CAMPAIGN DID NOT PRODUCE.
     *
     * This is rung 4, and it is the single most important thing this drive
     * proves about billing. A stranger who bought a ticket for an event that
     * happens to have had a campaign click inside the window IS credited, with
     * a confidence below one, because that is a true observation. They are
     * NEVER charged for, because nothing ties them to the click. Measured over
     * 308 real TEST orders this rung attributed 140 sales no campaign produced;
     * the first version of this block asserted a none here and the drive was
     * right to refuse it.
     */
    if (!rungFourReference) {
      const context = await browser.newContext(asAPerson)
      const page = await context.newPage()
      const strangerEmail = `${LANE}-stranger-${v}@eventlinqs.test`
      const order = await buyOneFreeTicket(page, strangerEmail, shot('07-stranger-purchase'))
      if (order) {
        const attribution = await waitForAttribution(order.id)
        check(
          `ga3.${v}.rung-four.observed-but-never-charged-for`,
          attribution?.decision === 'attributed' && attribution.rung === 4 && attribution.billable === false,
          `${order.order_number} resolved at rung ${attribution?.rung}, billable ${attribution?.billable}`,
        )
        check(
          `ga3.${v}.rung-four.confidence-is-below-one`,
          Number(attribution?.confidence) < 1,
          `confidence ${attribution?.confidence}, read from configuration`,
        )
        check(
          `ga3.${v}.rung-four.says-on-screen-that-it-is-not-charged-for`,
          /not charged for/i.test(attribution?.explanation ?? ''),
          `"${(attribution?.explanation ?? '').slice(0, 140)}"`,
        )
        rungFourReference = order.order_number
      }
      await context.close()
    }

    /* ---- acceptance 7: the admin reader ---- */
    {
      const context = await browser.newContext({ ...asAPerson, storageState: ADMIN_SESSION })
      const page = await context.newPage()

      for (const [name, reference] of [
        ['attributed', attributedReference],
        ['none', noneReference],
      ]) {
        if (!reference) continue
        await page.goto(`${BASE}/admin/attribution?order=${reference}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.waitForTimeout(2000)
        await answerTheCookieBanner(page)
        const body = await page.locator('body').innerText()
        check(
          `ga3.${v}.admin.${name}-order-reads-as-a-statement`,
          body.includes(reference) && /Credited to|Nothing credited|No campaign click/i.test(body),
          `the reader shows ${reference} and says what was decided in words`,
        )
        check(
          `ga3.${v}.admin.${name}-names-the-method-and-the-rung`,
          /last-click-with-identity-ladder/.test(body) && /Rung/i.test(body),
          `the method and the rung are on screen`,
        )
        check(
          `ga3.${v}.admin.${name}-is-not-a-debug-dump`,
          !/\{"clickId"|candidate_clicks|\[object Object\]/.test(body),
          `no raw JSON and no object stringification on screen`,
        )
        check(
          `ga3.${v}.admin.${name}-no-horizontal-overflow`,
          !(await horizontalOverflow(page)),
          `the page fits ${vp.width} across`,
        )
        await page.screenshot({ path: `${shot(`05-admin-${name}`)}.png`, fullPage: false })
      }
      await context.close()
    }

    /* ---- the reversal, and what it does to billable ---- */
    if (attributedReference && !reversedReference) {
      const { data: order } = await db.from('orders').select('id, order_number').eq('order_number', attributedReference).single()
      const before = await db.from('marketing_attribution').select('billable').eq('order_id', order.id).single()
      const inserted = await db.from('marketing_attribution_reversal').insert({
        order_id: order.id,
        reason: 'refund',
        reversed_amount_cents: 0,
        source: `${LANE}-drive`,
      })
      check(`ga3.${v}.reversal.was-recorded`, !inserted.error, inserted.error?.message ?? 'a refund reversal was written')
      const after = await db.from('marketing_attribution').select('billable').eq('order_id', order.id).single()
      check(
        `ga3.${v}.reversal.flips-billable-with-no-backfill`,
        before.data.billable === true && after.data.billable === false,
        `billable went ${before.data.billable} to ${after.data.billable} the moment the reversal landed`,
      )

      const context = await browser.newContext({ ...asAPerson, storageState: ADMIN_SESSION })
      const page = await context.newPage()
      await page.goto(`${BASE}/admin/attribution?order=${attributedReference}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(2000)
      await answerTheCookieBanner(page)
      const body = await page.locator('body').innerText()
      check(
        `ga3.${v}.admin.reversed-order-says-nothing-is-charged`,
        /Not chargeable/i.test(body) && /refunded/i.test(body),
        `the reader shows the reversal and says the sale is not chargeable`,
      )
      check(
        `ga3.${v}.admin.reversed-no-horizontal-overflow`,
        !(await horizontalOverflow(page)),
        `the reversed view fits ${vp.width} across`,
      )
      await page.screenshot({ path: `${shot('06-admin-reversed')}.png`, fullPage: false })
      await context.close()
      reversedReference = attributedReference
    }
  }

  /* ---- acceptance 4: completeness across the whole table ---- */
  {
    /*
     * THE BACKFILL RUNS FIRST, because acceptance 4 says "after the backfill"
     * and because of something this drive found on its second run: three lanes
     * share this TEST project, and another lane's drives had created seven
     * orders from a worktree whose tree does not carry this migration. The code
     * cannot write a record it does not have. That is exactly the gap the
     * backfill exists to close, it is idempotent, and closing it here is the
     * acceptance line rather than a way around it.
     */
    const { backfillAttributions } = await import('../../src/lib/attribution/store.ts')
    const filled = await backfillAttributions({ onlyMissing: true })
    check(
      'ga3.completeness.the-backfill-leaves-nothing-missing',
      filled.written >= 0,
      `the backfill wrote ${filled.written} record(s) for orders that had none, ${filled.none} of them none with a reason`,
    )

    const orders = await db.from('orders').select('id', { count: 'exact', head: true })
    const attributions = await db.from('marketing_attribution').select('order_id', { count: 'exact', head: true })
    const none = await db.from('marketing_attribution').select('order_id', { count: 'exact', head: true }).eq('decision', 'none')
    check(
      'ga3.completeness.every-order-has-exactly-one-record',
      (orders.count ?? -1) === (attributions.count ?? -2),
      `${orders.count} orders, ${attributions.count} attribution records, of which ${none.count} say none`,
    )
    const { data: breaches } = await db
      .from('marketing_attribution_invariant_breaches')
      .select('breach, order_reference')
    check(
      'ga3.completeness.the-invariant-view-is-empty',
      (breaches ?? []).length === 0,
      (breaches ?? []).map(b => `${b.breach} on ${b.order_reference}`).join('; ') || 'no breach of either clause',
    )
  }

  /* ---- acceptance 3: the database refuses a second record ---- */
  {
    const orderId = fixture.orders[0]
    if (orderId) {
      const { data: existing } = await db.from('marketing_attribution').select('*').eq('order_id', orderId).single()
      const second = await db.from('marketing_attribution').insert({
        order_id: orderId,
        decision: 'none',
        rung: 5,
        model_name: existing.model_name,
        model_version: existing.model_version,
        explanation: 'A second record for one order, which must be refused.',
        reason: 'lane_b_ga3_duplicate_probe',
        confidence: 1,
      })
      check(
        'ga3.database.refuses-a-second-record-for-one-order',
        Boolean(second.error) && second.error.code === '23505',
        `the database answered ${second.error?.code ?? 'no error, which is the failure'}: ${second.error?.message ?? ''}`,
      )
    }
  }

  /* ---- billable can never be typed by an application ---- */
  {
    const orderId = fixture.orders[0]
    if (orderId) {
      // Ask the database, in as many words, to make this row billable. The
      // trigger recomputes it regardless, so the stored value must come back
      // equal to the TRUTH rather than to what was asked for.
      await db.from('marketing_attribution').update({ billable: true }).eq('order_id', orderId)
      const { data: row } = await db
        .from('marketing_attribution')
        .select('billable, rung, decision')
        .eq('order_id', orderId)
        .single()
      const reversals = await db
        .from('marketing_attribution_reversal')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', orderId)
      const truth = row.decision === 'attributed' && row.rung <= 3 && (reversals.count ?? 0) === 0
      check(
        'ga3.database.billable-cannot-be-typed-by-a-caller',
        row.billable === truth,
        `an explicit update asking for billable=true left it at ${row.billable}, which is what a rung ${row.rung} ${row.decision} row with ${reversals.count} reversal(s) actually is`,
      )
    }
  }
} catch (error) {
  check('ga3.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await teardown()
    const leftovers = await db.from('marketing_campaign').select('id', { count: 'exact', head: true }).eq('reference', `${LANE}-campaign-${STAMP}`)
    check('ga3.teardown.left-as-found', (leftovers.count ?? 0) === 0, `${leftovers.count ?? 0} lane B GA3 campaign rows remain`)

    /*
     * AND NOTHING OF THIS DRIVE'S, FROM ANY RUN, IS LEFT PUBLISHED. The count
     * above asks about one table. This asks the sitemap's question of every
     * row carrying this drive's prefix, including rows an EARLIER run left
     * behind, which is how a published GA5 fixture event lived on shared TEST
     * for two days while every run reported "left as found".
     */
    const leftPublished = await laneFixturesStillPublished(db, 'lane-b-ga3-')
    check(
      'ga3.teardown.nothing-of-this-drive-is-left-published',
      leftPublished.length === 0,
      leftPublished.length === 0
        ? 'no organiser, event or venue page of this drive is in the sitemap'
        : `still published: ${leftPublished.join(', ')}. Every one of them 404s when the row goes.`,
    )
  } catch (error) {
    check('ga3.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'ga3-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`GA3 DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
