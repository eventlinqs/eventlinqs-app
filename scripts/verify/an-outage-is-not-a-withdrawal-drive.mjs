/**
 * LB-OUTAGEWITHDRAW. A DROPPED SOCKET WITHDREW A LIVE CONSENT, AND A DROPPED
 * SOCKET FILED A PERSON AS HAVING CHOSEN NOWHERE.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, AND WHY EACH HALF IS WHERE IT IS.
 *
 * FOUR DEFECTS, ONE ROOT. A read that FAILED was used as a FACT ABOUT A PERSON,
 * and the fact was then written into a ledger that is append only and is never
 * rewritten. What made this family worse than the usual blink is that the
 * ledger cannot be corrected afterwards: the platform's own rule is that a
 * consent row is evidence and is never altered or removed.
 *
 *   1. THE UNTOUCHED CHECKBOX THAT WITHDREW A CONSENT.
 *      `src/lib/consent/checkout-answer.ts` asks the resolver whether an address
 *      already holds a live consent, so that a returning buyer who leaves the
 *      marketing box alone is not recorded as having declined. The resolver
 *      fails CLOSED, which is right for "may this message go out" and is not an
 *      answer to "does this person hold a consent". Both refusals were the same
 *      `permitted: false`, so a blinked consent read sent an untouched checkbox
 *      down the decline branch, and the ledger's latest-event rule turned it
 *      into a withdrawal the person never made.
 *
 *   2. THE SAME, in `recordPlatformDigestDecline`, the second of the two places
 *      that turn a send verdict into a written fact about somebody.
 *
 *   3. THE COOKIE CITY. `src/lib/consent/digest-city.ts` validated the buyer's
 *      chosen city against `public.cities` with the error discarded and no
 *      retry, so one dropped packet filed somebody who chose Geelong as having
 *      chosen nowhere. The digest is city scoped (`fetchDigestCities` selects
 *      `.not('city_slug', 'is', null)`), so that consent is on no send list at
 *      all, for ever, on a row that still reads "granted".
 *
 *   4. THE EVENT CITY, the same file, the same shape, with the event's own city
 *      as the fallback the buyer never chose but demonstrably belongs to.
 *
 * THE MEASURED BEFORE AND AFTER is in this item's evidence directory:
 * red-reading.txt was taken against the unfixed tree and green-reading.txt
 * against the fixed one, on the same addresses, with the same interceptions.
 *
 * TWO HALVES, AND THE SEAM IS STATED RATHER THAN GLOSSED.
 *
 *   THE BLINK, in THIS process, against the real TEST project, calling the real
 *   functions with `globalThis.fetch` wrapped so one table's read fails exactly
 *   as a dropped keep-alive socket fails. Every interception is COUNTED and
 *   asserted, because a wrapper that never fired reads as a pass over nothing.
 *   The count is itself evidence: the resolver's reads intercept FOUR times, one
 *   call and three retries through `readOrThrow`, and the city reads used to
 *   intercept ONCE, because they had no retry at all.
 *
 *   THE SURFACE, in a real browser at 390, 768 and 1440: the person whose
 *   consent survived the blinked checkout opens their own preferences page, the
 *   page this platform gives them to see and change their marketing state, and
 *   reads that EventLinqs can still send to them. That page prints the
 *   resolver's own verdict verbatim, so it is the same decision rather than a
 *   description of one.
 *
 *   The blink is not driven THROUGH the browser because it has to be injected
 *   inside the process that reads the database, and the server on port 3100 was
 *   started by an earlier session of this lane, which this lane's brief says not
 *   to restart. So it is injected where it can be injected honestly and counted.
 *
 * BLAST RADIUS. Two other lanes build against this same TEST project. Every row
 * carries `lane-b-outagewithdraw` in its address, none is an event, an
 * organiser or anything a discovery surface reads, and the teardown runs in a
 * finally and VERIFIES rather than trusting its own delete.
 *
 * THE LEDGER REFUSES DELETE BY DESIGN, so this drive adds exactly ONE row per
 * run, and on purpose: check 6 proves the fix did not simply switch the decline
 * branch off, which can only be proved by writing a real one. It uses a fresh
 * address each run for that single row. Every OTHER subject is stable and the
 * teardown asserts their ledger did not grow, which is the only way to notice
 * a fix that has quietly stopped holding.
 *
 * RUN IT, and every flag on this line is load-bearing:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/next-headers-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/an-outage-is-not-a-withdrawal-drive.mjs
 *
 *   env -u ...          this shell carries the PRODUCTION Supabase URL, so
 *                       without it the drive reads and writes the live database.
 *                       The refusal at the top is the backstop, not the plan.
 *   server-only-shim    these are `server-only` modules and fail at IMPORT
 *                       without it, which reads as a product defect.
 *   next-headers-shim   `checkout-answer` reaches `next/headers` two modules
 *                       down and cannot even be LOADED outside Next without it.
 *   src-alias-loader    they import through `@/`, which node does not resolve.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { recordCheckoutMarketingAnswer } from '@/lib/consent/checkout-answer'
import { recordPlatformDigestDecline } from '@/lib/consent/record'
import { resolveDigestCityFor } from '@/lib/consent/digest-city'
import { resolveSend } from '@/lib/consent/resolver'
import { FACILITATED_MARKETING_PURPOSE, LOCAL_DIGEST_PURPOSE } from '@/lib/consent/purposes'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-OUTAGEWITHDRAW'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, 'drive.log')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const TAG = 'lane-b-outagewithdraw'
const RUN = randomUUID().slice(0, 8)
const FACILITATED_WORDING =
  'EventLinqs will send you marketing about events run by other organisers who sell tickets on EventLinqs.'
const DIGEST_WORDING = 'A weekly email about events near you.'

/** Stable subjects. Their ledgers must not grow, and the teardown checks it. */
const LIVE_FACILITATED = `${TAG}-live-facilitated@example.com`
const LIVE_DIGEST = `${TAG}-live-digest@example.com`
/** One row per run, and check 6 is the reason. */
const FRESH_DECLINE = `${TAG}-${RUN}-genuine-decline@example.com`

