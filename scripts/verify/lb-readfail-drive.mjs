/**
 * LB-READFAIL, DRIVEN ON TEST: A CAMPAIGN TO PEOPLE WITH LONG ADDRESSES.
 *
 * ---------------------------------------------------------------------------
 * WHY LONG ADDRESSES ARE THE WHOLE DRIVE, and not a contrivance.
 *
 * `src/lib/campaigner/run.ts` read each recipient's unsubscribe token with one
 * `.in('email', ...)` of a hundred addresses at a time, and then DISCARDED the
 * error. A hundred is a bound on the number of values; the server's bound is on
 * BYTES. Supabase publishes it and names this exact filter as the usual cause:
 *
 *   "16+KB worth of data is present in the headers/URL of your requests" ...
 *   "This is commonly caused by lengthy `in` clauses."
 *   https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2
 *   (fetched 2026-09-19)
 *
 * Measured against this project's own TEST instance the same day: a joined list
 * of 15,038 bytes answered, 16,083 did not. An email address may legally be 254
 * characters (RFC 5321 section 4.5.3.1.3), so SEVENTY legal addresses is about
 * 17.8 KB in one request, and the request fails.
 *
 * With the error discarded, every one of those seventy people was then recorded
 * in `public.marketing_send_skip` - which is APPEND ONLY - as
 *
 *     "this address has no consent record carrying an unsubscribe token"
 *
 * and that sentence was counted onto /admin/campaigns. Their consent rows exist
 * and say `granted`. So this drive asserts the LEDGER and the SCREEN together:
 * a false sentence that fails closed is still a false sentence, and an
 * organiser reading it goes and asks a person to consent who already has.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, and why each one is not implied by the one before it:
 *
 *   1. the fixture's seventy people all hold a GRANTED consent with a token,
 *      read back from the database rather than trusted from an insert;
 *   2. the old read shape, executed here against the real database with the
 *      real addresses, FAILS - so the defect is reachable and not argued;
 *   3. the campaigner run drafts all seventy;
 *   4. NOT ONE marketing_send_skip row carries the false sentence;
 *   5. every drafted send carries a real unsubscribe token;
 *   6. /admin/campaigns says so, at 390, 768 and 1440, with no horizontal
 *      overflow at any of them.
 *
 * The RED half is scripts/verify/lb-readfail-drive-red.mjs, which puts both
 * halves of the defect back and requires 3, 4 and 6 to fail.
 *
 * NOBODY REAL CAN BE REACHED. The campaigner is left in test mode, whose only
 * transport refuses every address outside the test domain, and this drive never
 * approves the segment, so nothing is dispatched at all.
 *
 * Run (dev server on 3100 against TEST):
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/verify/lb-readfail-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-READFAIL/drive
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { laneFixturesStillPublished, sitemapFootprint } from './lib/sitemap-footprint.mjs'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const args = process.argv.slice(2)
let out = null
let red = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  if (args[i] === '--expect-red') red = true
}
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const LANE = 'lane-b-readfail'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')

/**
 * SEVENTY, AND THE NUMBER IS DERIVED RATHER THAN CHOSEN.
 *
 * The old code put up to a hundred addresses in one request. At the RFC 5321
 * maximum of 254 characters, the request exceeds 16 KB somewhere past
 * sixty-three, so seventy is the smallest round number that is certainly over
 * it while still being one chunk under the old bound. Sixty-three would prove
 * nothing on a day the limit moved by a byte.
 */
const POPULATION = 70
const ADDRESS_LENGTH = 254

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const VIEWPORTS = [
  {
    label: 'mobile-390',
    width: 390,
    height: 844,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'tablet-768',
    width: 768,
    height: 1024,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
  },
  {
    label: 'desktop-1440',
    width: 1440,
    height: 900,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  },
]

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

/**
 * THE TWO SENTENCES, AND THEY ARE NOT THE SAME SENTENCE.
 *
 * `marketing_send_skip` stores a REASON CODE and a DETAIL. The detail is the
 * one the campaigner writes about a person; the screen renders the SENTENCE the
 * code maps to, and never the detail. The first version of this drive asserted
 * the detail at all three viewports, so all three checks passed during the red
 * run while the page in front of them was counting seventy refusals. A check
 * that looks at a string the page does not contain cannot fail, which is the
 * whole reason the red half exists.
 *
 * The rendered sentence is IMPORTED from the product rather than copied, so it
 * cannot drift from what is on the screen.
 */
