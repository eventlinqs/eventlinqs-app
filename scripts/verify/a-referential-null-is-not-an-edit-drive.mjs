/**
 * DRIVEN: AN ACCOUNT IS CLOSED AFTER THE FEE MOVED, AND THE DATABASE DOES NOT
 * ARGUE ABOUT THE PRICE.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by pressing what the founder presses.
 *
 *   1. THE ARMING IS A REAL SCREEN, NOT A FIXTURE. The fee is moved on
 *      /admin/pricing, through the real override picker, signed in at the real
 *      /admin/login, at 390, 768 and 1440. That is the single action that lifts
 *      the derived group-rate floor above a rate that was legal when it was set.
 *
 *   2. THE ACCOUNT CLOSES. `auth.admin.deleteUser` on the person who set that
 *      rate, for real, through the one place this repository deletes an account.
 *      Before migration 20260919000140 this failed with
 *      "a group rate of ... is below the floor of ...", which is a price
 *      complaint raised at somebody closing their account.
 *
 *   3. THE RULE THE TRIGGER EXISTS FOR IS UNTOUCHED. Inserting a rate below the
 *      floor is still refused, and so is editing an existing rate below it. The
 *      fix narrowed WHEN the judgement runs and not WHAT it judges, and a proof
 *      that only showed the deletion succeeding would be consistent with having
 *      deleted the trigger.
 *
 *   4. THE SECOND INSTANCE, WHICH ARMS ITSELF WITH THE CALENDAR. An audience
 *      member whose consent has aged past `consent_policy.max_age_months` used
 *      to hold down their own account, the order they last bought and the event
 *      they last attended. That half is put to the database INSIDE A
 *      TRANSACTION THAT IS ROLLED BACK, and the reason is written here rather
 *      than glossed: `consent_policy` has no admin screen, so the only way to
 *      arm it is to change a value every lane on this machine reads, and a
 *      rolled-back transaction is invisible to the other two sessions while
 *      being exactly the same statement inside this one.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT LEAVES ON TEST: NOTHING, AND IT ASKS THE DATABASE RATHER THAN SAYING SO.
 *
 * Everything hangs off one disposable organisation, `lane-b-rejudge`, purged
 * before the run as well as after it. The teardown RE-READS TEST and fails the
 * run on anything left, because a purge that half worked used to report success
 * on this platform for five days.
 *
 * TEST ONLY. It refuses any Supabase project that is not vkapkibzokmfaxqogypq.
 *
 * Run:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/a-referential-null-is-not-an-edit-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-REJUDGE
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const TAG = 'lane-b-rejudge'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3100'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes(TEST_REF)) {
  console.error(`FAIL: this drive only touches TEST ${TEST_REF}, not ${url}`)
  process.exit(1)
}
if (!serviceKey) {
  console.error('FAIL: SUPABASE_SERVICE_ROLE_KEY is not set')
  process.exit(1)
}
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? ''

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
const record = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

/**
 * Raw SQL against TEST, through the Management API, because a referential null
 * cannot be issued through PostgREST and because the arming for the audience
 * half has to happen inside a transaction that is rolled back.
 */
async function sql(query) {
  if (!accessToken) return { ok: false, body: 'no SUPABASE_ACCESS_TOKEN in the environment' }
  const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return { ok: res.ok, body: await res.text() }
}

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

async function purge() {
  const { data: orgs } = await db.from('organisations').select('id').like('slug', `${TAG}%`)
  for (const org of orgs ?? []) {
    const { data: events } = await db.from('events').select('id').eq('organisation_id', org.id)
    for (const event of events ?? []) {
      await db.from('event_group_rates').delete().eq('event_id', event.id)
      await db.from('pricing_rules').delete().eq('event_id', event.id)
      await db.from('ticket_tiers').delete().eq('event_id', event.id)
      await db.from('events').delete().eq('id', event.id)
    }
    await db.from('organisation_members').delete().eq('organisation_id', org.id)
    await db.from('organisations').delete().eq('id', org.id)
  }
  const { data: profiles } = await db.from('profiles').select('id').like('email', `${TAG}%`)
  for (const profile of profiles ?? []) await tearDownAccountOrFailTheRun(db, profile.id)
}

