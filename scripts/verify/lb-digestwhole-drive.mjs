/**
 * DRIVEN PROOF: THE WEEKLY CITY EMAIL REACHES EVERY PERSON WHO CONSENTED, AND
 * NOBODY WHO WITHDREW.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by pressing the button a person presses and then asking the
 * real cron route and the real database, never the code.
 *
 *   1. THE DEFECT, MEASURED ON THIS DATABASE RATHER THAN INFERRED. The old
 *      suppression read was one un-chunked `.in('email', waitlistEmails)` over
 *      a whole city's waitlist. This drive joins the real address list, reports
 *      its byte length against the documented 16 KB bound, ISSUES THAT EXACT
 *      QUERY against TEST, and records what comes back. Then it issues the
 *      chunked form and records that the withdrawal is found.
 *   2. A city with more consenting people than one response can carry resolves
 *      its WHOLE audience: 1,150 written, 1,150 in the route's own dry run.
 *   3. The person who withdrew is absent from that audience entirely, even
 *      though a live waitlist row would otherwise put them back in, and even
 *      though their address sits past the first chunk.
 *   4. The city itself still appears in the run's city list with more than a
 *      thousand consent rows on the platform.
 *   5. A period that stopped at the per-run cap is RESUMED rather than skipped,
 *      it resumes at the right person, and the people already written to are
 *      not written to twice. Proven by reading the server's own mail log.
 *   6. A period that finished IS skipped.
 *   7. The unsubscribe page renders, passes axe and works at 390, 768 and 1440,
 *      and pressing it removes that person from the next run's audience.
 *
 * ---------------------------------------------------------------------------
 * USAGE. The server must be up first, and it must be the one with a mail
 * transport and a rate-limit store; a bare `next dev` sends through Resend:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/lb-digestwhole-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-DIGESTWHOLE
 *
 *   -u NEXT_PUBLIC_SUPABASE_*   this shell carries the PRODUCTION url, which
 *                               overrides .env.local. The drive refuses to run
 *                               against anything but TEST, so without this it
 *                               stops on its own rather than touching
 *                               production.
 *   --env-file=.env.local       the service key, and CRON_SECRET for the route
 *
 * ---------------------------------------------------------------------------
 * IT CREATES NO EVENT AND NO ORGANISATION, on purpose. The digest needs
 * published public events in the city inside the period, and
 * `scripts/guards/fixtures-are-not-published.mjs` exists because a drive that
 * publishes its own fixture advertises a page that is about to stop existing
 * and fails another lane's gate. So this drive uses a city that ALREADY has
 * real published events and asserts that it does, failing as a product defect
 * if it does not rather than quietly creating one.
 *
 * TEST IS LEFT AS FOUND. Every row is tagged `lane-b-digestwhole-` and removed
 * in the teardown, which re-reads rather than trusting its own delete.
 * `consent_events` and `suppression_events` refuse DELETE by design (close-out
 * GA1 v3, acceptance 13) and are reported by count instead.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3100').replace(/\/$/, '')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const cronSecret = process.env.CRON_SECRET ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url || '(no url)'}`)
  process.exit(1)
}
if (!cronSecret) {
  console.error('FAIL: CRON_SECRET is not set, so the route would refuse every request and the drive would report the guard as the product.')
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const ROOT = resolve(import.meta.dirname, '..', '..')
const SERVER_LOG = resolve(ROOT, '.tmp-lane-b-serve.log')

const TAG = 'lane-b-digestwhole'
const STAMP = Date.now().toString(36)
const CITY = 'geelong'
/** Enough consent rows to pass the documented 1,000-row response ceiling. */
const CONSENT_ROWS = 1150
/** Enough waitlist addresses that their joined list passes the 16 KB URL bound. */
const WAITLIST_ROWS = 420
/** Addresses given a ledger grant, and therefore the live send audience. */
const PERMITTED = 6
/** The digest wording version that expressly covers the weekly email. */
const COVERING_VERSION = 'v3'
const DIGEST_PURPOSE = 'platform_local_digest'