const results = []
function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' - ' + detail : ''))
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/vkapkibzokmfaxqogypq/.test(url ?? '')) {
  throw new Error('refusing to run: this is not the TEST project, it is ' + url)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * One table's reads fail exactly as a dropped keep-alive socket fails, and the
 * interceptions are counted.
 *
 * ONLY THE READS. A GET to `/rest/v1/<table>?` is a select; the INSERT that
 * writes a consent event is a POST to the same path. Blinking both would prove
 * nothing, because a decline that was never written cannot tell "the fix held"
 * from "the write was blocked too".
 */
function blinkReadsOf(table) {
  const real = globalThis.fetch
  let injected = 0
  globalThis.fetch = async function blink(input, init) {
    const href = typeof input === 'string' ? input : (input?.url ?? String(input))
    const method = (init?.method ?? input?.method ?? 'GET').toUpperCase()
    if (method === 'GET' && href.includes(`/rest/v1/${table}?`)) {
      injected += 1
      const cause = new Error('other side closed')
      cause.code = 'UND_ERR_SOCKET'
      cause.name = 'SocketError'
      throw new TypeError('fetch failed', { cause })
    }
    return real.call(globalThis, input, init)
  }
  return () => {
    globalThis.fetch = real
    return injected
  }
}

async function tenantId() {
  const res = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').maybeSingle()
  if (res.error) throw new Error('tenant read failed: ' + res.error.message)
  if (!res.data?.id) throw new Error('the platform tenant does not exist on TEST')
  return res.data.id
}

async function ledgerOf(email) {
  const res = await db
    .from('consent_events')
    .select('decision, occurred_at')
    .eq('subject_email', email)
    .order('occurred_at', { ascending: true })
  if (res.error) throw new Error('ledger read failed: ' + res.error.message)
  return res.data.map((r) => r.decision)
}

/**
 * THE LEDGER ROWS CANNOT BE TAKEN BACK, SO THE SEED IS IDEMPOTENT. The database
 * refuses DELETE on `consent_events` in its own words, "a consent record is
 * evidence of what a person was shown and agreed to", which is GA1's law working
 * exactly as designed. So the two stable subjects are written ONCE and reused.
 * `marketing_consents` is current state rather than evidence and IS deletable,
 * so the preferences token is re-minted every run.
 */
async function seed(tenant) {
  const tokens = {}
  for (const [email, purpose, wording] of [
    [LIVE_FACILITATED, FACILITATED_MARKETING_PURPOSE, FACILITATED_WORDING],
    [LIVE_DIGEST, LOCAL_DIGEST_PURPOSE, DIGEST_WORDING],
  ]) {
    const token = randomUUID()
    tokens[email] = token
    const cleared = await db.from('marketing_consents').delete().eq('email', email)
    if (cleared.error) throw new Error('seed could not clear the token row: ' + cleared.error.message)
    const stateRow = await db.from('marketing_consents').insert({
      email,
      unsubscribe_token: token,
      status: 'granted',
      source: TAG,
      consent_text: wording,
      consent_version: 'v1',
      granted_at: '2026-09-14T00:00:00.000Z',
    })
    if (stateRow.error) throw new Error('seed marketing_consents failed: ' + stateRow.error.message)

    if ((await ledgerOf(email)).length === 0) {
      const written = await db.from('consent_events').insert({
        tenant_id: tenant,
        subject_email: email,
        purpose,
        channel_scope: purpose === LOCAL_DIGEST_PURPOSE ? 'email' : 'both',
        decision: 'granted',
        occurred_at: '2026-09-14T00:00:00.000Z',
        wording,
        wording_version: 'v1',
        capture_surface: TAG,
        suppression_scope: 'every EventLinqs facilitated message on every channel',
        third_party_scope: 'events ticketed on EventLinqs, marketed by EventLinqs as the sender',
      })
      if (written.error) throw new Error('seed consent_events failed: ' + written.error.message)
    }
  }
  /*
   * THE TOKEN IS READ BACK rather than assumed. The standing rule on this
   * project is never to guess a slug, a route or an id, and a token this script
   * minted is still a guess until the database says it stored it.
   */
  const back = await db
    .from('marketing_consents')
    .select('email, unsubscribe_token')
    .in('email', [LIVE_FACILITATED, LIVE_DIGEST])
  if (back.error) throw new Error('token read-back failed: ' + back.error.message)
  for (const row of back.data) {
    if (tokens[row.email] !== row.unsubscribe_token) {
      throw new Error(`the database stored a different token for ${row.email} than this script minted`)
    }
  }
  return tokens
}

/** An event that really has a primary city, enumerated rather than guessed. */
async function anEventWithACity() {
  const res = await db
    .from('events')
    .select('id, slug, city_primary')
    .not('city_primary', 'is', null)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
  if (res.error) throw new Error('event enumeration failed: ' + res.error.message)
  if (!res.data?.[0]) throw new Error('TEST holds no published event with a primary city')
  return res.data[0]
}

/** A city slug that really is in public.cities, enumerated rather than guessed. */
async function aSeededCity() {
  const res = await db.from('cities').select('slug').order('slug').limit(1)
  if (res.error) throw new Error('city enumeration failed: ' + res.error.message)
  if (!res.data?.[0]) throw new Error('TEST holds no cities')
  return res.data[0].slug
}

async function main() {
  writeFileSync(LOG, '')
  log(`LB-OUTAGEWITHDRAW drive, ${new Date().toISOString()}, run ${RUN}, base ${BASE}`)
  log(`  TEST project vkapkibzokmfaxqogypq`)

  const tenant = await tenantId()
  const event = await anEventWithACity()
  const city = await aSeededCity()
  log(`  event ${event.id} (${event.slug}) is in ${event.city_primary}; ${city} is a seeded city`)

  let browser = null
  let tokens = null
  try {
    tokens = await seed(tenant)

    // ------------------------------------------------- 1. the untouched checkbox
    log('THE UNTOUCHED CHECKBOX, with the consent ledger failing on cue.')
    const beforeA = await ledgerOf(LIVE_FACILITATED)
    const liveBefore = await resolveSend(db, {
      email: LIVE_FACILITATED,
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: 'email',
    })
    check(
      'the subject holds a live facilitated consent before anything is driven',
      liveBefore.permitted && liveBefore.ledgerWasRead,
      liveBefore.reason,
    )

    let stop = blinkReadsOf('consent_events')
    const answered = await recordCheckoutMarketingAnswer(db, {
      email: LIVE_FACILITATED,
      ticked: false,
      captureSurface: 'checkout',
      eventId: event.id,
    })
    const injectedA = stop()
    check(
      'the blink actually fired on the consent read, one call and three retries',
      injectedA >= 4,
      `${injectedA} request(s) failed on cue`,
    )
    check(
      'an untouched box over an unreadable ledger records NOTHING',
      answered.recorded === 'none',
      `recorded=${answered.recorded} reason="${answered.reason}"`,
    )
    check(
      'and it says the outage was the reason, not the person',
      /could not be read/.test(answered.reason) && /not a withdrawal/.test(answered.reason),
      `"${answered.reason}"`,
    )
    const afterA = await ledgerOf(LIVE_FACILITATED)
    check(
      'no event was appended to an append-only ledger',
      afterA.length === beforeA.length,
      `${beforeA.length} before, ${afterA.length} after: ${JSON.stringify(afterA)}`,
    )
    const liveAfter = await resolveSend(db, {
      email: LIVE_FACILITATED,
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: 'email',
    })
    check(
      'the consent is still live after the outage',
      liveAfter.permitted,
      liveAfter.reason,
    )

    // ------------------------------------------- 2. the second decline call site
    log('recordPlatformDigestDecline, the second place a verdict became a written fact.')
    const beforeB = await ledgerOf(LIVE_DIGEST)
    stop = blinkReadsOf('consent_events')
    const declined = await recordPlatformDigestDecline(db, {
      email: LIVE_DIGEST,
      at: new Date().toISOString(),
      source: 'account',
    })
    const injectedB = stop()
    check('the blink fired on the digest ledger read', injectedB >= 4, `${injectedB} request(s) failed on cue`)
    check('nothing was recorded', declined === false, `returned ${declined}`)
    const afterB = await ledgerOf(LIVE_DIGEST)
    check(
      "the live local-digest consent's ledger did not grow",
      afterB.length === beforeB.length,
      `${beforeB.length} before, ${afterB.length} after: ${JSON.stringify(afterB)}`,
    )
    const digestAfter = await resolveSend(db, {
      email: LIVE_DIGEST,
      purpose: LOCAL_DIGEST_PURPOSE,
      channel: 'email',
    })
    check('the local-digest consent is still live', digestAfter.permitted, digestAfter.reason)

    // ------------------------------- 3. the rule the fix must not have switched off
    log('THE BRANCH IS NOT SWITCHED OFF: a genuine decline, with nothing blinking.')
    const genuine = await recordCheckoutMarketingAnswer(db, {
      email: FRESH_DECLINE,
      ticked: false,
      captureSurface: 'checkout',
      eventId: event.id,
    })
    check(
      'an address with no live consent is still recorded as having declined',
      genuine.recorded === 'declined',
      `recorded=${genuine.recorded} reason="${genuine.reason}"`,
    )
    check(
      'and the row is really in the ledger',
      (await ledgerOf(FRESH_DECLINE)).join(',') === 'declined',
      JSON.stringify(await ledgerOf(FRESH_DECLINE)),
    )
    const stillLive = await recordCheckoutMarketingAnswer(db, {
      email: LIVE_FACILITATED,
      ticked: false,
      captureSurface: 'checkout',
      eventId: event.id,
    })
    check(
      'and a live consent is still protected from an untouched box when nothing is blinking',
      stillLive.recorded === 'none' && /already has a live consent/.test(stillLive.reason),
      `"${stillLive.reason}"`,
    )

    // ---------------------------------------------------------- 4. the two cities
    log('THE CITY, with each of its two reads failing on cue.')
    const plain = await resolveDigestCityFor(db, { eventId: event.id, cookieCity: city })
    check(
      'with nothing blinking, the city the buyer chose wins',
      plain.city === city && plain.unresolved === false,
      JSON.stringify(plain),
    )

    stop = blinkReadsOf('cities')
    const cookieBlinked = await resolveDigestCityFor(db, { eventId: event.id, cookieCity: city })
    const injectedC = stop()
    check('the blink fired on the cities read', injectedC >= 1, `${injectedC} request(s) failed on cue`)
    check(
      'a buyer who chose a city is NOT filed as having chosen nowhere',
      cookieBlinked.city === city && cookieBlinked.unresolved === false,
      `${JSON.stringify(cookieBlinked)} - the taxonomy in code answered what the table could not`,
    )

    stop = blinkReadsOf('events')
    const eventBlinked = await resolveDigestCityFor(db, { eventId: event.id, cookieCity: null })
    const injectedD = stop()
    check('the blink fired on the events read', injectedD >= 1, `${injectedD} request(s) failed on cue`)
    check(
      'an unreadable event city is reported as UNRESOLVED, never as "no city"',
      eventBlinked.city === null && eventBlinked.unresolved === true,
      JSON.stringify(eventBlinked),
    )

    const fromEvent = await resolveDigestCityFor(db, { eventId: event.id, cookieCity: null })
    check(
      "with nothing blinking, the event's own city answers",
      fromEvent.city === event.city_primary && fromEvent.unresolved === false,
      JSON.stringify(fromEvent),
    )
    const nothingKnown = await resolveDigestCityFor(db, { eventId: null, cookieCity: null })
    check(
      'and a genuine absence is still an honest null rather than an outage',
      nothingKnown.city === null && nothingKnown.unresolved === false,
      JSON.stringify(nothingKnown),
    )
    const notACity = await resolveDigestCityFor(db, { eventId: event.id, cookieCity: 'not-a-city' })
    check(
      'a cookie that is not a city falls through to the event, as it always did',
      notACity.city === event.city_primary && notACity.unresolved === false,
      JSON.stringify(notACity),
    )

    // ------------------------------------------------------------ 5. the surface
    log('THE SURFACE. The person whose consent survived reads their own state.')
    browser = await chromium.launch()
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()
      const target = `${BASE}/marketing/preferences/${tokens[LIVE_FACILITATED]}`
      const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 180000 })
      const status = response?.status() ?? 0
      const state = await page.getByTestId('marketing-state').first().textContent({ timeout: 60000 })
      const shot = join(SHOTS, `consent-survived-${viewport.name}.png`)
      await page.screenshot({ path: shot, fullPage: false })
      check(
        `${viewport.name}: the preferences page answers 200`,
        status === 200,
        `HTTP ${status}`,
      )
      check(
        `${viewport.name}: it tells them EventLinqs can still send to them`,
        /can send you marketing/i.test(state ?? ''),
        `"${(state ?? '').trim()}"`,
      )
      await context.close()
    }
  } finally {
    if (browser) await browser.close()
    /*
     * TEARDOWN, AND IT VERIFIES RATHER THAN TRUSTING ITS OWN DELETE. The ledger
     * refuses DELETE by design, so the two stable subjects keep their single
     * granted row and the check is that they did not GROW: one row each, still,
     * after everything above. `marketing_consents` is deletable and goes.
     */
    for (const email of [LIVE_FACILITATED, LIVE_DIGEST]) {
      const rows = await ledgerOf(email)
      check(
        `teardown: ${email.split('@')[0]} still holds exactly its one seeded grant`,
        rows.length === 1 && rows[0] === 'granted',
        JSON.stringify(rows),
      )
      const gone = await db.from('marketing_consents').delete().eq('email', email)
      check(`teardown: its marketing_consents row is removed`, !gone.error, gone.error?.message ?? 'deleted')
      const confirm = await db.from('marketing_consents').select('email').eq('email', email)
      check(
        `teardown: and the database confirms it is gone`,
        !confirm.error && (confirm.data ?? []).length === 0,
        `${(confirm.data ?? []).length} row(s) remain`,
      )
    }
  }

  const failed = results.filter((r) => !r.ok)
  writeFileSync(
    join(EVIDENCE, 'drive-report.json'),
    JSON.stringify({ run: RUN, at: new Date().toISOString(), base: BASE, results }, null, 2),
  )
  log('')
  log(`${results.length - failed.length} of ${results.length} checks passed`)
  if (failed.length > 0) {
    for (const f of failed) log(`  FAILED: ${f.name} - ${f.detail}`)
    process.exit(1)
  }
}

main().catch((error) => {
  log('DRIVE FAILED: ' + (error?.stack ?? error))
  process.exit(1)
})