const FALSE_DETAIL = 'this address has no consent record carrying an unsubscribe token'
const { RENDER_FAILURE, RENDER_FAILURE_SENTENCE } = await import('../../src/lib/campaigner/render.ts')
const RENDERED_SENTENCE = RENDER_FAILURE_SENTENCE[RENDER_FAILURE.UNSUBSCRIBE_MISSING]

const adminPassword = `${randomUUID()}Aa1`
const fixture = {
  ownerId: null,
  adminId: null,
  organisationId: null,
  eventId: null,
  eventSlug: `${LANE}-event-${STAMP}`,
  campaignId: null,
  senderIdentityId: null,
  sequenceId: null,
  matchRunId: null,
  emails: [],
}

const answerTheCookieBanner = (page) => answerTheBanner(page, { answer: 'decline' })

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

/**
 * An address of exactly ADDRESS_LENGTH characters inside the test domain, so the
 * campaigner's test-mode sink would accept it and nothing real is reachable.
 */
function longAddress(i) {
  const tail = `-${STAMP}-${String(i).padStart(3, '0')}@eventlinqs.test`
  const pad = ADDRESS_LENGTH - tail.length - LANE.length
  return `${LANE}${'a'.repeat(Math.max(1, pad))}${tail}`
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
  const { data: wording } = await db
    .from('consent_wordings')
    .select('body, version, channel_scope, third_party_scope, suppression_scope')
    .eq('purpose', 'facilitated_event_marketing')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  const { data: sequence } = await db
    .from('marketing_sequence')
    .select('id')
    .eq('reference', 'eventlinqs-default-v1')
    .single()
  fixture.sequenceId = sequence.id

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser-${STAMP}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db.from('profiles').upsert({ id: fixture.ownerId, email: `${LANE}-organiser-${STAMP}@eventlinqs.test`, full_name: 'Lane B readfail' })

  /*
   * PENDING, AND THE EVENT IS UNLISTED. Three lanes share one TEST database and
   * the sitemap holds a snapshot for 300 seconds, so a fixture visible for the
   * minutes it lives leaves another lane's indexing gate reading URLs that 404
   * the moment this drive tears down. See scripts/verify/lib/sitemap-footprint.mjs.
   */
  const org = await db
    .from('organisations')
    .insert({ name: `Lane B readfail ${STAMP}`, slug: `${LANE}-org-${STAMP}`, owner_id: fixture.ownerId, status: 'pending' })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  // Twenty days out, so step 1 of the seeded sequence (8 to 45 days) is open.
  const start = new Date(Date.now() + 20 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B readfail night ${STAMP}`,
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
      venue_name: 'Lane B readfail warehouse',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the LB-READFAIL proof. It is deleted when the proof ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id

  await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.eventId, name: 'General', price: 3500, currency: 'AUD', total_capacity: 400, is_active: true })

  const now = Date.now()
  const consentRows = []
  const audienceRows = []
  for (let i = 0; i < POPULATION; i += 1) {
    const email = longAddress(i)
    if (email.length !== ADDRESS_LENGTH) {
      throw new Error(`the fixture built a ${email.length} character address, not ${ADDRESS_LENGTH}`)
    }
    fixture.emails.push(email)
    consentRows.push({
      tenant_id: tenant.id,
      subject_email: email,
      purpose: 'facilitated_event_marketing',
      channel_scope: 'email',
      decision: 'granted',
      wording: wording.body,
      wording_version: wording.version,
      capture_surface: 'lb-readfail-proof',
      third_party_scope: wording.third_party_scope,
      suppression_scope: wording.suppression_scope,
      occurred_at: new Date(now - (i % 20) * 3_600_000).toISOString(),
    })
    audienceRows.push({
      email,
      consent_state: true,
      consent_channel: 'email',
      consent_at: new Date(now - (i % 20) * 3_600_000).toISOString(),
      consent_text: wording.body,
      consent_version: wording.version,
      consent_source: 'lb-readfail-proof',
      first_order_at: new Date(now - (100 + i) * 86_400_000).toISOString(),
      last_order_at: new Date(now - (i % 30) * 86_400_000).toISOString(),
      order_count: 1 + (i % 3),
      lifetime_spend_cents: 3000 + i * 100,
      last_category_slug: category.slug,
      last_city_slug: city.slug,
      price_band: '30-to-59',
      category_slugs: [category.slug],
      city_slugs: [city.slug],
    })
  }
  for (let i = 0; i < consentRows.length; i += 50) {
    const { error } = await db.from('consent_events').insert(consentRows.slice(i, i + 50))
    if (error) throw new Error(`seed consent: ${error.message}`)
  }
  /*
   * THE CONSENT RECORD AND ITS TOKEN GO FIRST, AND THE ORDER IS LOAD BEARING.
   * `marketing_consents` carries a trigger onto `refresh_audience_member`, which
   * rebuilds a person's audience row from their ORDERS, so writing it after the
   * audience rows destroys them. That cost the GA4 drive three runs and the note
   * is repeated here rather than left to be rediscovered.
   */
  const consentRecords = fixture.emails.map(email => ({
    email,
    status: 'granted',
    consent_text: wording.body,
    consent_version: wording.version,
    source: 'lb-readfail-proof',
    granted_at: new Date().toISOString(),
  }))
  for (let i = 0; i < consentRecords.length; i += 50) {
    const { error } = await db.from('marketing_consents').upsert(consentRecords.slice(i, i + 50), { onConflict: 'email' })
    if (error) throw new Error(`seed marketing_consents: ${error.message}`)
  }

  for (let i = 0; i < audienceRows.length; i += 50) {
    const { error } = await db.from('audience_members').upsert(audienceRows.slice(i, i + 50), { onConflict: 'email' })
    if (error) throw new Error(`seed audience: ${error.message}`)
  }

  const identity = await db
    .from('marketing_sender_identity')
    .insert({
      organisation_id: fixture.organisationId,
      from_name: `Lane B readfail ${STAMP}`,
      reply_to: `${LANE}-replies-${STAMP}@eventlinqs.test`,
      identity_line: 'Lane B readfail, 1 Test Street, Geelong VIC 3220.',
      is_verified: true,
    })
    .select('id')
    .single()
  if (identity.error) throw new Error(`sender identity: ${identity.error.message}`)
  fixture.senderIdentityId = identity.data.id

  const campaign = await db
    .from('marketing_campaign')
    .insert({
      tenant_id: tenant.id,
      event_id: fixture.eventId,
      organisation_id: fixture.organisationId,
      name: `Lane B readfail campaign ${STAMP}`,
      state: 'active',
      reference: `${LANE}-campaign-${STAMP}`,
      sequence_id: fixture.sequenceId,
      opening_line: 'One more warehouse night before summer, and you were at the last one.',
      signature: 'Jo, Lane B readfail',
    })
    .select('id')
    .single()
  if (campaign.error) throw new Error(`campaign: ${campaign.error.message}`)
  fixture.campaignId = campaign.data.id

  const admin = await db.auth.admin.createUser({
    email: `${LANE}-admin-${STAMP}@eventlinqs.test`,
    password: adminPassword,
    email_confirm: true,
  })
  if (admin.error) throw new Error(`create admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: `${LANE}-admin-${STAMP}@eventlinqs.test`, full_name: 'Lane B readfail owner' })
  const staff = await db.from('admin_users').insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B readfail owner' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)
}

