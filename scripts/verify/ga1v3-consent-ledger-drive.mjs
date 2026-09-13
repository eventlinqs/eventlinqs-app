/**
 * GA1 v3 DRIVEN PROOF. The consent ledger, the one resolver and both privacy
 * rights, exercised through the same interface a person uses, at 390, 768 and
 * 1440.
 *
 * IT SUPERSEDES scripts/verify/ga1-audience-drive.mjs, which drove the earlier
 * version of this item: consent then lived as a current-state row and the
 * checkout asked a vaguer question. Both are now wrong, so the old drive is
 * gone rather than left in the tree asserting behaviour the platform no longer
 * has.
 *
 * WHAT IT DRIVES, and which acceptance line each answers.
 *
 *   1. A guest buys a ticket with the box TICKED. Exactly one consent event is
 *      written, carrying every column the item names, with the wording stored
 *      verbatim from the versioned record, and one audience row appears.
 *                                                              (acceptance 1)
 *   2. A guest buys with the box LEFT ALONE. The order confirms exactly as
 *      before, a DECLINED event is written, and no audience row exists at all.
 *                                                              (acceptance 2)
 *   3. The unsubscribe link is opened with NO SESSION AT ALL. One press writes
 *      one suppression covering every channel, the resolver refuses
 *      immediately afterwards, and a second visit changes nothing.
 *                                                              (acceptance 7)
 *   4. The rights routes: the token page answers where the details came from
 *      (APP 7.7) and stops the facilitation on one press (APP 7.6), and the
 *      no-token page records the same stop request from the privacy policy
 *      entry point.                                            (acceptance 8)
 *   5. The admin view: the counts equal a direct query and the subject lookup
 *      answers one person's history in sentences.             (step 10)
 *
 * EVERY ROW IT CREATES CARRIES lane-b. Everything that CAN be removed is
 * removed in a `finally`, and what cannot is reported rather than pretended
 * away: the consent and suppression ledgers refuse DELETE, by design and by
 * the item's own first principle, so this drive leaves its ledger rows behind
 * and says how many.                                          (acceptance 13)
 *
 * WHY IT BUYS A FREE TICKET. There is no working Stripe TEST secret key on this
 * machine (REVIEW-QUEUE-B.md records it as a credential the owner must mint),
 * so a card payment cannot complete here. A FREE order takes the identical
 * confirmation path, `confirm_order`, which is the same RPC the paid path calls
 * from the webhook and the thing that fires the audience trigger. The behaviour
 * of every database rule underneath it is proved directly by
 * scripts/verify/ga1v3-consent-ledger-proof.sql.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     --import ./scripts/lib/src-alias-loader.mjs \
 *     scripts/verify/ga1v3-consent-ledger-drive.mjs --out C:/dev/EVIDENCE/GA1V3
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { COMMUNITY_TO_TAGS } from '../../src/lib/communities/tag-bridge.ts'

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

const STAMP = Date.now().toString(36)
const LANE = `lane-b-ga1v3-${STAMP}`
const adminPassword = `${randomUUID()}Aa1`
const buyerEmails = []

/** The wording is READ from the record, exactly as the page reads it. */
let wordingRecord = null

/* --------------------------------------------------------------- the fixture */

const [expectedCommunity, communityTokens] = Object.entries(COMMUNITY_TO_TAGS)[0]
const communityToken = communityTokens[0]

const fixture = {
  ownerId: null,
  organisationId: null,
  eventId: null,
  eventSlug: null,
  tierId: null,
  adminId: null,
  citySlug: null,
  categorySlug: null,
  coverImageUrl: null,
  postcode: '3220',
}

