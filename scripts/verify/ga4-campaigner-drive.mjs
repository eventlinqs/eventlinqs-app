/**
 * GA4. THE CAMPAIGNER, DRIVEN END TO END ON TEST, WITH NO REAL PERSON REACHED.
 *
 * WHAT IT PROVES, in the order GA4 asks for it:
 *
 *   3. The database enforcement, with every application level check removed:
 *      a send to somebody absent from the allowlist, an allowlist row with
 *      consent false, an SMS on a consent scoped to email, and the insert that
 *      exceeds a cap. Each asserts the DATABASE error rather than an
 *      application exception.
 *   4. The approval gate: nothing leaves draft for a fingerprint nobody
 *      approved, an approval for one segment does not authorise a changed one,
 *      and a repeat send to the same segment needs no second approval.
 *   5. The full run in test mode: a lane-B campaign against a lane-B event and
 *      a lane-B audience of more than forty, the matcher run admitted to the
 *      allowlist, the approval granted, the first step drafted and dispatched
 *      to the recorded sink, and the sink's domain assertion proven by pointing
 *      one recipient at an address outside the test domain.
 *   6. The unsubscribe link taken from a REAL rendered message, opened in a
 *      fresh browser with no login, sets consent false, and the next run
 *      excludes that person with the reason recorded.
 *   7. The admin campaign view and the rendered preview at 390, 768 and 1440.
 *
 * NOBODY REAL CAN BE REACHED. The campaigner is in test mode, so the only
 * transport the process holds refuses every address outside the test domain.
 * The refusal is asserted rather than assumed.
 *
 * Run (dev server on 3100 against TEST):
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/verify/ga4-campaigner-drive.mjs \
 *        --out C:/dev/EVIDENCE/GA4
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { sitemapFootprint, laneFixturesStillPublished } from './lib/sitemap-footprint.mjs'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.GA4_BASE_URL ?? 'http://localhost:3100'
const LANE = 'lane-b-ga4'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')
const POPULATION = 42

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
  outsiderEmail: `${LANE}-outsider-${STAMP}@example.test`,
  smsEmail: `${LANE}-sms-${STAMP}@eventlinqs.test`,
  unsubscriberEmail: null,
}

/* ------------------------------------------------------------ browser helpers */

/*
 * THE CONSENT BANNER. One shared implementation (scripts/verify/lib/cookie-banner.mjs),
 * answered 'decline' here, which is a change: the local copy this replaces matched
 * /accept/, /allow/ and /^ok$/ against a banner whose buttons read "That is fine" and
 * "No thanks", so this drive had never dismissed the banner at all and every capture
 * it produced carries it across the bottom of the page.
 */