async function teardown() {
  if (fixture.campaignId) {
    for (const table of [
      'marketing_send',
      'marketing_send_skip',
      'marketing_send_approval',
      'marketing_recipient_allowlist',
      'marketing_click',
      'marketing_link',
      'marketing_recipient',
    ]) {
      await db.from(table).delete().eq('campaign_id', fixture.campaignId)
    }
    await db.from('marketing_campaign').delete().eq('id', fixture.campaignId)
  }
  if (fixture.senderIdentityId) await db.from('marketing_sender_identity').delete().eq('id', fixture.senderIdentityId)
  if (fixture.matchRunId) {
    await db.from('marketing_match_score').delete().eq('run_id', fixture.matchRunId)
    await db.from('marketing_match_run').delete().eq('id', fixture.matchRunId)
  }
  // Fifty at a time, because these are the long addresses this drive exists for
  // and a hundred of them is the very URL the product was failing on.
  for (let i = 0; i < fixture.emails.length; i += 12) {
    const slice = fixture.emails.slice(i, i + 12)
    await db.from('audience_members').delete().in('email', slice)
    await db.from('marketing_consents').delete().in('email', slice)
    await db.from('consent_events').delete().in('subject_email', slice)
    await db.from('suppression_events').delete().in('subject_email', slice)
  }
  if (fixture.eventId) {
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('ledger_slots').delete().eq('source_ref', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.adminId) {
    await db.from('admin_users').delete().eq('id', fixture.adminId)
    await tearDownAccountOrFailTheRun(db, fixture.adminId)
  }
  if (fixture.ownerId) await tearDownAccountOrFailTheRun(db, fixture.ownerId)
}

/* ------------------------------------------------------------------- the drive */

let browser = null
try {
  await buildFixture()

  {
    const { data: seeded, error } = await db
      .from('marketing_consents')
      .select('email, status, unsubscribe_token')
      .in('email', fixture.emails.slice(0, 12))
    if (error) throw new Error(`could not read back the seeded consent: ${error.message}`)
    check(
      'readfail.fixture.every-person-holds-a-granted-consent-with-a-token',
      (seeded ?? []).length === 12 && (seeded ?? []).every(r => r.status === 'granted' && r.unsubscribe_token),
      `${(seeded ?? []).length} of a 12-row sample are granted and carry an unsubscribe token; the run reads all ${POPULATION}`,
    )
  }

  {
    const footprint = await sitemapFootprint(db, { eventSlugs: [fixture.eventSlug], organisationId: fixture.organisationId })
    check(
      'readfail.fixture.publishes-nothing-into-the-sitemap',
      footprint.length === 0,
      footprint.length === 0
        ? 'the organisation, the event and the venue are all absent from the sitemap queries'
        : `the sitemap would publish ${footprint.join(', ')}`,
    )
  }

  /*
   * THE DEFECT, REACHED RATHER THAN ARGUED.
   *
   * This is the read `run.ts` used to make, spelled exactly as it was, against
   * the real database with the real addresses. If it succeeds, the rest of this
   * drive proves nothing and says so, because the whole item rests on the claim
   * that a legal audience makes this request fail.
   */
  {
    const joined = fixture.emails.join(',')
    const { data, error } = await db
      .from('marketing_consents')
      .select('email, unsubscribe_token')
      .in('email', fixture.emails.slice(0, 100))
      .limit(100)
    check(
      'readfail.cause.the-old-hundred-at-a-time-read-fails-on-a-legal-audience',
      Boolean(error) && data === null,
      `${POPULATION} addresses of ${ADDRESS_LENGTH} characters join to ${joined.length} bytes; the server answered: ${
        error ? error.message : `${(data ?? []).length} rows and no error, so the premise of this item does not hold here`
      }`,
    )
  }

  const { produceMatchRun } = await import('../../src/lib/matching/run.ts')
  const { admitMatchRunToAllowlist } = await import('../../src/lib/campaigner/allowlist.ts')
  const { runCampaign } = await import('../../src/lib/campaigner/run.ts')

  const run = await produceMatchRun(db, { eventId: fixture.eventId, cap: POPULATION })
  if (!run.ok) throw new Error(`the matcher refused: ${run.detail}`)
  fixture.matchRunId = run.runId
  check(
    'readfail.match.run-produced',
    (run.returned ?? 0) >= POPULATION - 2,
    `run ${run.runId} considered ${run.audienceConsidered} and matched ${run.returned}`,
  )

  const admission = await admitMatchRunToAllowlist({
    campaignId: fixture.campaignId,
    matchRunId: fixture.matchRunId,
    channelCode: 'email',
  })
  check(
    'readfail.allowlist.admitted-from-the-match-run',
    admission.admitted >= POPULATION - 2,
    `${admission.admitted} admitted of ${admission.considered} considered, ${admission.refused.length} refused` +
      (admission.refused.length > 0 ? `; first refusal: ${admission.refused[0].reason}` : ''),
  )

  /* ---- the run itself, with nobody approved, so nothing is dispatched ---- */
  const result = await runCampaign({ campaignId: fixture.campaignId, channelCode: 'email' })
  check(
    'readfail.run.every-person-with-a-long-address-is-drafted',
    result.drafted >= POPULATION - 2 && result.dispatched === 0,
    `${result.considered} on the list, ${result.drafted} drafted, ${result.dispatched} dispatched` +
      (result.skipped.length > 0 ? `; skipped: ${JSON.stringify(result.skipped)}` : '; nothing skipped'),
  )

  {
    const { data: skips } = await db
      .from('marketing_send_skip')
      .select('reason, detail')
      .eq('campaign_id', fixture.campaignId)
    const falseOnes = (skips ?? []).filter(s => `${s.reason} ${s.detail ?? ''}`.includes(FALSE_DETAIL))
    check(
      'readfail.ledger.nobody-is-recorded-as-having-no-consent-record',
      falseOnes.length === 0,
      falseOnes.length === 0
        ? `${(skips ?? []).length} skip row(s) in total, and not one of them says "${FALSE_DETAIL}"`
        : `${falseOnes.length} people are permanently recorded as having no consent record, and all ${POPULATION} of them do`,
    )
  }

  {
    const { data: sends } = await db
      .from('marketing_send')
      .select('destination, unsubscribe_token, state')
      .eq('campaign_id', fixture.campaignId)
    const withToken = (sends ?? []).filter(s => Boolean(s.unsubscribe_token))
    check(
      'readfail.sends.every-draft-carries-a-real-unsubscribe-token',
      (sends ?? []).length > 0 && withToken.length === (sends ?? []).length,
      `${withToken.length} of ${(sends ?? []).length} drafted messages carry a token, which is the Spam Act facility itself`,
    )
    // NON-EMPTY, DELIBERATELY. `every()` on an empty array is true, so without
    // the length check this passed during the red run, over zero sends, and
    // read as though the long addresses had been exercised.
    check(
      'readfail.sends.the-addresses-really-are-the-long-ones',
      (sends ?? []).length > 0 && (sends ?? []).every(s => s.destination.length === ADDRESS_LENGTH),
      `${(sends ?? []).length} destination(s), every one ${ADDRESS_LENGTH} characters, so this run did exercise the shape that used to fail`,
    )
  }

  /* ---- the screen a person reads, at all three viewports ---- */
  browser = await chromium.launch({ headless: true })
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.userAgent,
    })
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

    await page.goto(`${BASE}/admin/campaigns?campaign=${fixture.campaignId}&channel=email`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)
    const body = await page.locator('body').innerText()

    /*
     * THE SENTENCE THE PAGE ACTUALLY RENDERS, not the detail stored beside it.
     * With the defect in place this line reads
     * "No unsubscribe link was supplied ... 70".
     */
    check(
      `readfail.screen.${vp.label}.does-not-say-seventy-people-have-no-unsubscribe-link`,
      !body.includes(RENDERED_SENTENCE),
      body.includes(RENDERED_SENTENCE)
        ? `the screen counts "${RENDERED_SENTENCE}" against people whose consent is granted and whose token exists`
        : 'the skip breakdown carries no false statement about anybody',
    )
    /*
     * AND IT SHOWS THE DRAFTS, so the check above cannot pass by the page
     * having rendered nothing at all. This is the positive half: seventy
     * messages, written, on the screen.
     */
    check(
      `readfail.screen.${vp.label}.counts-the-drafted-messages`,
      /Messages\s+draft/i.test(body) && body.includes(String(result.drafted)),
      `the page shows "Messages draft" and the figure ${result.drafted}`,
    )
    check(
      `readfail.screen.${vp.label}.shows-the-campaign-it-was-asked-for`,
      body.includes(`${LANE}-campaign-${STAMP}`) || /readfail campaign/i.test(body),
      'the campaign is on screen, so the assertions above are about a rendered page and not an empty one',
    )
    check(
      `readfail.screen.${vp.label}.no-horizontal-overflow`,
      !(await horizontalOverflow(page)),
      `nothing overflows at ${vp.width} wide, with 254-character addresses on the page`,
    )
    /*
     * THE CAPTURE SHOWS THE THING IT IS EVIDENCE OF.
     *
     * "What has happened" is the section carrying the counts and the skip
     * breakdown, and at 390 it sits well below the fold. A viewport crop of the
     * top of the page is a true picture of a page that proves nothing, so the
     * section is scrolled to first and the check below fails if it is not
     * there to scroll to.
     */
    const happened = page.getByRole('heading', { name: 'What has happened' })
    const onScreen = await happened.isVisible().catch(() => false) || (await happened.count()) > 0
    check(
      `readfail.screen.${vp.label}.the-capture-shows-the-counts`,
      onScreen,
      'the "What has happened" section is on the page, so the screenshot is evidence rather than decoration',
    )
    if (onScreen) {
      await happened.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(600)
    }
    await page.screenshot({ path: join(out, `${vp.label}-campaign.png`), fullPage: false })
    await context.close()
  }
} catch (error) {
  check('readfail.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await teardown()
    const { count } = await db
      .from('marketing_campaign')
      .select('id', { count: 'exact', head: true })
      .eq('reference', `${LANE}-campaign-${STAMP}`)
    const { count: people } = await db
      .from('audience_members')
      .select('id', { count: 'exact', head: true })
      .like('email', `${LANE}%`)
    check(
      'readfail.teardown.left-as-found',
      (count ?? 0) === 0 && (people ?? 0) === 0,
      `${count ?? 0} campaign row(s) and ${people ?? 0} audience row(s) of this drive remain`,
    )
    const leftPublished = await laneFixturesStillPublished(db, `${LANE}-`)
    check(
      'readfail.teardown.nothing-of-this-drive-is-left-published',
      leftPublished.length === 0,
      leftPublished.length === 0
        ? 'no organiser, event or venue page of this drive is in the sitemap'
        : `still published: ${leftPublished.join(', ')}`,
    )
  } catch (error) {
    check('readfail.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'lb-readfail-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, population: POPULATION, addressLength: ADDRESS_LENGTH, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`LB-READFAIL DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)

/*
 * --expect-red INVERTS THE EXIT CODE, for scripts/verify/lb-readfail-drive-red.mjs.
 * The named checks below are the ones the defect breaks; anything else failing
 * is a broken drive rather than a demonstrated defect, and is reported as such.
 */
if (red) {
  /*
   * EVERY CHECK THE DEFECT BREAKS IS NAMED, INCLUDING ALL THREE SCREENS.
   *
   * The first version of this list held two names and excused every
   * `readfail.screen.*` from having to fail. It excused them because they were
   * passing during the red run, and they were passing because they asserted a
   * string the page never renders. Excusing a check that cannot fail is how a
   * drive keeps its own blind spot.
   */
  const MUST_BREAK = [
    'readfail.run.every-person-with-a-long-address-is-drafted',
    'readfail.ledger.nobody-is-recorded-as-having-no-consent-record',
    'readfail.sends.every-draft-carries-a-real-unsubscribe-token',
    'readfail.sends.the-addresses-really-are-the-long-ones',
    ...VIEWPORTS.flatMap(vp => [
      `readfail.screen.${vp.label}.does-not-say-seventy-people-have-no-unsubscribe-link`,
      `readfail.screen.${vp.label}.counts-the-drafted-messages`,
    ]),
  ]
  const broke = MUST_BREAK.filter(n => failed.some(f => f.name === n))
  const collateral = failed.filter(f => !MUST_BREAK.includes(f.name))
  console.log('')
  console.log(`RED RUN: ${broke.length} of ${MUST_BREAK.length} named checks failed as the defect requires`)
  for (const c of collateral) console.log(`  COLLATERAL  ${c.name}  ${c.detail}`)
  process.exit(broke.length === MUST_BREAK.length ? 0 : 1)
}

process.exit(failed.length === 0 ? 0 : 1)