const consentEmail = i => `${TAG}-c${String(i).padStart(4, '0')}-${STAMP}@example.test`
const waitlistEmail = i => `${TAG}-w${String(i).padStart(4, '0')}-${STAMP}@example.test`
/** The address that withdrew. LAST, so it sits past the first chunk of the list. */
const WITHDRAWN = waitlistEmail(WAITLIST_ROWS - 1)

const checks = []
const notes = []
let failed = 0
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? '') })
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`)
}
function note(line) {
  notes.push(line)
  console.log(`      ${line}`)
}

/** A write big enough to matter goes in batches, with one retry: a 500-row body
 * against this project answers `TypeError: fetch failed` often enough that a
 * drive which does not retry reports the network as a product defect. */
async function insertInBatches(table, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size)
    let lastError = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await db.from(table).insert(slice)
      if (!error) {
        lastError = null
        break
      }
      lastError = error
    }
    if (lastError) throw new Error(`${table} insert failed at row ${i}: ${lastError.message}`)
  }
}

async function runDigest(params) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/api/cron/weekly-digest${qs ? `?${qs}` : ''}`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  })
  const body = await res.json()
  return { status: res.status, body }
}

const cityResult = (body, slug = CITY) =>
  (body.cities ?? []).find(c => c.city === slug) ?? null

/** How many lines of the server's mail log name this address. The console
 * transport prints every message it is handed, so this is the only place that
 * can say whether a person was written to twice. */
function mailLogCount(address, fromByte) {
  if (!existsSync(SERVER_LOG)) return -1
  const buf = readFileSync(SERVER_LOG)
  const text = buf.subarray(Math.min(fromByte, buf.length)).toString('utf8')
  return text.split(address).length - 1
}
const serverLogSize = () => (existsSync(SERVER_LOG) ? statSync(SERVER_LOG).size : 0)

const fixture = { consents: [], waitlist: [], digestSendId: null }