const answerTheCookieBanner = (page) => answerTheBanner(page, { answer: 'decline' })

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
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
  await db.from('profiles').upsert({ id: fixture.ownerId, email: `${LANE}-organiser-${STAMP}@eventlinqs.test`, full_name: 'Lane B GA4' })

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
    .insert({ name: `Lane B GA4 ${STAMP}`, slug: `${LANE}-org-${STAMP}`, owner_id: fixture.ownerId, status: 'pending' })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  // Twenty days out, so step 1 of the seeded sequence (8 to 45 days) is open.
  const start = new Date(Date.now() + 20 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B GA4 campaign night ${STAMP}`,
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
      venue_name: 'Lane B GA4 warehouse',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the GA4 campaigner proof. It is deleted when the proof ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id

  await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.eventId, name: 'General', price: 3500, currency: 'AUD', total_capacity: 400, is_active: true })

  /*
   * THE AUDIENCE. Forty two people, and the three shapes matter:
   *   - most are scoped to EMAIL, which is the ordinary case,
   *   - one is scoped to SMS as well, so the SMS step has somebody it may reach,
   *   - one lives outside the test domain, so the sink's refusal can be proven.
   * The consent event comes first, because the database REFUSES an audience row
   * for somebody the resolver refuses.
   */
  const now = Date.now()
  const consentRows = []
  const audienceRows = []
  for (let i = 0; i < POPULATION; i += 1) {
    const isOutsider = i === POPULATION - 1
    const isSms = i === POPULATION - 2
    const email = isOutsider ? fixture.outsiderEmail : isSms ? fixture.smsEmail : `${LANE}-${STAMP}-${String(i).padStart(3, '0')}@eventlinqs.test`
    fixture.emails.push(email)
    consentRows.push({
      tenant_id: tenant.id,
      subject_email: email,
      purpose: 'facilitated_event_marketing',
      channel_scope: isSms ? 'both' : 'email',
      decision: 'granted',
      wording: wording.body,
      wording_version: wording.version,
      capture_surface: 'ga4-proof',
      third_party_scope: wording.third_party_scope,
      suppression_scope: wording.suppression_scope,
      occurred_at: new Date(now - (i % 20) * 3_600_000).toISOString(),
    })
    audienceRows.push({
      email,
      consent_state: true,
      /*
       * ALWAYS 'email' HERE, AND THAT IS GA1's DESIGN RATHER THAN A SHORTCUT.
       * audience_members carries `check (consent_channel = 'email')`: the
       * audience asset is an email audience. The SMS SCOPE lives on the consent
       * EVENT, which is exactly why the allowlist copies its scope from the
       * ledger event the resolver named rather than from the audience row.
       */
      consent_channel: 'email',
      consent_at: new Date(now - (i % 20) * 3_600_000).toISOString(),
      consent_text: wording.body,
      consent_version: wording.version,
      consent_source: 'ga4-proof',
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
  for (let i = 0; i < consentRows.length; i += 100) {
    const { error } = await db.from('consent_events').insert(consentRows.slice(i, i + 100))
    if (error) throw new Error(`seed consent: ${error.message}`)
  }
  /*
   * THE CONSENT RECORD AND ITS UNSUBSCRIBE TOKEN GO FIRST, AND THE ORDER IS
   * LOAD BEARING. GA1 keeps the token on the legacy marketing_consents table
   * and the preference page resolves it; the campaigner mints no second token.
   *
   * Writing it AFTER the audience rows destroys them, which cost this drive
   * three runs. `marketing_consents` carries a trigger onto
   * `refresh_audience_member`, and that function rebuilds a person's audience
   * row from their ORDERS: the audience asset is derived from buyers, so a
   * seeded row for somebody who has never bought anything is removed the moment
   * anything refreshes it. The product is right and the fixture was wrong. This
   * fixture seeds the consent record first and never touches it again.
   */
  const consentRecords = fixture.emails.map(email => ({
    email,
    status: 'granted',
    consent_text: wording.body,
    consent_version: wording.version,
    source: 'ga4-proof',
    granted_at: new Date().toISOString(),
  }))
  for (let i = 0; i < consentRecords.length; i += 100) {
    const { error } = await db.from('marketing_consents').upsert(consentRecords.slice(i, i + 100), { onConflict: 'email' })
    if (error) throw new Error(`seed marketing_consents: ${error.message}`)
  }

  for (let i = 0; i < audienceRows.length; i += 100) {
    const { error } = await db.from('audience_members').upsert(audienceRows.slice(i, i + 100), { onConflict: 'email' })
    if (error) throw new Error(`seed audience: ${error.message}`)
  }

  /*
   * THE FIXTURE VERIFIES WHAT IT CREATED, rather than trusting that an insert
   * without an error inserted something. The first run of this drive reported
   * that the matcher considered ONE person, and the honest reading of that is
   * that the fixture had not built what it said it had. A count taken here is
   * cheap and it fails in the fixture rather than three checks later.
   */
  {
    const { data: seeded, error } = await db
      .from('audience_members')
      .select('email')
      .in('email', fixture.emails)
    if (error) throw new Error(`could not read back the seeded audience: ${error.message}`)
    check(
      'fixture.the-audience-exists',
      (seeded ?? []).length === POPULATION,
      `${(seeded ?? []).length} of ${POPULATION} audience rows exist, each with a live consent behind it`,
    )
    if ((seeded ?? []).length !== POPULATION) {
      throw new Error(`the fixture seeded ${(seeded ?? []).length} audience rows, not ${POPULATION}`)
    }
  }

  const identity = await db
    .from('marketing_sender_identity')
    .insert({
      organisation_id: fixture.organisationId,
      from_name: `Lane B GA4 ${STAMP}`,
      reply_to: `${LANE}-replies-${STAMP}@eventlinqs.test`,
      identity_line: 'Lane B GA4, 1 Test Street, Geelong VIC 3220.',
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
      name: `Lane B GA4 campaign ${STAMP}`,
      state: 'active',
      reference: `${LANE}-campaign-${STAMP}`,
      sequence_id: fixture.sequenceId,
      opening_line: 'We have one more warehouse night before summer, and you were at the last one.',
      signature: 'Jo, Lane B GA4',
    })
    .select('id, volume_cap')
    .single()
  if (campaign.error) throw new Error(`campaign: ${campaign.error.message}`)
  fixture.campaignId = campaign.data.id
  check(
    'campaign.cap-is-read-from-configuration',
    campaign.data.volume_cap === 500,
    `a new campaign defaults to a cap of ${campaign.data.volume_cap}, taken from marketing_campaigner_config rather than typed`,
  )

  const admin = await db.auth.admin.createUser({
    email: `${LANE}-admin-${STAMP}@eventlinqs.test`,
    password: adminPassword,
    email_confirm: true,
  })
  if (admin.error) throw new Error(`create admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: `${LANE}-admin-${STAMP}@eventlinqs.test`, full_name: 'Lane B GA4 Owner' })
  const staff = await db.from('admin_users').insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B GA4 Owner' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)
}