async function buildFixture() {
  const { data: wording, error: wordingError } = await db
    .from('consent_wordings')
    .select('purpose, version, label, body, channel_scope, third_party_scope, suppression_scope')
    .eq('purpose', 'facilitated_event_marketing')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  if (wordingError) throw new Error(`read the wording record: ${wordingError.message}`)
  wordingRecord = wording

  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  fixture.citySlug = city.slug
  const { data: category } = await db.from('event_categories').select('id, slug').eq('is_active', true).order('sort_order').limit(1).single()
  fixture.categorySlug = category.slug

  /*
   * A REAL COVER, BORROWED FROM A REAL EVENT. `events_published_real_cover`
   * refuses a published public event with no cover or with a placeholder, and
   * it is right to. The drive reads the cover off an event that already has
   * one, so the fixture looks like the platform rather than like a test.
   */
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()
  fixture.coverImageUrl = cover.cover_image_url

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db.from('profiles').upsert({ id: fixture.ownerId, email: `${LANE}-organiser@eventlinqs.test`, full_name: 'Lane B GA1v3 Organiser' })

  const org = await db
    .from('organisations')
    .insert({ name: `Lane B GA1v3 ${STAMP}`, slug: `${LANE}-org`, owner_id: fixture.ownerId, status: 'active' })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 21 * 86_400_000)
  const end = new Date(start.getTime() + 3 * 3_600_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B GA1v3 free night ${STAMP}`,
      slug: `${LANE}-event`,
      organisation_id: fixture.organisationId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: fixture.citySlug,
      venue_name: 'Lane B GA1v3 room',
      venue_city: fixture.citySlug,
      venue_postal_code: fixture.postcode,
      is_free: true,
      cover_image_url: fixture.coverImageUrl,
      tags: [communityToken],
      summary: 'A free night created by the GA1 v3 driven proof. It is deleted when the drive ends.',
    })
    .select('id, slug')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id
  fixture.eventSlug = event.data.slug

  const tier = await db
    .from('ticket_tiers')
    .insert({
      event_id: fixture.eventId,
      name: 'Free entry',
      price: 0,
      // UPPERCASE. ticket_tiers.currency is unconstrained and orders.currency
      // is not, so a lowercase code here produces a checkout that answers
      // "Failed to create order" for ever and names nothing.
      currency: 'AUD',
      total_capacity: 60,
      is_active: true,
    })
    .select('id')
    .single()
  if (tier.error) throw new Error(`create tier: ${tier.error.message}`)
  fixture.tierId = tier.data.id

  const admin = await db.auth.admin.createUser({
    email: `${LANE}-admin@eventlinqs.test`,
    password: adminPassword,
    email_confirm: true,
  })
  if (admin.error) throw new Error(`create admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: `${LANE}-admin@eventlinqs.test`, full_name: 'Lane B GA1v3 Owner' })
  const staff = await db.from('admin_users').insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B GA1v3 Owner' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)
}

/* ------------------------------------------------------------------ teardown */