async function main() {
  // -------------------------------------------------------------- the city
  const { data: cityRow, error: cityErr } = await db
    .from('cities')
    .select('slug, name')
    .eq('slug', CITY)
    .maybeSingle()
  check('setup.city-exists', !cityErr && Boolean(cityRow), cityErr?.message ?? `${CITY} -> ${cityRow?.name}`)

  const periodStart = new Date().toISOString().slice(0, 10)
  const periodEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const { data: liveEvents } = await db
    .from('events')
    .select('id, slug')
    .eq('city_primary', CITY)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', `${periodStart}T00:00:00Z`)
    .lte('start_date', `${periodEnd}T23:59:59Z`)
    .limit(5)
  check(
    'setup.city-has-real-published-events',
    (liveEvents ?? []).length > 0,
    `${(liveEvents ?? []).length} published public event(s) in ${CITY} this period; this drive publishes none of its own`,
  )

  // ------------------------------------------------------- the audience rows
  const consentRows = Array.from({ length: CONSENT_ROWS }, (_, i) => ({
    email: consentEmail(i),
    status: 'granted',
    city_slug: CITY,
    consent_text: `${TAG} fixture: the weekly EventLinqs email about events in ${cityRow?.name ?? CITY}.`,
    consent_version: COVERING_VERSION,
    source: TAG,
    granted_at: new Date(Date.now() - (CONSENT_ROWS - i) * 1000).toISOString(),
  }))
  await insertInBatches('marketing_consents', consentRows)
  fixture.consents = consentRows.map(r => r.email)

  const waitlistRows = Array.from({ length: WAITLIST_ROWS }, (_, i) => ({
    city_slug: CITY,
    full_name: `${TAG} waiter ${i}`,
    email: waitlistEmail(i),
    role: 'attendee',
    consent_text: `${TAG} fixture waitlist wording covering the weekly digest.`,
    consent_version: COVERING_VERSION,
    source: TAG,
  }))
  await insertInBatches('city_waitlist_signups', waitlistRows)
  fixture.waitlist = waitlistRows.map(r => r.email)

  // The person who withdrew: a live waitlist row AND a withdrawn consent row.
  // Rule 1 of the merge says suppression wins; this is the row that proves it.
  const withdrawnInsert = await db.from('marketing_consents').insert({
    email: WITHDRAWN,
    status: 'withdrawn',
    city_slug: CITY,
    consent_text: `${TAG} fixture: withdrawn.`,
    consent_version: COVERING_VERSION,
    source: TAG,
    granted_at: new Date().toISOString(),
    revoked_at: new Date().toISOString(),
  })
  fixture.consents.push(WITHDRAWN)
  check('setup.withdrawn-row-written', !withdrawnInsert.error, withdrawnInsert.error?.message ?? WITHDRAWN)

  const written = await db
    .from('marketing_consents')
    .select('email', { count: 'exact', head: true })
    .eq('city_slug', CITY)
    .eq('status', 'granted')
    .like('email', `${TAG}-%`)
  check(
    'setup.audience-written-past-the-ceiling',
    written.count === CONSENT_ROWS,
    `${written.count} granted rows for ${CITY} tagged ${TAG}, against the documented 1,000-row response ceiling`,
  )

  // ------------------------------------------------------ the ledger grants
  const { data: tenant } = await db
    .from('marketing_tenants')
    .select('id')
    .eq('slug', 'eventlinqs')
    .maybeSingle()
  const permittedEmails = fixture.consents.slice(0, PERMITTED)
  const ledgerRows = permittedEmails.map(email => ({
    tenant_id: tenant.id,
    subject_email: email,
    purpose: DIGEST_PURPOSE,
    channel_scope: 'email',
    decision: 'granted',
    wording: `${TAG} fixture: the weekly EventLinqs email about events in ${cityRow?.name ?? CITY}.`,
    wording_version: COVERING_VERSION,
    capture_surface: TAG,
    third_party_scope: 'events listed on EventLinqs, inside the EventLinqs weekly local digest',
    suppression_scope: 'every EventLinqs facilitated message on every channel',
  }))
  const ledger = await db.from('consent_events').insert(ledgerRows)
  check('setup.ledger-grants-written', !ledger.error, ledger.error?.message ?? `${PERMITTED} address(es) permitted by the ledger`)

  // =========================================================================
  // 1. THE DEFECT, MEASURED ON THIS DATABASE.
  // =========================================================================
  const joined = fixture.waitlist.join(',')
  const joinedBytes = new TextEncoder().encode(joined).length
  check(
    'defect.the-old-in-list-passes-the-documented-url-bound',
    joinedBytes > 16_000,
    `${WAITLIST_ROWS} addresses join to ${joinedBytes} bytes; Supabase bounds URL and headers together at 16 KB and names lengthy in clauses as the usual cause`,
  )

  let oldShape = null
  try {
    const { data, error } = await db
      .from('marketing_consents')
      .select('email')
      .eq('status', 'withdrawn')
      .in('email', fixture.waitlist)
    oldShape = error ? `error: ${error.message}` : `returned ${(data ?? []).length} row(s)`
  } catch (error) {
    oldShape = `threw: ${error instanceof Error ? error.message : String(error)}`
  }
  const oldFoundTheWithdrawal = /returned [1-9]/.test(oldShape)
  check(
    'defect.the-old-suppression-read-does-not-find-the-withdrawal',
    !oldFoundTheWithdrawal,
    `the exact query the code used to issue, against TEST, ${oldShape}. The code discarded that error, so the suppression list was EMPTY and rule 1 of the merge was switched off.`,
  )

  const { chunkInFilterValues } = await import('../../src/lib/supabase/in-chunks.ts')
  let chunkedFound = 0
  let chunkCount = 0
  for (const chunk of chunkInFilterValues(fixture.waitlist)) {
    chunkCount += 1
    const { data, error } = await db
      .from('marketing_consents')
      .select('email')
      .eq('status', 'withdrawn')
      .in('email', chunk)
    if (error) throw new Error(`chunked suppression read failed: ${error.message}`)
    chunkedFound += (data ?? []).length
  }
  check(
    'defect.the-chunked-suppression-read-finds-it',
    chunkedFound === 1,
    `${chunkCount} request(s), ${chunkedFound} withdrawal(s) found`,
  )

  // =========================================================================
  // 2, 3, 4. THE ROUTE'S OWN VIEW OF THE AUDIENCE.
  // =========================================================================
  const dry = await runDigest({ city: CITY, dry_run: '1' })
  check('audience.dry-run-answers', dry.status === 200 && dry.body.ok === true, `HTTP ${dry.status}`)
  const dryCity = cityResult(dry.body)
  check('audience.city-resolved', Boolean(dryCity), JSON.stringify(dryCity?.skipped ?? 'resolved'))

  const candidates = (dryCity?.recipients ?? 0) + (dryCity?.refusedByLedger ?? 0)
  check(
    'audience.every-consenting-person-past-the-ceiling-is-in-it',
    candidates >= CONSENT_ROWS,
    `${candidates} candidate(s) resolved, ${CONSENT_ROWS} written by this drive plus whatever the city already had. Before this pass the read stopped at 1,000.`,
  )

  const everyAddress = [
    ...(dryCity?.recipientEmails ?? []).map(s => s.split(' ')[0]),
    ...(dryCity?.refusalReasons ?? []).map(s => s.split(':')[0]),
  ]
  check(
    'audience.the-last-consenting-person-is-in-it',
    everyAddress.includes(consentEmail(CONSENT_ROWS - 1)),
    `the ${CONSENT_ROWS}th address, which the old read never reached`,
  )
  check(
    'suppression.the-person-who-withdrew-is-not-in-it',
    !everyAddress.includes(WITHDRAWN),
    `${WITHDRAWN} holds a LIVE waitlist row for ${CITY} and is still absent, which is rule 1 of the merge holding`,
  )
  check(
    'suppression.their-neighbours-on-the-same-list-are-in-it',
    everyAddress.includes(waitlistEmail(WAITLIST_ROWS - 2)),
    'the suppression removed one person rather than the whole waitlist',
  )

  const allCities = await runDigest({ dry_run: '1' })
  const cityNames = (allCities.body.cities ?? []).map(c => c.city)
  check(
    'cities.the-city-is-still-on-the-platform-wide-list',
    cityNames.includes(CITY),
    `${cityNames.length} cities resolved. fetchDigestCities reads every consent row on the platform, and there are now more than a thousand.`,
  )

  // =========================================================================
  // 5, 6. A PERIOD THAT STOPPED SHORT IS RESUMED, AT THE RIGHT PERSON.
  // =========================================================================
  const liveAudience = (dryCity?.recipientEmails ?? []).map(s => s.split(' ')[0])
  check(
    'resume.there-is-a-live-audience-to-resume-into',
    liveAudience.length >= 3,
    `${liveAudience.length} ledger-permitted recipient(s): ${liveAudience.slice(0, 3).join(', ')}...`,
  )

  // The state a truncated run leaves behind: a row whose recipient_count is the
  // resume point and whose completed_at is null. Written directly because
  // reaching it through the real cap would mean sending five hundred emails to
  // prove arithmetic that tests/unit/broadcast/digest-run.test.ts already proves
  // exhaustively. What is driven here is the WIRING: that the route reads this
  // row, refuses to skip it, and starts where it stopped.
  const ALREADY = 2
  const seeded = await db
    .from('digest_sends')
    .insert({
      city_slug: CITY,
      period_start: periodStart,
      period_end: periodEnd,
      event_count: 1,
      recipient_count: ALREADY,
      audience_count: liveAudience.length,
      completed_at: null,
    })
    .select('id')
    .single()
  check('resume.an-unfinished-period-exists', !seeded.error, seeded.error?.message ?? `recipient_count ${ALREADY}, completed_at null`)
  fixture.digestSendId = seeded.data?.id ?? null

  const logMark = serverLogSize()
  const resumed = await runDigest({ city: CITY })
  const resumedCity = cityResult(resumed.body)
  check(
    'resume.an-unfinished-period-is-not-skipped',
    resumedCity?.skipped === undefined,
    `the route answered ${JSON.stringify(resumedCity?.skipped ?? 'a send')}. Before this pass the row's mere EXISTENCE meant "already sent".`,
  )
  check(
    'resume.it-sent-only-what-was-still-owed',
    resumedCity?.sent === liveAudience.length - ALREADY,
    `sent ${resumedCity?.sent}, audience ${resumedCity?.audience}, written ${resumedCity?.written}, remaining ${resumedCity?.remaining}`,
  )
  check(
    'resume.the-period-is-now-closed',
    resumedCity?.complete === true,
    `complete=${resumedCity?.complete}`,
  )

  const skippedAddresses = liveAudience.slice(0, ALREADY)
  const sentAddresses = liveAudience.slice(ALREADY)
  check(
    'resume.the-people-already-written-to-are-not-written-to-twice',
    skippedAddresses.every(a => mailLogCount(a, logMark) === 0),
    `${skippedAddresses.map(a => `${a}=${mailLogCount(a, logMark)}`).join(' ')}`,
  )
  check(
    'resume.it-resumed-at-the-right-person',
    sentAddresses.every(a => mailLogCount(a, logMark) === 1),
    `${sentAddresses.map(a => `${a}=${mailLogCount(a, logMark)}`).join(' ')}`,
  )

  const { data: closedRow } = await db
    .from('digest_sends')
    .select('recipient_count, audience_count, completed_at')
    .eq('id', fixture.digestSendId)
    .maybeSingle()
  check(
    'resume.the-audit-row-says-how-many-it-owed-and-that-it-owes-nobody',
    closedRow?.completed_at !== null && closedRow?.recipient_count === closedRow?.audience_count,
    `recipient_count ${closedRow?.recipient_count}, audience_count ${closedRow?.audience_count}, completed_at ${closedRow?.completed_at}`,
  )

  const secondRun = await runDigest({ city: CITY })
  check(
    'resume.a-finished-period-IS-skipped',
    cityResult(secondRun.body)?.skipped === 'already_sent_this_period',
    JSON.stringify(cityResult(secondRun.body)?.skipped),
  )

  // =========================================================================
  // 7. THE SURFACE, AT THREE VIEWPORTS.
  // =========================================================================
  const browser = await chromium.launch()
  try {
    const viewports = [
      { name: '390', width: 390, height: 844 },
      { name: '768', width: 768, height: 1024 },
      { name: '1440', width: 1440, height: 900 },
    ]
    for (const vp of viewports) {
      // One fresh address per viewport, so each viewport presses a real button
      // on a person who is genuinely in the audience at that moment.
      const email = `${TAG}-vp${vp.name}-${STAMP}@example.test`
      const token = crypto.randomUUID()
      const row = await db.from('city_waitlist_signups').insert({
        city_slug: CITY,
        full_name: `${TAG} viewport ${vp.name}`,
        email,
        role: 'attendee',
        consent_text: `${TAG} fixture waitlist wording covering the weekly digest.`,
        consent_version: COVERING_VERSION,
        source: TAG,
        unsubscribe_token: token,
      })
      fixture.waitlist.push(email)
      check(`vp${vp.name}.fixture-written`, !row.error, row.error?.message ?? email)

      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await page.goto(`${BASE}/unsubscribe/digest/${token}`, { waitUntil: 'domcontentloaded' })
      await answerTheBanner(page)
      await page.waitForLoadState('networkidle').catch(() => {})

      const button = page.getByRole('button', { name: /unsubscribe/i })
      check(`vp${vp.name}.the-unsubscribe-control-is-there`, await button.isVisible(), await button.textContent().catch(() => ''))

      const box = await button.boundingBox()
      check(
        `vp${vp.name}.the-control-is-reachable-on-a-finger`,
        Boolean(box) && box.height >= 44,
        `${Math.round(box?.height ?? 0)}px tall`,
      )

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const serious = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      check(
        `vp${vp.name}.axe-clean`,
        serious.length === 0,
        serious.map(v => `${v.impact} ${v.id} x${v.nodes.length}`).join('; ') || '0 serious or critical',
      )

      await page.screenshot({ path: join(out, `unsubscribe-${vp.name}.png`), fullPage: true })

      /*
       * WAIT FOR WHAT THE PRODUCT SAYS, NEVER FOR THE NETWORK TO GO QUIET.
       *
       * The first two runs of this drive reported the press as recording
       * nothing, at all three viewports, and the product was fine: pressing it
       * by hand answers POST 200, writes the withdrawn row and the suppression
       * event, and renders "You are unsubscribed". `networkidle` after a server
       * action resolves on a page that is ALREADY idle, before the POST has
       * begun, so the assertion ran first and the screenshot caught the page
       * mid-press. The saved screenshot is what gave it away, not the report.
       *
       * So the drive waits for the one thing that cannot be true early: the
       * confirmation the person reads.
       */
      await button.click()
      await page.getByText(/you are unsubscribed/i).waitFor({ state: 'visible', timeout: 15_000 })
      await page.screenshot({ path: join(out, `unsubscribed-${vp.name}.png`), fullPage: true })
      check(
        `vp${vp.name}.the-page-confirms-it-to-the-person`,
        true,
        'the surface renders "You are unsubscribed" rather than leaving them guessing',
      )

      /*
       * WHAT THE PRESS ACTUALLY RECORDS, established by reading the code and
       * the database rather than assumed. The first run of this drive asserted
       * `city_waitlist_signups.unsubscribed_at` and found it null at all three
       * viewports while the person had plainly left the audience.
       *
       * The waitlist row IS LEFT LIVE ON PURPOSE. A digest withdrawal writes
       * two append-only ledger rows (`src/lib/consent/record.ts`,
       * writeWithdrawalToLedger), and a database trigger reflects the consent
       * event into `marketing_consents` as `withdrawn`. Nothing edits the
       * waitlist signup, because the evidence of what somebody joined is not
       * something an unsubscribe is entitled to rewrite.
       *
       * WHICH MEANS THE SUPPRESSION READ IS THE ONLY THING BETWEEN THAT LIVE
       * WAITLIST ROW AND THIS PERSON'S INBOX, and that read was the one failing
       * open. This assertion is therefore stronger than the one it replaced:
       * it names the two facts a withdrawal is, and the check below names the
       * consequence.
       */
      const { data: withdrawnRow } = await db
        .from('marketing_consents')
        .select('status')
        .eq('email', email)
        .maybeSingle()
      const stop = await db
        .from('suppression_events')
        .select('id', { count: 'exact', head: true })
        .eq('subject_email', email)
      check(
        `vp${vp.name}.the-press-recorded-the-withdrawal`,
        withdrawnRow?.status === 'withdrawn' && (stop.count ?? 0) > 0,
        `marketing_consents.status ${withdrawnRow?.status ?? 'no row'}, suppression_events ${stop.count ?? 0}`,
      )
      const { data: stillJoined } = await db
        .from('city_waitlist_signups')
        .select('unsubscribed_at')
        .eq('email', email)
        .maybeSingle()
      check(
        `vp${vp.name}.their-waitlist-row-is-still-live-so-suppression-is-all-that-stops-it`,
        stillJoined?.unsubscribed_at === null,
        'the signup evidence is not rewritten by an unsubscribe, so the audience merge has to suppress them',
      )

      const afterDry = await runDigest({ city: CITY, dry_run: '1' })
      const afterCity = cityResult(afterDry.body)
      const afterAddresses = [
        ...(afterCity?.recipientEmails ?? []).map(s => s.split(' ')[0]),
        ...(afterCity?.refusalReasons ?? []).map(s => s.split(':')[0]),
      ]
      check(
        `vp${vp.name}.they-leave-the-audience`,
        !afterAddresses.includes(email),
        'the next run does not write to them',
      )

      await context.close()
    }
  } finally {
    await browser.close()
  }
}