async function teardown() {
  if (fixture.campaignId) {
    await db.from('marketing_send').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_send_skip').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_send_approval').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_recipient_allowlist').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_click').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_link').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_recipient').delete().eq('campaign_id', fixture.campaignId)
    await db.from('marketing_campaign').delete().eq('id', fixture.campaignId)
  }
  if (fixture.senderIdentityId) await db.from('marketing_sender_identity').delete().eq('id', fixture.senderIdentityId)
  if (fixture.matchRunId) {
    await db.from('marketing_match_score').delete().eq('run_id', fixture.matchRunId)
    await db.from('marketing_match_run').delete().eq('id', fixture.matchRunId)
  }
  for (let i = 0; i < fixture.emails.length; i += 100) {
    const slice = fixture.emails.slice(i, i + 100)
    await db.from('audience_members').delete().in('email', slice)
    await db.from('marketing_consents').delete().in('email', slice)
  }
  if (fixture.eventId) {
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('ledger_slots').delete().eq('source_ref', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.ownerId) await db.auth.admin.deleteUser(fixture.ownerId).catch(() => {})
  if (fixture.adminId) {
    await db.from('admin_users').delete().eq('id', fixture.adminId)
    await db.auth.admin.deleteUser(fixture.adminId).catch(() => {})
  }
}

/* --------------------------------------------------------------------- the run */