async function teardown() {
  const emails = buyerEmails
  const { data: orders } = await db.from('orders').select('id').eq('event_id', fixture.eventId ?? randomUUID())
  const orderIds = (orders ?? []).map(o => o.id)
  if (orderIds.length > 0) {
    await db.from('tickets').delete().in('order_id', orderIds)
    await db.from('order_items').delete().in('order_id', orderIds)
    await db.from('ledger_entries').delete().in('source_ref', [fixture.eventId])
    await db.from('orders').delete().in('id', orderIds)
  }
  if (emails.length > 0) {
    await db.from('audience_members').delete().in('email', emails)
    await db.from('marketing_consents').delete().in('email', emails)
    await db.from('organiser_marketing_consents').delete().in('email', emails)
    await db.from('email_subscribers').delete().in('email', emails)
  }
  if (fixture.eventId) {
    await db.from('reservations').delete().eq('event_id', fixture.eventId)
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('ledger_slots').delete().eq('source_ref', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.adminId) {
    await db.from('admin_users').delete().eq('id', fixture.adminId)
    await db.auth.admin.deleteUser(fixture.adminId).catch(() => {})
  }
  if (fixture.ownerId) await db.auth.admin.deleteUser(fixture.ownerId).catch(() => {})
}

/* -------------------------------------------------------------- the buyer's path */

/**
 * ANSWER THE COOKIE BANNER FIRST, BECAUSE THAT IS WHAT A PERSON DOES.
 *
 * The analytics consent banner (close-out AN1, work in progress on this branch)
 * is fixed to the bottom of the viewport, and on a page too short to scroll a
 * control clear of it, it intercepts the click. That is a real AN1 defect and
 * it is recorded as one in REVIEW-QUEUE-B.md rather than papered over here.
 * Answering it is not the workaround: it is what a visitor does.
 */
async function answerTheCookieBanner(page) {
  const banner = page.locator('[aria-label="Cookies and measurement"]')
  if ((await banner.count()) === 0) return false
  if (!(await banner.first().isVisible().catch(() => false))) return false
  const no = banner.getByRole('button', { name: /no thanks/i }).first()
  if ((await no.count()) > 0) {
    await no.click({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    return true
  }
  return false
}

async function clickByText(page, rx) {
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
      e => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || '',
    )
    if (rx.test(n)) {
      await el.fill(value).catch(() => {})
      return true
    }
  }
  return false
}

async function buyFreeTicket(page, { email, name, tickConsent, shotPrefix }) {
  await page.goto(`${BASE}/events/${fixture.eventSlug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(3000)
  await answerTheCookieBanner(page)
  await clickByText(page, /^(get tickets|buy tickets|select tickets|register)/i)
  await page.waitForTimeout(2000)
  for (const b of await page.$$('button')) {
    const t = ((await b.innerText().catch(() => '')) || '').trim()
    if (t === '+') { await b.click().catch(() => {}); break }
  }
  await page.waitForTimeout(1500)

  const toCheckout = page.locator('button, a').filter({ hasText: /checkout|continue|register/i }).first()
  await Promise.all([
    page.waitForURL(u => u.pathname.startsWith('/checkout'), { timeout: 60000 }).catch(() => {}),
    toCheckout.click({ timeout: 30000 }).catch(() => {}),
  ])
  await page.waitForTimeout(3000)

  const onCheckout = new URL(page.url()).pathname.startsWith('/checkout')
  if (!onCheckout) return { reachedCheckout: false }

  /*
   * FILL, THEN CHECK IT WENT IN, THEN FILL AGAIN.
   *
   * The first run of this drive reported "the buyer who ignored the question
   * got order none" at 390 only, and the screenshot showed an empty name field
   * with the browser's own "Please fill out this field". Nothing was wrong with
   * the product: the second checkout of the run raced its own hydration and the
   * fill landed on an input that was then re-rendered. A drive that reports a
   * product defect it caused itself is worse than no drive, so this fills, reads
   * the values back, and repeats once before it gives up.
   */
  const fillTheBuyer = async () => {
    await fillByLabel(page, /name/i, name)
    await fillByLabel(page, /email/i, email)
    for (const el of await page.$$('input[type="email"]')) {
      if (await el.isVisible().catch(() => false)) await el.fill(email).catch(() => {})
    }
    for (const el of await page.$$('input')) {
      const n = await el.evaluate(e => e.getAttribute('name') || '')
      if (/first|last|name/i.test(n) && (await el.isVisible().catch(() => false))) {
        const v = await el.inputValue().catch(() => '')
        if (!v) await el.fill(/first/i.test(n) ? 'Lane' : 'Bravo').catch(() => {})
      }
    }
  }
  const buyerFieldsAreFilled = async () => {
    for (const el of await page.$$('input')) {
      if (!(await el.isVisible().catch(() => false))) continue
      const required = await el.evaluate(e => e.hasAttribute('required'))
      if (!required) continue
      const value = await el.inputValue().catch(() => '')
      if (!value.trim()) return false
    }
    return true
  }
  await fillTheBuyer()
  if (!(await buyerFieldsAreFilled())) {
    await page.waitForTimeout(2000)
    await fillTheBuyer()
  }

  const box = page.locator('#platform-marketing-consent')
  const questionVisible = (await box.count()) > 0 && (await box.isVisible().catch(() => false))
  const panelText = questionVisible
    ? ((await page.locator('#platform-marketing-consent').locator('xpath=ancestor::div[1]/..').innerText().catch(() => '')) || '').trim()
    : null

  if (questionVisible) {
    await box.scrollIntoViewIfNeeded().catch(() => {})
    await page.screenshot({ path: `${shotPrefix}-consent-question.png`, fullPage: false })
  }

  const wasCheckedBefore = questionVisible ? await box.isChecked().catch(() => null) : null
  if (tickConsent && questionVisible) await box.check().catch(() => {})

  const submit = page.locator('button[type="submit"]').filter({ hasText: /register|continue to payment/i }).first()
  await Promise.all([
    page.waitForURL(u => !u.pathname.startsWith('/checkout'), { timeout: 90000 }).catch(() => {}),
    submit.click({ timeout: 30000 }).catch(() => {}),
  ])
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${shotPrefix}-after-register.png`, fullPage: false })

  const { data: order } = await db
    .from('orders')
    .select('id, status, total_cents, confirmed_at')
    .eq('event_id', fixture.eventId)
    .eq('guest_email', email)
    .maybeSingle()

  return {
    reachedCheckout: true,
    questionVisible,
    panelText,
    wasCheckedBefore,
    landedOn: new URL(page.url()).pathname,
    order: order ?? null,
  }
}