async function makeAccount(role, stamp, label) {
  const email = `${TAG}-${role}-${stamp}@eventlinqs.test`
  const created = await db.auth.admin.createUser({ email, password: `${randomUUID()}Aa1`, email_confirm: true })
  if (created.error) throw new Error(`create ${role}: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: label })
  return { id, email }
}

async function buildFixture() {
  const stamp = Date.now().toString(36)

  /*
   * TWO ACCOUNTS, AND THE REASON IS A DEFECT THIS DRIVE FOUND IN ITSELF. The
   * first version made the rate's author the organisation's OWNER as well, so
   * deleting them was refused by `organisations.owner_id` and the run reported
   * a failure that had nothing to do with the subject. The author here owns
   * nothing: they are a `created_by` and no more, which is the shape the
   * referential null exists for.
   */
  const owner = await makeAccount('owner', stamp, 'Lane B Rejudge Owner')
  const author = await makeAccount('author', stamp, 'Lane B Rejudge Author')
  const authorId = author.id
  const email = author.email

  const orgSlug = `${TAG}-${stamp}`
  const { data: org, error: orgError } = await db
    .from('organisations')
    .insert({ name: `Lane B Rejudge ${stamp}`, slug: orgSlug, owner_id: owner.id })
    .select('id')
    .single()
  if (orgError) throw new Error(`create organisation: ${orgError.message}`)

  /*
   * THE COLUMN SET IS TAKEN FROM `lib/refund-proof-fixture.mjs`, which builds
   * events on TEST every day, rather than from a guess. The first version of
   * this drive invented `events.currency` and was refused by PostgREST, which
   * is the cheap version of the same mistake.
   */
  const startDate = new Date(Date.now() + 30 * 86400000)
  const { data: event, error: eventError } = await db
    .from('events')
    .insert({
      organisation_id: org.id,
      created_by: owner.id,
      title: `Lane B Rejudge Night ${stamp}`,
      slug: `${TAG}-night-${stamp}`,
      description: 'Fixture event for the referential-null proof.',
      summary: 'Lane B rejudge fixture',
      start_date: startDate.toISOString(),
      end_date: new Date(startDate.getTime() + 3 * 36e5).toISOString(),
      timezone: 'Australia/Melbourne',
      event_type: 'in_person',
      venue_name: 'Proof Hall',
      venue_address: '1 Proof St',
      venue_city: 'Geelong',
      venue_state: 'VIC',
      venue_country: 'Australia',
      /*
       * DRAFT AND UNLISTED for the whole of its life. A published fixture on
       * TEST refused lane A's push at the indexing step in September 2026, and
       * nothing about this proof needs the event to be visible to anybody.
       * Both values are enum labels, read off `event_status` and
       * `event_visibility` on TEST rather than guessed: the first version of
       * this drive wrote `pending`, which is not one of the eight.
       */
      status: 'draft',
      visibility: 'unlisted',
      is_age_restricted: false,
      max_capacity: 50,
      is_free: false,
      fee_pass_type: 'pass_to_buyer',
    })
    .select('id, title')
    .single()
  if (eventError) throw new Error(`create event: ${eventError.message}`)

  const { data: tier, error: tierError } = await db
    .from('ticket_tiers')
    .insert({
      event_id: event.id,
      name: 'General Admission',
      description: 'Lane B rejudge fixture tier',
      tier_type: 'general_admission',
      price: 5000,
      currency: 'AUD',
      total_capacity: 50,
      sold_count: 0,
      reserved_count: 0,
      min_per_order: 1,
      max_per_order: 10,
      sort_order: 0,
      is_visible: true,
      is_active: true,
      dynamic_pricing_enabled: false,
      requires_access_code: false,
    })
    .select('id, price')
    .single()
  if (tierError) throw new Error(`create tier: ${tierError.message}`)

  return { authorId, email, ownerId: owner.id, orgId: org.id, event, tier }
}

/** The floor the DATABASE derives, asked of the database rather than computed here. */
async function floorFor(eventId, orgId) {
  const res = await sql(
    `select public.group_rate_floor_cents('${eventId}'::uuid, '${orgId}'::uuid, 'AU', 'AUD') as floor`,
  )
  if (!res.ok) throw new Error(`floor: ${res.body.slice(0, 300)}`)
  return JSON.parse(res.body)[0].floor
}

async function main() {
  console.log(`\n=== a referential null is not an edit, driven against ${BASE} and TEST ${TEST_REF} ===\n`)

  await purge()
  const fixture = await buildFixture()
  console.log(`fixture: event ${fixture.event.id}, tier ${fixture.tier.id} at ${fixture.tier.price}c, author ${fixture.email}\n`)

  const floorBefore = await floorFor(fixture.event.id, fixture.orgId)
  record(
    'the database derives a floor from pricing_rules, and the rate is set above it',
    floorBefore > 0 && floorBefore < fixture.tier.price,
    `floor ${floorBefore}c against a ticket at ${fixture.tier.price}c`,
  )

  // A legal rate: above the floor today, below the ticket price.
  const rateCents = Math.max(floorBefore + 1, Math.round(fixture.tier.price * 0.8))
  const { error: rateError } = await db.from('event_group_rates').insert({
    event_id: fixture.event.id,
    ticket_tier_id: fixture.tier.id,
    min_group_size: 3,
    unit_price_cents: rateCents,
    created_by: fixture.authorId,
  })
  record('a group rate that clears the floor is accepted', !rateError, rateError?.message ?? `${rateCents}c`)

  // ----------------------------------------------------------------- 1 -----
  // THE ARMING, THROUGH THE REAL SCREEN.
  const admin = await createProofAdmin(db, { label: 'Lane B Rejudge Proof' })
  const browser = await chromium.launch()
  let armed = false
  let saveStatus = 'not attempted'
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
      const page = await context.newPage()
      const reached = await signInAsOwner(page, BASE, admin)
      record(`${viewport.name}: the owner reaches the admin console`, reached)

      await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.locator('#ov-scope').waitFor({ state: 'visible', timeout: 60000 })
      await page.screenshot({ path: join(out, `${viewport.name}-1-admin-pricing.png`), fullPage: true })

      const hasOverrideForm = await page.locator('#ov-search').isVisible()
      record(`${viewport.name}: the per-event fee override form is on the screen`, hasOverrideForm)

      /*
       * THE SCREEN FITS, measured on the element boxes rather than on
       * documentElement.scrollWidth, because globals.css clips the overflow and
       * a scrollWidth assertion on this platform is a gate that cannot go red.
       * The shared rule is UX6.3's.
       */
      const fit = await page.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
      const faults = judgeSurface({ label: '/admin/pricing', width: viewport.width, fit, totals: [] })
      record(`${viewport.name}: nothing on /admin/pricing is clipped past the right edge`, faults.length === 0, faults.join('; '))

      if (!armed && hasOverrideForm) {
        /*
         * ONLY THE FIRST VIEWPORT SAVES. The override is versioned and
         * audit-logged, so saving it three times would write three versions of
         * the same decision and say nothing extra. The other two viewports
         * prove the screen, which is what a viewport can prove.
         */
        await page.locator('#ov-scope').selectOption('event')
        await page.locator('#ov-search').fill(fixture.event.title)
        const option = page.locator('ul li button', { hasText: fixture.event.title }).first()
        await option.waitFor({ state: 'visible', timeout: 30000 })
        await option.click()
        /*
         * A fixed fee just under the ticket price lifts the derived floor above
         * the rate that was legal a moment ago.
         *
         * THE PERCENTAGE IS FILLED IN DELIBERATELY AND IS NOT LEFT AT THE
         * FORM'S OWN DEFAULT. `platform_fee_percentage` defaults to 0 on this
         * screen and `pricing_rules_value_split_check` requires
         * `value_percentage > 0`, so saving the form as it arrives redirects to
         * ?status=override_error and writes neither field. That is a defect on
         * this screen, it is NOT this item's subject, and it is recorded in
         * REVIEW-QUEUE-B.md as LB-OVERRIDE0. This drive routes around it rather
         * than depending on it, so it keeps passing either way.
         */
        await page.locator('#ov-pct').fill('1')
        await page.locator('#ov-fixed').fill(String(fixture.tier.price - 200))
        page.once('dialog', d => d.accept())
        await page.getByRole('button', { name: /save override/i }).click()
        /*
         * THE ACTION ANSWERS IN THE URL and the first version of this drive did
         * not read it. `updateOverridePricingAction` redirects to
         * ?status=override_saved, ?status=override_invalid or
         * ?status=override_error, so a save that was refused looked exactly
         * like a save that worked until the floor was measured afterwards.
         */
        await page.waitForURL(/status=override_/, { timeout: 60000 }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
        await page.screenshot({ path: join(out, `${viewport.name}-2-override-saved.png`), fullPage: true })
        saveStatus = new URL(page.url()).searchParams.get('status') ?? 'no status in the url'
        record(`${viewport.name}: the fee override is accepted by the admin action`, saveStatus === 'override_saved', saveStatus)
        armed = true
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  const floorAfter = await floorFor(fixture.event.id, fixture.orgId)
  record(
    'the fee moved on the admin screen and the derived floor rose above the existing rate',
    armed && floorAfter > rateCents,
    `floor ${floorBefore}c -> ${floorAfter}c, with a rate of ${rateCents}c sitting under it`,
  )

  // ----------------------------------------------------------------- 2 -----
  // THE PROOF: the account closes.
  /*
   * `tearDownAccountOrFailTheRun` sets process.exitCode and prints rather than
   * throwing, so the only honest question is whether the account is still
   * there. The first version of this drive reported "deleteUser succeeded"
   * beside a FAIL, which is the harness lying about the product.
   */
  let closeError = ''
  try {
    await tearDownAccountOrFailTheRun(db, fixture.authorId)
  } catch (error) {
    closeError = String(error?.message ?? error)
  }
  const stillThere = await db.auth.admin.getUserById(fixture.authorId)
  const gone = !stillThere.data?.user
  record(
    'the account that set the underwater rate is CLOSED, and the price is not consulted',
    gone,
    gone ? 'the account is gone from auth.users' : `still present${closeError ? `: ${closeError}` : ''}`,
  )

  const { data: survivingRate } = await db
    .from('event_group_rates')
    .select('created_by, unit_price_cents')
    .eq('event_id', fixture.event.id)
    .maybeSingle()
  record(
    'the rate survives its author with created_by blanked, which is what on delete set null is for',
    survivingRate !== null && survivingRate?.created_by === null && survivingRate?.unit_price_cents === rateCents,
    JSON.stringify(survivingRate),
  )

  // ----------------------------------------------------------------- 3 -----
  // THE RULE IS UNTOUCHED.
  const editUnder = await db
    .from('event_group_rates')
    .update({ unit_price_cents: Math.max(1, floorAfter - 100) })
    .eq('event_id', fixture.event.id)
  record(
    'editing the rate BELOW the floor is still refused by the database',
    Boolean(editUnder.error) && /below the floor/i.test(editUnder.error?.message ?? ''),
    editUnder.error?.message ?? 'THE RULE WAS LOST: the edit was accepted',
  )

  await db.from('event_group_rates').delete().eq('event_id', fixture.event.id)
  const insertUnder = await db.from('event_group_rates').insert({
    event_id: fixture.event.id,
    ticket_tier_id: fixture.tier.id,
    min_group_size: 3,
    unit_price_cents: Math.max(1, floorAfter - 100),
    created_by: null,
  })
  record(
    'inserting a rate BELOW the floor is still refused by the database',
    Boolean(insertUnder.error) && /below the floor/i.test(insertUnder.error?.message ?? ''),
    insertUnder.error?.message ?? 'THE RULE WAS LOST: the insert was accepted',
  )

  const smallGroup = await db.from('event_group_rates').insert({
    event_id: fixture.event.id,
    ticket_tier_id: fixture.tier.id,
    min_group_size: 2,
    unit_price_cents: floorAfter + 1,
    created_by: null,
  })
  record(
    'a group of two is still refused, so the CHECK constraint was not disturbed',
    Boolean(smallGroup.error),
    smallGroup.error?.message ?? 'THE RULE WAS LOST: a group of two was accepted',
  )

  // ----------------------------------------------------------------- 4 -----
  // THE SECOND INSTANCE, in a transaction that is rolled back.
  const aged = await sql(`
    select am.email,
           round(extract(epoch from (now() - ce.occurred_at)) / 2629746.0, 2) as months_old
      from public.audience_members am
      join lateral (
        select * from public.consent_events c
         where c.subject_email = am.email order by c.occurred_at desc, c.id desc limit 1) ce on true
     order by ce.occurred_at asc limit 1`)
  const oldest = aged.ok ? JSON.parse(aged.body)[0] : null
  record(
    'an audience member exists whose consent is old enough for a tightened policy to age out',
    Boolean(oldest) && Number(oldest.months_old) > 2,
    oldest ? `${oldest.email} at ${oldest.months_old} months` : 'none found',
  )

  if (oldest) {
    const arm = `update public.consent_policy set max_age_months = 2 where id;`
    for (const [label, column] of [
      ['the ORDER they last bought', 'last_order_id'],
      ['the ACCOUNT itself', 'user_id'],
      ['the EVENT they last attended', 'last_event_id'],
    ]) {
      const res = await sql(
        `begin;${arm}update public.audience_members set ${column} = null where email = '${oldest.email}';rollback;`,
      )
      record(
        `with consent aged out, deleting ${label} is no longer refused`,
        res.ok,
        res.ok ? `${column} blanked` : res.body.slice(0, 260),
      )
    }
    const stillRefused = await sql(
      `begin;${arm}update public.audience_members set email = '${TAG}-moved@eventlinqs.test' where email = '${oldest.email}';rollback;`,
    )
    record(
      'changing an audience address without live consent is STILL refused',
      !stillRefused.ok,
      stillRefused.ok ? 'THE RULE WAS LOST' : 'refused, as it must be',
    )
    const policy = await sql(`select max_age_months from public.consent_policy`)
    record(
      'the consent policy is exactly as it was, because every arming was rolled back',
      policy.ok && JSON.parse(policy.body)[0].max_age_months === 24,
      policy.ok ? `max_age_months = ${JSON.parse(policy.body)[0].max_age_months}` : policy.body.slice(0, 200),
    )
  }

  // ----------------------------------------------------------------- 5 -----
  await removeProofAdmin(db, admin)
  await purge()

  const leftovers = {}
  const { data: orgsLeft } = await db.from('organisations').select('id').like('slug', `${TAG}%`)
  leftovers.organisations = orgsLeft?.length ?? 0
  const { data: profilesLeft } = await db.from('profiles').select('id').like('email', `${TAG}%`)
  leftovers.profiles = profilesLeft?.length ?? 0
  const { data: ratesLeft } = await db.from('event_group_rates').select('id')
  leftovers.group_rates_on_test = ratesLeft?.length ?? 0
  record(
    'TEST is left as it was found, re-read rather than asserted',
    leftovers.organisations === 0 && leftovers.profiles === 0 && leftovers.group_rates_on_test === 0,
    JSON.stringify(leftovers),
  )

  const passed = checks.filter(c => c.ok).length
  const report = {
    base: BASE,
    project: TEST_REF,
    ranAt: new Date().toISOString(),
    floorBefore,
    floorAfter,
    rateCents,
    passed,
    total: checks.length,
    checks,
  }
  writeFileSync(join(out, 'rejudge-drive-report.json'), JSON.stringify(report, null, 2))
  console.log(`\n${passed} of ${checks.length} checks passed`)
  if (passed !== checks.length) process.exit(1)
}

main().catch(async error => {
  console.error(`\nFAILED: ${error?.stack ?? error}`)
  await purge().catch(() => {})
  process.exit(1)
})