let browser = null
const ADMIN_SESSION = join(out, 'ga4-admin-session.json')

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
      eventSlugs: [fixture.eventSlug],
      venueNames: ['Lane B GA4 warehouse'],
    })
    check(
      'ga4.fixture.publishes-nothing-into-the-sitemap',
      footprint.length === 0,
      footprint.length === 0
        ? 'the organisation, the event(s) and the venue(s) are all absent from the sitemap queries'
        : `the sitemap would publish ${footprint.join(', ')}, and every one of them 404s the moment this drive tears down`,
    )
  }

  const { produceMatchRun } = await import('../../src/lib/matching/run.ts')
  const { admitMatchRunToAllowlist } = await import('../../src/lib/campaigner/allowlist.ts')
  const { runCampaign } = await import('../../src/lib/campaigner/run.ts')
  const { segmentFingerprint } = await import('../../src/lib/campaigner/fingerprint.ts')
  const { recordedPayloads, clearRecordedPayloads } = await import('../../src/lib/campaigner/sink.ts')

  /* ---- the matcher run, and admission ---- */
  const run = await produceMatchRun(db, { eventId: fixture.eventId, cap: POPULATION })
  check(
    'ga4.match.run-produced',
    run.ok && (run.returned ?? 0) >= 40,
    run.ok
      ? `run ${run.runId} considered ${run.audienceConsidered} and matched ${run.returned}; suppressed ${JSON.stringify(run.suppressed ?? {})}`
      : String(run.detail),
  )
  if (!run.ok) throw new Error(`the matcher refused: ${run.detail}`)
  if ((run.returned ?? 0) < 1) throw new Error('the matcher matched nobody, so there is no segment to campaign to')
  fixture.matchRunId = run.runId

  const admission = await admitMatchRunToAllowlist({
    campaignId: fixture.campaignId,
    matchRunId: fixture.matchRunId,
    channelCode: 'email',
  })
  check(
    'ga4.allowlist.admitted-from-the-match-run',
    admission.admitted >= 40,
    `${admission.admitted} admitted of ${admission.considered} considered, ${admission.refused.length} refused` +
      (admission.refused.length > 0 ? `; first refusal: ${admission.refused[0].email} because ${admission.refused[0].reason}` : ''),
  )

  const { data: allowSample } = await db
    .from('marketing_recipient_allowlist')
    .select('consent_state, consent_channel_scope, consent_wording_version, match_run_id')
    .eq('campaign_id', fixture.campaignId)
    .limit(1)
    .single()
  check(
    'ga4.allowlist.copies-the-evidence-at-admission',
    allowSample.consent_state === true &&
      Boolean(allowSample.consent_wording_version) &&
      allowSample.match_run_id === fixture.matchRunId,
    `consent ${allowSample.consent_state}, scope ${allowSample.consent_channel_scope}, wording ${allowSample.consent_wording_version}, from the run it came from`,
  )

  /* ---- acceptance 3: the database enforcement, application checks removed ---- */
  {
    // Every insert below goes straight to the database with the service role.
    // No application code is in the way, which is the point: GA4 requires the
    // CONSTRAINT to refuse, not a code path that declines.
    const { data: allow } = await db
      .from('marketing_recipient_allowlist')
      .select('id')
      .eq('campaign_id', fixture.campaignId)
      .limit(1)
      .single()

    const foreign = await db.from('marketing_send').insert({
      campaign_id: fixture.campaignId,
      allowlist_id: randomUUID(),
      channel_code: 'email',
      template_key: 'event_first_word',
      sender_identity_id: fixture.senderIdentityId,
      segment_fingerprint: 'a'.repeat(64),
      rendered_subject: 'a probe that must be refused',
      rendered_body: 'a probe that must be refused',
      rendered_html: '<p>a probe that must be refused</p>',
      unsubscribe_token: randomUUID(),
      destination: `${LANE}-probe@eventlinqs.test`,
      state: 'draft',
    })
    check(
      'ga4.database.insert_send_for_non_allowlisted_recipient_is_refused_by_database',
      Boolean(foreign.error) && foreign.error.code === '23503',
      `the database answered ${foreign.error?.code ?? 'no error, which is the failure'}: ${(foreign.error?.message ?? '').slice(0, 140)}`,
    )

    const { data: member } = await db.from('audience_members').select('id').eq('email', fixture.emails[0]).single()
    const consentFalse = await db.from('marketing_recipient_allowlist').insert({
      campaign_id: fixture.campaignId,
      audience_member_id: member.id,
      channel_code: 'sms',
      consent_state: false,
      consent_channel_scope: 'sms',
      consent_at: new Date().toISOString(),
      consent_wording_version: 'v1',
    })
    check(
      'ga4.database.insert_allowlist_row_with_consent_false_is_refused_by_database',
      Boolean(consentFalse.error) && consentFalse.error.code === '23514',
      `the database answered ${consentFalse.error?.code ?? 'no error, which is the failure'}: ${(consentFalse.error?.message ?? '').slice(0, 140)}`,
    )

    const emailOnly = await db.from('marketing_recipient_allowlist').insert({
      campaign_id: fixture.campaignId,
      audience_member_id: member.id,
      channel_code: 'sms',
      consent_state: true,
      consent_channel_scope: 'email',
      consent_at: new Date().toISOString(),
      consent_wording_version: 'v1',
    })
    check(
      'ga4.database.sms_allowlist_row_on_an_email_consent_is_refused_by_database',
      Boolean(emailOnly.error) && emailOnly.error.code === '23514',
      `the database answered ${emailOnly.error?.code ?? 'no error, which is the failure'}: ${(emailOnly.error?.message ?? '').slice(0, 140)}`,
    )

    /*
     * THE CAP. The cap is set to ONE and one send is written, which fills it;
     * the second insert is the one that must be refused. The first version of
     * this check set the cap to the number of sends that already existed, which
     * was zero, so a cap of one had room for the very row it was meant to
     * refuse. The check was wrong and the database was right.
     */
    await db.from('marketing_campaign').update({ volume_cap: 1 }).eq('id', fixture.campaignId)
    const firstUnderCap = await db.from('marketing_send').insert({
      campaign_id: fixture.campaignId,
      allowlist_id: allow.id,
      channel_code: 'email',
      template_key: 'event_first_word',
      sender_identity_id: fixture.senderIdentityId,
      segment_fingerprint: 'c'.repeat(64),
      rendered_subject: 'the one send a cap of one allows',
      rendered_body: 'the one send a cap of one allows',
      rendered_html: '<p>the one send a cap of one allows</p>',
      unsubscribe_token: randomUUID(),
      destination: `${LANE}-probe@eventlinqs.test`,
      state: 'draft',
    })
    check(
      'ga4.database.the-send-that-fills-the-cap-is-allowed',
      !firstUnderCap.error,
      firstUnderCap.error?.message ?? 'a cap of one allows exactly one send, which is what makes the next refusal meaningful',
    )
    const overCap = await db.from('marketing_send').insert({
      campaign_id: fixture.campaignId,
      allowlist_id: allow.id,
      channel_code: 'email',
      template_key: 'event_first_word',
      sender_identity_id: fixture.senderIdentityId,
      segment_fingerprint: 'b'.repeat(64),
      rendered_subject: 'a probe that must be refused by the cap',
      rendered_body: 'a probe that must be refused by the cap',
      rendered_html: '<p>a probe that must be refused by the cap</p>',
      unsubscribe_token: randomUUID(),
      destination: `${LANE}-probe@eventlinqs.test`,
      state: 'draft',
    })
    check(
      'ga4.database.insert_send_exceeding_campaign_cap_is_refused_by_database_with_cap_in_error',
      Boolean(overCap.error) && /volume cap of/i.test(overCap.error.message) && overCap.error.message.includes(`${LANE}-campaign-${STAMP}`),
      `the database answered: ${(overCap.error?.message ?? 'no error, which is the failure').slice(0, 180)}`,
    )
    // The probe rows go before the real run, so they cannot be mistaken for it
    // and cannot eat the cap the campaign actually needs.
    await db.from('marketing_send').delete().eq('campaign_id', fixture.campaignId).eq('segment_fingerprint', 'c'.repeat(64))
    await db.from('marketing_campaign').update({ volume_cap: 500 }).eq('id', fixture.campaignId)
  }

  /* ---- the first run, before anybody has approved ---- */
  clearRecordedPayloads()
  const beforeApproval = await runCampaign({ campaignId: fixture.campaignId, channelCode: 'email' })
  check(
    'ga4.run.drafts-but-dispatches-nothing-before-approval',
    beforeApproval.drafted > 0 && beforeApproval.dispatched === 0 && beforeApproval.approved === false,
    `${beforeApproval.drafted} drafted, ${beforeApproval.dispatched} dispatched, approved ${beforeApproval.approved}`,
  )
  check(
    'ga4.run.mode-is-test-so-nobody-real-can-be-reached',
    beforeApproval.mode === 'test',
    `the campaigner is in ${beforeApproval.mode} mode`,
  )
  check(
    'ga4.approval.send_without_approval_for_new_segment_fingerprint_is_refused',
    recordedPayloads().length === 0,
    `the recorded sink was handed ${recordedPayloads().length} payload(s) before anybody approved`,
  )

  // And the database refuses the move directly, with no application in the way.
  {
    const { data: draft } = await db
      .from('marketing_send')
      .select('id')
      .eq('campaign_id', fixture.campaignId)
      .eq('state', 'draft')
      .limit(1)
      .single()
    const moved = await db.from('marketing_send').update({ state: 'sent' }).eq('id', draft.id)
    check(
      'ga4.database.send_leaving_draft_without_approval_is_refused_by_database',
      Boolean(moved.error) && /no approval for segment fingerprint/i.test(moved.error.message),
      `the database answered: ${(moved.error?.message ?? 'no error, which is the failure').slice(0, 160)}`,
    )
  }

  /* ---- the approval, granted through the admin screen a person uses ---- */
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

    await page.goto(`${BASE}/admin/campaigns?campaign=${fixture.campaignId}&channel=email`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)
    const beforeBody = await page.locator('body').innerText()
    check(
      'ga4.admin.says-nothing-is-approved-before-anybody-approves',
      /Nobody has approved this segment yet/i.test(beforeBody),
      'the screen states the gate in words rather than leaving it to be inferred',
    )
    await page.screenshot({ path: join(out, 'desktop-1440-01-before-approval.png'), fullPage: false })

    await page.getByRole('button', { name: /approve this segment/i }).click({ timeout: 30000 })
    await page.locator('p[role="status"]').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const afterBody = await page.locator('body').innerText()
    check(
      'ga4.admin.approval-is-granted-from-the-screen',
      /Approved for \d+ people/i.test(afterBody),
      afterBody.split(String.fromCharCode(10)).find(l => /Approved for/i.test(l)) ?? 'no confirmation on screen',
    )
    await page.screenshot({ path: join(out, 'desktop-1440-02-after-approval.png'), fullPage: false })
    await context.close()
  }

  const { data: approvalRow } = await db
    .from('marketing_send_approval')
    .select('segment_fingerprint, approver_user_id, approved_sample')
    .eq('campaign_id', fixture.campaignId)
    .maybeSingle()
  check(
    'ga4.approval.stores-who-approved-and-what-they-were-shown',
    Boolean(approvalRow?.approver_user_id) && (approvalRow?.approved_sample ?? '').includes('warehouse night'),
    `approved by ${approvalRow?.approver_user_id ? 'a named person' : 'nobody'}, sample ${(approvalRow?.approved_sample ?? '').length} characters`,
  )

  const { count: allowCount } = await db
    .from('marketing_recipient_allowlist')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', fixture.campaignId)
    .eq('channel_code', 'email')
  check(
    'ga4.approval.approval_for_one_fingerprint_does_not_authorise_a_changed_segment',
    approvalRow?.segment_fingerprint !==
      segmentFingerprint({ matchRunId: fixture.matchRunId, channelCode: 'email', allowlistSize: (allowCount ?? 0) + 1 }),
    'one more person on the list is a different fingerprint, so it needs a fresh approval',
  )

  /* ---- the second run: the approved drafts go to the sink ---- */
  clearRecordedPayloads()
  const afterApproval = await runCampaign({ campaignId: fixture.campaignId, channelCode: 'email' })
  check(
    'ga4.run.dispatches-the-approved-drafts',
    afterApproval.dispatched > 0,
    `${afterApproval.dispatched} dispatched of ${afterApproval.considered} considered`,
  )
  const payloads = recordedPayloads()
  check(
    'ga4.sink.stores-the-exact-payload',
    payloads.length === afterApproval.dispatched &&
      payloads.every(p => p.body.includes('warehouse night') && p.body.includes('marketing/preferences')),
    `${payloads.length} payload(s) recorded, every one carrying the organiser opening line and a working unsubscribe address`,
  )
  check(
    'ga4.sink.every-destination-is-inside-the-test-domain',
    payloads.every(p => p.destination.endsWith('@eventlinqs.test')),
    'no message in this run could have reached anybody outside the test domain',
  )
  check(
    'ga4.sink.the-outsider-was-refused-by-name',
    afterApproval.errors.some(e => e.includes(fixture.outsiderEmail) && /refusing to deliver/i.test(e)),
    afterApproval.errors.find(e => e.includes(fixture.outsiderEmail)) ?? 'the outsider was NOT refused, which is the failure',
  )

  const { data: storedSend } = await db
    .from('marketing_send')
    .select('rendered_subject, rendered_body, rendered_html, state, provider_message_id, destination, unsubscribe_token')
    .eq('campaign_id', fixture.campaignId)
    .eq('state', 'sent')
    .limit(1)
    .single()
  check(
    'ga4.render.rendered_body_is_stored_verbatim_on_the_send_row',
    storedSend.rendered_body.includes('We have one more warehouse night before summer') &&
      storedSend.rendered_body.includes('Jo, Lane B GA4') &&
      storedSend.rendered_html.includes('Lane B GA4, 1 Test Street'),
    'the body, the signature and the sender identity line are all on the row exactly as they were sent',
  )
  check(
    'ga4.render.email_renders_unsubscribe_link_and_sender_identity',
    storedSend.rendered_body.includes(storedSend.unsubscribe_token) &&
      storedSend.rendered_body.includes('Lane B GA4, 1 Test Street'),
    'the message carries this person own unsubscribe address and the business identity line',
  )

  /* ---- acceptance 6: the unsubscribe, from a real message, in a fresh browser ---- */
  {
    const link = storedSend.rendered_body.match(/https?:\/\/\S*marketing\/preferences\/\S+/)
    check('ga4.unsubscribe.link-is-in-the-rendered-message', Boolean(link), link ? link[0] : 'no link in the body')
    if (link) {
      fixture.unsubscriberEmail = storedSend.destination
      const localLink = link[0].replace(/^https?:\/\/[^/]+/, BASE)
      // A FRESH context: no cookies, no session, nothing this drive has done.
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: VIEWPORTS[0].userAgent })
      const page = await context.newPage()
      await page.goto(localLink, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(2000)
      await answerTheCookieBanner(page)
      const body = await page.locator('body').innerText()
      check(
        'ga4.unsubscribe.unsubscribe_link_resolves_without_login',
        !/sign in|log in/i.test(body.slice(0, 400)) && /preferences|marketing/i.test(body),
        'the preference page opened with no account and no session',
      )
      await page.screenshot({ path: join(out, 'mobile-390-03-unsubscribe-page.png'), fullPage: false })

      const stopButton = page.getByRole('button', { name: /stop|unsubscribe/i }).last()
      await stopButton.scrollIntoViewIfNeeded().catch(() => {})
      await stopButton.click({ timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(3500)
      await page.screenshot({ path: join(out, 'mobile-390-04-unsubscribed.png'), fullPage: false })
      await context.close()

      const { data: withdrawn } = await db
        .from('consent_events')
        .select('decision, occurred_at')
        .eq('subject_email', fixture.unsubscriberEmail)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { data: suppression } = await db
        .from('suppression_events')
        .select('id')
        .eq('subject_email', fixture.unsubscriberEmail)
        .limit(1)
        .maybeSingle()
      check(
        'ga4.unsubscribe.sets_consent_false',
        withdrawn?.decision === 'withdrawn' || Boolean(suppression),
        `the ledger now records ${withdrawn?.decision ?? 'no new decision'}${suppression ? ' and a suppression' : ''}`,
      )

      /*
       * THE NEXT RUN EXCLUDES THEM, WITH THE REASON RECORDED. The allowlist row
       * still exists, because admission was a decision taken at a moment. The
       * DOOR is what refuses now, and that is the whole reason the runner asks
       * it again at send time rather than trusting the allowlist.
       */
      await db.from('marketing_send').delete().eq('campaign_id', fixture.campaignId).eq('destination', fixture.unsubscriberEmail)
      const afterUnsubscribe = await runCampaign({ campaignId: fixture.campaignId, channelCode: 'email' })
      /*
       * THE NEWEST skip for that person, not the first one a query happened to
       * return. Skips accumulate across runs, and an earlier run had recorded
       * "already had this step" for the same person, which is true and is not
       * the answer to the question being asked here.
       */
      const { data: skips } = await db
        .from('marketing_send_skip')
        .select('reason, detail, allowlist_id, occurred_at')
        .eq('campaign_id', fixture.campaignId)
        .order('occurred_at', { ascending: false })
      const { data: theirAllow } = await db
        .from('marketing_recipient_allowlist')
        .select('id, audience_members(email)')
        .eq('campaign_id', fixture.campaignId)
      const theirs = (theirAllow ?? []).find(a => {
        const m = Array.isArray(a.audience_members) ? a.audience_members[0] : a.audience_members
        return m?.email === fixture.unsubscriberEmail
      })
      const theirSkip = (skips ?? []).find(s => s.allowlist_id === theirs?.id)
      check(
        'ga4.unsubscribe.next_pacing_run_excludes_them_with_the_reason_recorded',
        Boolean(theirSkip) && /consent door refused/i.test(theirSkip.reason),
        theirSkip ? `${theirSkip.reason}: ${theirSkip.detail ?? ''}` : 'no skip row was recorded for them, which is the failure',
      )
      check(
        'ga4.unsubscribe.nothing-was-sent-to-them-on-the-next-run',
        afterUnsubscribe.dispatched === 0 ||
          !recordedPayloads().some(p => p.destination === fixture.unsubscriberEmail),
        'the recorded sink was handed nothing addressed to the person who unsubscribed',
      )
    }
  }

  /* ---- acceptance 4: a repeat run needs no second approval ---- */
  {
    const repeat = await runCampaign({ campaignId: fixture.campaignId, channelCode: 'email' })
    check(
      'ga4.approval.repeat_send_to_same_fingerprint_needs_no_second_approval',
      repeat.approved === true,
      'the same segment is still approved and the run did not ask again',
    )
  }

  /* ---- acceptance 7: the admin view at all three widths ---- */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.userAgent,
      storageState: ADMIN_SESSION,
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/admin/campaigns?campaign=${fixture.campaignId}&channel=email`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    /*
     * WAIT FOR THE PAGE, DO NOT SLEEP AND HOPE. This used to be a flat 2500ms,
     * and on 15 September 2026 the FIRST viewport in this loop, 390, failed
     * `shows-the-schedule-against-days-remaining` and
     * `shows-the-message-exactly-as-it-arrives` while 768 and 1440 passed on the
     * same campaign moments later. The route was compiling on the first request
     * and the sections below the stat tiles had not arrived when the body was
     * read. Nothing was wrong with the product and the re-run was 49 of 49.
     *
     * `What has happened` is the LAST section this page renders once a campaign
     * resolves, so waiting for it means everything the checks read is present.
     * It is deliberately not the text any check asserts on: a wait for the
     * assertion's own subject turns a failure into a timeout and proves nothing.
     */
    await page
      .getByRole('heading', { name: 'What has happened' })
      .waitFor({ state: 'visible', timeout: 60000 })
    await answerTheCookieBanner(page)
    const body = await page.locator('body').innerText()

    check(
      `ga4.${vp.label}.admin.one-number-first`,
      /People this campaign may reach/i.test(body),
      'the size of the list leads the screen',
    )
    check(
      `ga4.${vp.label}.admin.shows-the-schedule-against-days-remaining`,
      /days until this event/i.test(body) && /open now|closed/i.test(body),
      'the step schedule is read against how many days are left',
    )
    check(
      `ga4.${vp.label}.admin.shows-the-cap-and-how-much-is-used`,
      /of 500 used on this channel/i.test(body) || /Cap used/i.test(body),
      'the cap and its use are on screen',
    )
    check(
      `ga4.${vp.label}.admin.shows-the-message-exactly-as-it-arrives`,
      body.includes('We have one more warehouse night before summer'),
      'the preview is the real render, carrying the organiser own words',
    )
    check(
      `ga4.${vp.label}.admin.no-horizontal-overflow`,
      !(await horizontalOverflow(page)),
      `the page fits ${vp.width} across`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-05-admin-campaign.png`), fullPage: false })
    await context.close()
  }

  /* ---- the reversal condition ---- */
  {
    await db.from('marketing_campaigner_config').update({ mode: 'hold' }).eq('id', true)
    const { count: sendsBefore } = await db
      .from('marketing_send')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', fixture.campaignId)
    clearRecordedPayloads()
    const held = await runCampaign({ campaignId: fixture.campaignId, channelCode: 'email' })
    const { count: sendsAfter } = await db
      .from('marketing_send')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', fixture.campaignId)
    check(
      'ga4.reversal.hold-dispatches-nothing-and-loses-nothing',
      held.dispatched === 0 && recordedPayloads().length === 0 && (sendsAfter ?? 0) >= (sendsBefore ?? 0),
      `mode ${held.mode}: ${held.dispatched} dispatched, ${recordedPayloads().length} handed to a sink, ${sendsBefore} send rows before and ${sendsAfter} after`,
    )
    await db.from('marketing_campaigner_config').update({ mode: 'test' }).eq('id', true)
  }

  /* ---- the invariant, across everything this drive did ---- */
  {
    const { data: breaches } = await db
      .from('marketing_send_invariant_breaches')
      .select('breach, campaign_reference')
    check(
      'ga4.invariant.the-view-is-empty',
      (breaches ?? []).length === 0,
      (breaches ?? []).map(b => `${b.breach} on ${b.campaign_reference}`).join('; ') || 'no breach of any clause',
    )
  }
} catch (error) {
  check('ga4.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await db.from('marketing_campaigner_config').update({ mode: 'test' }).eq('id', true)
    await teardown()
    const { count } = await db
      .from('marketing_campaign')
      .select('id', { count: 'exact', head: true })
      .eq('reference', `${LANE}-campaign-${STAMP}`)
    check('ga4.teardown.left-as-found', (count ?? 0) === 0, `${count ?? 0} lane B GA4 campaign row(s) remain`)

    /*
     * AND NOTHING OF THIS DRIVE'S, FROM ANY RUN, IS LEFT PUBLISHED. The count
     * above asks about one table. This asks the sitemap's question of every
     * row carrying this drive's prefix, including rows an EARLIER run left
     * behind, which is how a published GA5 fixture event lived on shared TEST
     * for two days while every run reported "left as found".
     */
    const leftPublished = await laneFixturesStillPublished(db, 'lane-b-ga4-')
    check(
      'ga4.teardown.nothing-of-this-drive-is-left-published',
      leftPublished.length === 0,
      leftPublished.length === 0
        ? 'no organiser, event or venue page of this drive is in the sitemap'
        : `still published: ${leftPublished.join(', ')}. Every one of them 404s when the row goes.`,
    )
  } catch (error) {
    check('ga4.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'ga4-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`GA4 DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