/** The SQL resolver's own answer, asked the way a send path asks it. */
async function resolverSays(email, channel, purpose) {
  const { data, error } = await db.rpc('consent_permits', {
    p_tenant_slug: 'eventlinqs',
    p_email: email,
    p_channel: channel,
    p_purpose: purpose,
  })
  if (error) return { permitted: null, reason: error.message }
  const row = Array.isArray(data) ? data[0] : data
  return { permitted: row?.permitted ?? null, reason: row?.reason ?? 'no answer' }
}

async function consentEventsFor(email) {
  const { data } = await db
    .from('consent_events')
    .select('*')
    .eq('subject_email', email)
    .order('occurred_at', { ascending: true })
  return data ?? []
}

async function suppressionsFor(email) {
  const { data } = await db
    .from('suppression_events')
    .select('*')
    .eq('subject_email', email)
    .order('occurred_at', { ascending: true })
  return data ?? []
}

/* ------------------------------------------------------------------- the drive */

async function run() {
  await buildFixture()

  for (const vp of VIEWPORTS) {
    const shot = p => join(out, `${vp.label}-${p}`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const page = await context.newPage()

    try {
      /* ---- acceptance 1: the box ticked ---------------------------------- */
      const yesEmail = `${LANE}-yes-${vp.label}@eventlinqs.test`
      buyerEmails.push(yesEmail)
      const yes = await buyFreeTicket(page, {
        email: yesEmail,
        name: 'Lane Bravo',
        tickConsent: true,
        shotPrefix: shot('01-consented'),
      })

      check(`${vp.label}.checkout.reached`, yes.reachedCheckout === true, `landed on ${yes.landedOn ?? 'nowhere'}`)
      check(
        `${vp.label}.question.is-unticked-by-default`,
        yes.wasCheckedBefore === false,
        `the marketing box was ${yes.wasCheckedBefore === false ? 'unticked' : String(yes.wasCheckedBefore)} before the buyer touched it`,
      )
      check(
        `${vp.label}.question.is-the-wording-record-word-for-word`,
        (yes.panelText ?? '').includes(wordingRecord.label) && (yes.panelText ?? '').includes(wordingRecord.body.slice(0, 90)),
        `on screen: ${JSON.stringify((yes.panelText ?? '').slice(0, 140))}`,
      )
      check(
        `${vp.label}.order.confirmed`,
        yes.order?.status === 'confirmed',
        `order ${yes.order?.id ?? 'none'} is ${yes.order?.status ?? 'absent'}`,
      )

      await new Promise(r => setTimeout(r, 1500))

      const events = await consentEventsFor(yesEmail)
      check(`${vp.label}.ledger.exactly-one-event`, events.length === 1, `${events.length} consent event(s) for one answered question`)
      const granted = events[0]
      if (granted) {
        const columnsPresent =
          Boolean(granted.tenant_id) &&
          granted.subject_email === yesEmail &&
          'subject_mobile_hash' in granted &&
          granted.purpose === 'facilitated_event_marketing' &&
          granted.channel_scope === wordingRecord.channel_scope &&
          granted.decision === 'granted' &&
          granted.wording === wordingRecord.body &&
          granted.wording_version === wordingRecord.version &&
          granted.capture_surface === 'checkout' &&
          granted.third_party_scope === wordingRecord.third_party_scope &&
          granted.suppression_scope === wordingRecord.suppression_scope &&
          Boolean(granted.occurred_at)
        check(
          `${vp.label}.ledger.every-column-the-item-names`,
          columnsPresent,
          `tenant ${Boolean(granted.tenant_id)}, purpose ${granted.purpose}, channel ${granted.channel_scope}, decision ${granted.decision}, wording verbatim ${granted.wording === wordingRecord.body}, version ${granted.wording_version}, surface ${granted.capture_surface}, third party scope ${JSON.stringify(granted.third_party_scope)}, suppression scope ${JSON.stringify(granted.suppression_scope)}`,
        )
        check(
          `${vp.label}.ledger.city-scoped-so-a-send-list-can-find-them`,
          Boolean(granted.city_slug),
          `city ${granted.city_slug ?? 'null, which would put them on no send list at all'}`,
        )
      }

      const permitted = await resolverSays(yesEmail, 'email', 'facilitated_event_marketing')
      check(`${vp.label}.resolver.permits-the-consented-buyer`, permitted.permitted === true, permitted.reason)

      const { data: member } = await db.from('audience_members').select('*').eq('email', yesEmail).maybeSingle()
      check(`${vp.label}.audience.one-record`, Boolean(member), member ? `row ${member.id}` : 'no audience row was created')
      if (member) {
        check(
          `${vp.label}.audience.carries-the-evidence-it-was-built-on`,
          member.consent_state === true &&
            member.consent_text === wordingRecord.body &&
            member.consent_version === wordingRecord.version,
          `state ${member.consent_state}, version ${member.consent_version}, wording verbatim: ${member.consent_text === wordingRecord.body}`,
        )
        check(
          `${vp.label}.audience.community-read-from-the-taxonomy`,
          member.community_slugs.includes(expectedCommunity),
          `the event's only tag is ${communityToken} and the row carries ${JSON.stringify(member.community_slugs)}`,
        )
        check(
          `${vp.label}.audience.where-they-are-and-what-they-paid`,
          member.last_city_slug === fixture.citySlug && member.postcode === fixture.postcode && member.price_band === 'free',
          `city ${member.last_city_slug}, postcode ${member.postcode}, band ${member.price_band}`,
        )
      }

      /* ---- acceptance 2: the question left alone ------------------------- */
      const noEmail = `${LANE}-no-${vp.label}@eventlinqs.test`
      buyerEmails.push(noEmail)
      const no = await buyFreeTicket(page, {
        email: noEmail,
        name: 'Lane Bravo Two',
        tickConsent: false,
        shotPrefix: shot('02-declined'),
      })

      check(
        `${vp.label}.ignored.order-completes-exactly-as-before`,
        no.order?.status === 'confirmed',
        `the buyer who ignored the question got order ${no.order?.id ?? 'none'}, status ${no.order?.status ?? 'absent'}`,
      )
      await new Promise(r => setTimeout(r, 1500))
      const declinedEvents = await consentEventsFor(noEmail)
      check(
        `${vp.label}.ignored.the-decline-is-on-record`,
        declinedEvents.length === 1 && declinedEvents[0].decision === 'declined' && declinedEvents[0].wording === wordingRecord.body,
        declinedEvents.length === 0
          ? 'nothing was recorded, so "asked and said no" is indistinguishable from "never asked"'
          : `${declinedEvents.length} event(s), latest ${declinedEvents[declinedEvents.length - 1].decision}`,
      )
      const { data: notMember } = await db.from('audience_members').select('id').eq('email', noEmail).maybeSingle()
      check(`${vp.label}.ignored.no-audience-record`, !notMember, notMember ? `an audience row exists: ${notMember.id}` : 'no audience row, which is the lawful default')
      const refusedForDecline = await resolverSays(noEmail, 'email', 'facilitated_event_marketing')
      check(`${vp.label}.ignored.resolver-refuses-and-says-why`, refusedForDecline.permitted === false, refusedForDecline.reason)

      /* ---- acceptance 7: unsubscribe with no session --------------------- */
      const { data: consentRow } = await db
        .from('marketing_consents')
        .select('unsubscribe_token, status')
        .eq('email', yesEmail)
        .maybeSingle()

      if (consentRow?.unsubscribe_token) {
        const stranger = await browser.newContext({
          viewport: vp.viewport,
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
          deviceScaleFactor: vp.deviceScaleFactor,
        })
        const strangerPage = await stranger.newPage()
        const link = `${BASE}/unsubscribe/digest/${consentRow.unsubscribe_token}`
        await strangerPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await strangerPage.waitForTimeout(2000)
        await answerTheCookieBanner(strangerPage)
        await strangerPage.screenshot({ path: shot('03-unsubscribe-page.png'), fullPage: false })

        const askedToSignIn = /sign in|log in|password/i.test(await strangerPage.content())
        check(`${vp.label}.unsubscribe.no-login-is-asked-for`, !askedToSignIn, askedToSignIn ? 'the page asks the visitor to sign in' : 'the page asks for nothing but one press')

        await clickByText(strangerPage, /unsubscribe|stop|confirm/i)
        await strangerPage.waitForTimeout(3000)
        await strangerPage.screenshot({ path: shot('04-unsubscribed.png'), fullPage: false })

        const suppressions = await suppressionsFor(yesEmail)
        check(
          `${vp.label}.unsubscribe.one-suppression-covering-every-channel`,
          suppressions.length === 1 && suppressions[0].channel === 'both' && suppressions[0].scope === 'all_marketing',
          suppressions.length === 0
            ? 'no suppression was written'
            : `${suppressions.length} suppression(s), channel ${suppressions[0].channel}, scope ${suppressions[0].scope}`,
        )
        const afterEmail = await resolverSays(yesEmail, 'email', 'facilitated_event_marketing')
        const afterSms = await resolverSays(yesEmail, 'sms', 'facilitated_event_marketing')
        check(
          `${vp.label}.unsubscribe.resolver-refuses-immediately-on-both-channels`,
          afterEmail.permitted === false && afterSms.permitted === false,
          `email: ${afterEmail.reason} / sms: ${afterSms.reason}`,
        )
        const { data: goneMember } = await db.from('audience_members').select('id').eq('email', yesEmail).maybeSingle()
        check(`${vp.label}.unsubscribe.removed-from-the-audience`, !goneMember, goneMember ? 'they are still in the audience' : 'the audience row is gone')

        // Twice: the person sees the same answer and nothing re-opens.
        await strangerPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await strangerPage.waitForTimeout(2000)
        await answerTheCookieBanner(strangerPage)
        await clickByText(strangerPage, /unsubscribe|stop|confirm/i)
        await strangerPage.waitForTimeout(2500)
        await strangerPage.screenshot({ path: shot('05-unsubscribe-again.png'), fullPage: false })
        const suppressionsTwice = await suppressionsFor(yesEmail)
        const stillRefused = await resolverSays(yesEmail, 'email', 'facilitated_event_marketing')
        const { data: stillGone } = await db.from('audience_members').select('id').eq('email', yesEmail).maybeSingle()
        check(
          `${vp.label}.unsubscribe.is-idempotent`,
          suppressionsTwice.length === 1 && stillRefused.permitted === false && !stillGone,
          `${suppressionsTwice.length} suppression(s) after a second press, still refused: ${stillRefused.permitted === false}, still out of the audience: ${!stillGone}`,
        )

        /* ---- acceptance 8: both rights, with no login ------------------- */
        const rightsLink = `${BASE}/marketing/preferences/${consentRow.unsubscribe_token}`
        await strangerPage.goto(rightsLink, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await strangerPage.waitForTimeout(2000)
        await answerTheCookieBanner(strangerPage)
        await strangerPage.screenshot({ path: shot('06-rights-page.png'), fullPage: true })
        const rightsText = await strangerPage.locator('body').innerText()
        check(
          `${vp.label}.rights.source-disclosure-answers-where-the-details-came-from`,
          /got these details from you directly/i.test(rightsText) && /at the checkout/i.test(rightsText),
          `the page says: ${JSON.stringify(rightsText.slice(0, 160))}`,
        )
        check(
          `${vp.label}.rights.the-history-reads-as-sentences`,
          /agreed to EventLinqs marketing/i.test(rightsText) && /withdrew that agreement/i.test(rightsText),
          'the grant and the withdrawal are both on the page in words',
        )
        const rightsAsksToSignIn = /sign in|log in|password/i.test(await strangerPage.content())
        check(`${vp.label}.rights.no-login-is-asked-for`, !rightsAsksToSignIn, rightsAsksToSignIn ? 'the rights page asks the visitor to sign in' : 'no login is asked for')

        await clickByText(strangerPage, /stop using my details/i)
        await strangerPage.waitForTimeout(3000)
        await strangerPage.screenshot({ path: shot('07-facilitation-stopped.png'), fullPage: true })
        const afterStop = await suppressionsFor(yesEmail)
        check(
          `${vp.label}.rights.facilitation-opt-out-is-recorded-at-once`,
          afterStop.some(s => s.scope === 'facilitation_by_others' && s.request_source === 'rights-page'),
          `scopes recorded: ${JSON.stringify(afterStop.map(s => s.scope))}`,
        )
        await stranger.close()

        /* ---- the same right, from the privacy policy entry point -------- */
        const noToken = await browser.newContext({
          viewport: vp.viewport,
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
          deviceScaleFactor: vp.deviceScaleFactor,
        })
        const noTokenPage = await noToken.newPage()
        const typedEmail = `${LANE}-typed-${vp.label}@eventlinqs.test`
        buyerEmails.push(typedEmail)
        await noTokenPage.goto(`${BASE}/marketing/preferences`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await noTokenPage.waitForTimeout(1500)
        await answerTheCookieBanner(noTokenPage)
        await noTokenPage.screenshot({ path: shot('08-rights-entry.png'), fullPage: true })
        await noTokenPage.locator('#marketing-rights-email').fill(typedEmail)
        await clickByText(noTokenPage, /stop using my details/i)
        await noTokenPage.waitForTimeout(3000)
        await noTokenPage.screenshot({ path: shot('09-rights-entry-recorded.png'), fullPage: true })
        const typedText = await noTokenPage.locator('body').innerText()
        const typedSuppressions = await suppressionsFor(typedEmail)
        check(
          `${vp.label}.rights.no-token-form-records-the-stop-and-says-so`,
          typedSuppressions.some(s => s.scope === 'facilitation_by_others') && /Recorded\./i.test(typedText),
          `${typedSuppressions.length} suppression(s) for the typed address, page said: ${JSON.stringify(typedText.slice(typedText.indexOf('Recorded'), typedText.indexOf('Recorded') + 90))}`,
        )
        const noOverflow = await noTokenPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        check(`${vp.label}.rights.no-horizontal-overflow`, noOverflow, noOverflow ? 'no sideways scroll' : 'the rights page overflows sideways')
        await noToken.close()
      } else {
        check(`${vp.label}.unsubscribe.token-exists`, false, 'no unsubscribe token was minted for the consented buyer')
      }

      /* ---- step 10: the admin view -------------------------------------- */
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(1500)
      await answerTheCookieBanner(page)
      await page.locator('input[name="email"]').fill(`${LANE}-admin@eventlinqs.test`)
      await page.locator('input[name="password"]').fill(adminPassword)
      await Promise.all([
        page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
        page.locator('button[type="submit"]').first().click(),
      ])
      await page.waitForTimeout(3000)

      const readAudienceCount = async (query = '') => {
        await page.goto(`${BASE}/admin/audience${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.waitForTimeout(2500)
        await answerTheCookieBanner(page)
        return page.evaluate(() => {
          const tiles = [...document.querySelectorAll('div')]
          for (const t of tiles) {
            const label = t.querySelector('p')
            if (label && label.textContent?.trim() === 'In the audience') {
              const value = t.textContent?.replace('In the audience', '') ?? ''
              const m = value.match(/\d+/)
              return m ? Number(m[0]) : null
            }
          }
          return null
        })
      }

      const shown = await readAudienceCount()
      await page.screenshot({ path: shot('10-admin-audience.png'), fullPage: true })
      const { count: actual } = await db.from('audience_members').select('id', { count: 'exact', head: true })
      check(
        `${vp.label}.admin.count-equals-a-direct-query`,
        shown !== null && shown === actual,
        `the screen says ${shown}, a direct count says ${actual}`,
      )

      await readAudienceCount(`?subject=${encodeURIComponent(yesEmail)}`)
      await page.screenshot({ path: shot('11-admin-subject-lookup.png'), fullPage: true })
      // Lower-cased on both sides: the address is rendered through a CSS
      // uppercase transform, and innerText returns what is on the screen, not
      // what is in the DOM. The first run of this drive failed here and the
      // screenshot showed the address plainly, which is the tell.
      const lookupText = (await page.locator('body').innerText()).toLowerCase()
      check(
        `${vp.label}.admin.subject-lookup-answers-in-sentences`,
        lookupText.includes(yesEmail.toLowerCase()) &&
          /agreed to eventlinqs marketing/.test(lookupText) &&
          /withdrew that agreement/.test(lookupText),
        `the screen carries the address and its history: ${JSON.stringify(lookupText.slice(lookupText.indexOf(yesEmail.toLowerCase()), lookupText.indexOf(yesEmail.toLowerCase()) + 140))}`,
      )
      const { data: audited } = await db
        .from('audit_log')
        .select('action, metadata')
        .eq('action', 'admin.audience.subject_lookup')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      check(
        `${vp.label}.admin.every-lookup-is-written-to-the-audit-log`,
        Boolean(audited) && JSON.stringify(audited?.metadata ?? {}).includes(yesEmail),
        audited ? `logged ${JSON.stringify(audited.metadata)}` : 'no audit entry was written for the lookup',
      )

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      check(`${vp.label}.admin.no-horizontal-overflow`, !overflow, overflow ? 'the audience surface overflows sideways' : 'no sideways scroll')
    } finally {
      await context.close()
      await browser.close()
    }
  }
}

/* ------------------------------------------------------------------- report */

let exitCode = 0
try {
  await run()
} catch (error) {
  check('drive.completed', false, String(error?.message ?? error))
} finally {
  let ledgerRowsLeft = 0
  try {
    await teardown()
    const { count: leftAudience } = await db
      .from('audience_members')
      .select('id', { count: 'exact', head: true })
      .in('email', buyerEmails.length > 0 ? buyerEmails : ['none@none'])
    const { data: leftEvent } = await db.from('events').select('id').eq('slug', `${LANE}-event`).maybeSingle()
    const { data: leftOrg } = await db.from('organisations').select('id').eq('slug', `${LANE}-org`).maybeSingle()
    const { count: ledgerLeft } = await db
      .from('consent_events')
      .select('id', { count: 'exact', head: true })
      .in('subject_email', buyerEmails.length > 0 ? buyerEmails : ['none@none'])
    ledgerRowsLeft = ledgerLeft ?? 0
    check(
      'teardown.left-as-found',
      leftAudience === 0 && !leftEvent && !leftOrg,
      `audience rows left ${leftAudience}, event left ${Boolean(leftEvent)}, organisation left ${Boolean(leftOrg)}`,
    )
    check(
      'teardown.the-ledger-cannot-be-tidied-away-and-is-not-pretended-away',
      ledgerRowsLeft > 0,
      `${ledgerRowsLeft} lane-b consent event(s) remain, because the database refuses to delete a consent record. That is the item, not a leak.`,
    )
  } catch (error) {
    check('teardown.left-as-found', false, String(error?.message ?? error))
  }

  const passed = checks.filter(c => c.ok).length
  const report = {
    item: 'GA1 v3',
    base: BASE,
    at: new Date().toISOString(),
    lane: LANE,
    fixture: { ...fixture, expectedCommunity, communityToken },
    wording: wordingRecord ? { purpose: wordingRecord.purpose, version: wordingRecord.version } : null,
    ledgerRowsLeftOnTest: ledgerRowsLeft,
    passed,
    total: checks.length,
    checks,
    failures,
  }
  writeFileSync(join(out, 'ga1v3-drive-report.json'), JSON.stringify(report, null, 2))
  console.log(`\n${passed} of ${checks.length} checks passed`)
  if (failures.length > 0) {
    console.log('FAILURES:')
    for (const f of failures) console.log(`  ${f}`)
    exitCode = 1
  }
}
process.exit(exitCode)