async function teardown() {
  // Deleted in chunks, because the delete's `.in()` carries the same URL bound
  // the read did. A teardown that fails at 16 KB leaves the rows behind and
  // says nothing, which is the shape LB-TEARDOWN was about.
  const { chunkInFilterValues } = await import('../../src/lib/supabase/in-chunks.ts')
  for (const chunk of chunkInFilterValues(fixture.consents)) {
    await db.from('marketing_consents').delete().in('email', chunk)
  }
  /*
   * AND THE ROWS THIS DRIVE DID NOT WRITE ITSELF. Pressing unsubscribe makes a
   * `marketing_consents` row appear for an address that had only a waitlist
   * row, because a trigger reflects the ledger event into that table. The first
   * run left three of them behind and the teardown check caught it, which is
   * the whole reason that check re-reads instead of trusting the delete.
   */
  await db.from('marketing_consents').delete().like('email', `${TAG}-%`)
  for (const chunk of chunkInFilterValues(fixture.waitlist)) {
    await db.from('city_waitlist_signups').delete().in('email', chunk)
  }
  if (fixture.digestSendId) await db.from('digest_sends').delete().eq('id', fixture.digestSendId)

  // RE-READ rather than trust the delete.
  const left = await db
    .from('marketing_consents')
    .select('email', { count: 'exact', head: true })
    .like('email', `${TAG}-%`)
  const leftWaitlist = await db
    .from('city_waitlist_signups')
    .select('email', { count: 'exact', head: true })
    .like('email', `${TAG}-%`)
  const leftSends = await db
    .from('digest_sends')
    .select('id', { count: 'exact', head: true })
    .eq('city_slug', CITY)
    .eq('period_start', new Date().toISOString().slice(0, 10))
  check(
    'teardown.test-left-as-found',
    left.count === 0 && leftWaitlist.count === 0 && leftSends.count === 0,
    `consents left ${left.count}, waitlist left ${leftWaitlist.count}, digest_sends for today left ${leftSends.count}`,
  )

  const ledgerLeft = await db
    .from('consent_events')
    .select('id', { count: 'exact', head: true })
    .like('subject_email', `${TAG}-%`)
  note(
    `consent_events left ${ledgerLeft.count ?? 0} and suppression rows are append-only by design (GA1 v3 acceptance 13), so they are reported rather than deleted`,
  )
}

let fatal = null
try {
  await main()
} catch (error) {
  fatal = error instanceof Error ? (error.stack ?? error.message) : String(error)
  check('drive.completed', false, fatal.split('\n')[0])
} finally {
  try {
    await teardown()
  } catch (error) {
    check('teardown.ran', false, error instanceof Error ? error.message : String(error))
  }
}

const report = {
  item: 'LB-DIGESTWHOLE',
  at: new Date().toISOString(),
  base: BASE,
  database: url,
  city: CITY,
  consentRowsWritten: CONSENT_ROWS,
  waitlistRowsWritten: WAITLIST_ROWS,
  passed: checks.filter(c => c.ok).length,
  failed,
  total: checks.length,
  notes,
  checks,
  fatal,
}
writeFileSync(join(out, 'lb-digestwhole-drive-report.json'), JSON.stringify(report, null, 2))
console.log(`\n${report.passed} of ${report.total} checks passed, ${failed} failed. Report: ${join(out, 'lb-digestwhole-drive-report.json')}`)
process.exit(failed > 0 || fatal ? 1 : 0)
