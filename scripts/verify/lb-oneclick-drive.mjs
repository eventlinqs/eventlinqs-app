/**
 * LB-ONECLICK DRIVEN PROOF. The RFC 8058 one-click unsubscribe pair, proved on
 * a running server against TEST, at 390, 768 and 1440.
 *
 * WHAT IT PROVES, and why each step is driven rather than asserted in a unit
 * test. The unit tests pin the composition and the handler in isolation; none
 * of them can tell you that a message this platform actually sends carries the
 * headers, or that a mailbox provider's POST reaches a route that withdraws a
 * real person's consent in a real ledger.
 *
 *   1. A REAL SEND CARRIES THE PAIR. The weekly city digest is driven through
 *      its own cron route with test_to, which walks the whole path: the route,
 *      the audience merge, the consent resolver, the template, sendEmail, and
 *      the transport. The two headers are then read back out of the SERVER'S
 *      OWN STDOUT, where the console transport prints them, so what is asserted
 *      is what the transport was handed rather than what this script believes.
 *
 *   2. GET CHANGES NOTHING. The header URI is fetched as a mail scanner would,
 *      and the ledger is counted before and after. This is the clause that
 *      keeps a security appliance from unsubscribing the person whose inbox it
 *      is scanning.
 *
 *   3. POST WITHDRAWS, FOR REAL. The exact request a conforming receiver sends
 *      (RFC 8058: the key/value pair from List-Unsubscribe-Post as the body,
 *      form-encoded) is posted at the address the header named, and the
 *      withdrawal is then read out of the append-only ledger by capture
 *      surface.
 *
 *   4. IT IS IDEMPOTENT. A second POST answers 200 and writes no second
 *      withdrawal, which is what a provider retry and three copies of one
 *      message both produce.
 *
 *   5. THE DOOR IS SHUT AFTERWARDS. The digest route is dry-run again and must
 *      no longer list this address among the people it would write to. A 200
 *      from an endpoint means nothing if the next digest still reaches them.
 *
 *   6. THE PERSON CAN SEE IT, at all three widths, on the page the GET
 *      redirects to.
 *
 * EVERY ROW IT CREATES CARRIES lane-b. The consent and suppression ledgers
 * refuse DELETE by design (GA1 v3), so this drive leaves its ledger rows behind
 * and SAYS how many rather than pretending it cleaned up.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     --import ./scripts/lib/src-alias-loader.mjs \
 *     scripts/verify/lb-oneclick-drive.mjs --out C:/dev/EVIDENCE/LB-ONECLICK
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import {
  LIST_UNSUBSCRIBE_HEADER,
  LIST_UNSUBSCRIBE_POST_HEADER,
  LIST_UNSUBSCRIBE_POST_VALUE,
  ONE_CLICK_UNSUBSCRIBE_ROUTE,
} from '../../src/lib/consent/one-click.ts'
import { getSiteUrl } from '../../src/lib/site-url.ts'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'

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
const LANE = `lane-b-oneclick-${STAMP}`
const EMAIL = `${LANE}@example.com`

/*
 * The server's own stdout. scripts/dev/lane-b-serve-with-stripe.mjs runs the
 * dev server with EMAIL_TRANSPORT=console and writes its output here, so the
 * headers the transport was handed are readable rather than inferred.
 */
const SERVER_LOG = resolve(process.cwd(), '.tmp-lane-b-serve.log')

function serverLogSince(offset) {
  if (!existsSync(SERVER_LOG)) return ''
  return readFileSync(SERVER_LOG, 'utf8').slice(offset)
}
function serverLogLength() {
  return existsSync(SERVER_LOG) ? readFileSync(SERVER_LOG, 'utf8').length : 0
}

/** Withdrawal events for this address, by capture surface. Counted, never assumed. */
async function withdrawals(email) {
  const { data, error } = await db
    .from('consent_events')
    .select('id, decision, capture_surface, occurred_at')
    .eq('subject_email', email)
    .order('occurred_at', { ascending: true })
  if (error) throw new Error(`could not read consent_events: ${error.message}`)
  return (data ?? []).filter((r) => r.decision === 'withdrawn')
}

let exitCode = 0
let browser = null

try {
  // ------------------------------------------------------------------ setup
  const cityArg = args.includes('--city') ? args[args.indexOf('--city') + 1] : 'geelong'

  /*
   * SEEDED THROUGH THE PRODUCT, not by importing the recorder.
   *
   * src/lib/consent/record.ts and resolver.ts both open with `import
   * 'server-only'`, which does not resolve outside Next, so a drive cannot call
   * them. That is a better constraint than an inconvenience: the consent this
   * drive withdraws is now consent a real person could have given, captured by
   * the real endpoint, under the real stored wording.
   */
  const seedRes = await fetch(`${BASE}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, source: 'city', city: cityArg }),
  })
  const seedBody = await seedRes.json().catch(() => ({}))
  check(
    'oneclick.setup.a-consent-row-exists-for-this-lane-b-address',
    seedRes.status === 200 && seedBody.ok === true,
    `HTTP ${seedRes.status} ${JSON.stringify(seedBody).slice(0, 160)} for ${EMAIL} in ${cityArg}`,
  )

  const { data: consentRow } = await db
    .from('marketing_consents')
    .select('email, status, unsubscribe_token, city_slug')
    .eq('email', EMAIL)
    .maybeSingle()
  const TOKEN = consentRow?.unsubscribe_token ?? null
  check(
    'oneclick.setup.the-row-carries-an-unsubscribe-token',
    Boolean(TOKEN) && consentRow?.status === 'granted',
    `token ${TOKEN ? `${String(TOKEN).slice(0, 8)}...` : 'MISSING'}, status ${consentRow?.status}`,
  )
  if (!TOKEN) throw new Error('no unsubscribe token was minted, so nothing below can be driven')

  const cronSecret = process.env.CRON_SECRET ?? ''
  check('oneclick.send.a-cron-secret-is-present-so-the-route-can-be-driven', cronSecret.length > 0, cronSecret ? 'present' : 'MISSING')

  /*
   * THE DOOR, ASKED THROUGH THE SEND PATH ITSELF rather than by calling the
   * resolver directly. dry_run=1 runs the whole route (audience merge, then
   * filterPermittedRecipients) and reports who would actually be written to.
   * "The resolver returns false" and "the next digest does not reach them" are
   * different claims, and only the second one is the promise.
   */
  async function digestWouldReach(email) {
    const res = await fetch(
      `${BASE}/api/cron/weekly-digest?city=${encodeURIComponent(cityArg)}&dry_run=1`,
      { headers: { authorization: `Bearer ${cronSecret}` } },
    )
    const body = await res.json().catch(() => ({}))
    const city = (body.cities ?? []).find((r) => r.city === cityArg) ?? {}
    const list = city.recipientEmails ?? []
    return { reached: list.some((e) => String(e).startsWith(email)), refusedByLedger: city.refusedByLedger ?? 0, city }
  }

  const before = await digestWouldReach(EMAIL)
  check(
    'oneclick.setup.the-next-digest-would-reach-this-address-before-anything-is-pressed',
    before.reached === true,
    `dry run reached=${before.reached}, refusedByLedger=${before.refusedByLedger}`,
  )

  // ---------------------------------------------------- 1. a real send carries it
  const logAt = serverLogLength()
  const digestUrl = `${BASE}/api/cron/weekly-digest?city=${encodeURIComponent(cityArg)}&test_to=${encodeURIComponent(EMAIL)}`
  const digestRes = await fetch(digestUrl, { headers: { authorization: `Bearer ${cronSecret}` } })
  const digestBody = await digestRes.json().catch(() => ({}))
  writeFileSync(join(out, 'digest-response.json'), JSON.stringify(digestBody, null, 2))
  check(
    'oneclick.send.the-weekly-digest-route-sent-the-rehearsal-message',
    digestRes.status === 200 && JSON.stringify(digestBody).includes(EMAIL),
    `HTTP ${digestRes.status}, ${JSON.stringify(digestBody).slice(0, 200)}`,
  )

  // Give the server a moment to flush its stdout, then read what it printed.
  await new Promise((r) => setTimeout(r, 1500))
  const tail = serverLogSince(logAt)
  writeFileSync(join(out, 'server-log-during-send.txt'), tail)

  /*
   * THE ORIGIN IS THE CANONICAL SITE URL, NOT THE HOST THAT WAS DRIVEN, and the
   * first run of this drive asserted the wrong one. A cron-sent message must
   * carry the address the public can reach: a person opening a digest cannot
   * follow a link to the machine that happened to send it. So the expectation is
   * built from the SAME resolver the route uses (src/lib/site-url.ts), which is
   * also what makes the HTTPS assertion below meaningful rather than circular:
   * a locally driven send still composes the production https URI, which is what
   * RFC 8058 requires and what this platform will actually mail.
   */
  const sendOrigin = getSiteUrl()
  const expectedUri = `<${sendOrigin.replace(/\/+$/, '')}${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${TOKEN}>`
  const sawListUnsubscribe = tail.includes(`header  ${LIST_UNSUBSCRIBE_HEADER}: ${expectedUri}`)
  const sawPost = tail.includes(`header  ${LIST_UNSUBSCRIBE_POST_HEADER}: ${LIST_UNSUBSCRIBE_POST_VALUE}`)

  check(
    'oneclick.send.the-message-carried-List-Unsubscribe-naming-this-persons-token',
    sawListUnsubscribe,
    sawListUnsubscribe ? expectedUri : `not found in the server log; searched for ${expectedUri}`,
  )
  check(
    'oneclick.send.the-message-carried-the-exact-RFC-8058-post-value',
    sawPost,
    sawPost ? LIST_UNSUBSCRIBE_POST_VALUE : 'not found in the server log',
  )
  check(
    'oneclick.send.the-advertised-address-is-https-as-RFC-8058-requires',
    expectedUri.startsWith('<https://'),
    `the send composed ${expectedUri}`,
  )

  // ------------------------------------------------- 2. GET changes nothing
  const oneClickUrl = `${BASE.replace(/\/+$/, '')}${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${TOKEN}`
  const beforeGet = await withdrawals(EMAIL)
  const getRes = await fetch(oneClickUrl, { method: 'GET', redirect: 'manual' })
  const afterGet = await withdrawals(EMAIL)

  check(
    'oneclick.get.answers-a-303-to-the-page-a-person-can-read',
    getRes.status === 303 && (getRes.headers.get('location') ?? '').endsWith(`/marketing/preferences/${TOKEN}`),
    `HTTP ${getRes.status} -> ${getRes.headers.get('location')}`,
  )
  check(
    'oneclick.get.withdrew-nothing-so-a-mail-scanner-cannot-unsubscribe-the-inbox-owner',
    afterGet.length === beforeGet.length,
    `withdrawals ${beforeGet.length} before, ${afterGet.length} after`,
  )
  const stillReached = await digestWouldReach(EMAIL)
  check(
    'oneclick.get.the-next-digest-would-still-reach-them-after-a-scanner-followed-the-link',
    stillReached.reached === true,
    `dry run reached=${stillReached.reached}`,
  )

  // --------------------------------------------- 3. POST withdraws, for real
  const postRes = await fetch(oneClickUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  })
  const postBody = await postRes.json().catch(() => ({}))
  check(
    'oneclick.post.answers-200-to-the-mailbox-provider',
    postRes.status === 200 && postBody.ok === true,
    `HTTP ${postRes.status} ${JSON.stringify(postBody)}`,
  )
  check(
    'oneclick.post.reports-that-it-unsubscribed',
    postBody.outcome === 'unsubscribed',
    `outcome ${postBody.outcome}`,
  )

  const afterPost = await withdrawals(EMAIL)
  const oneClickRows = afterPost.filter((r) => r.capture_surface === 'one-click-unsubscribe')
  check(
    'oneclick.post.wrote-exactly-one-withdrawal-to-the-append-only-ledger',
    afterPost.length === beforeGet.length + 1,
    `withdrawals ${beforeGet.length} before, ${afterPost.length} after`,
  )
  check(
    'oneclick.post.the-ledger-row-records-the-one-click-surface',
    oneClickRows.length === 1,
    `${oneClickRows.length} row(s) with capture_surface one-click-unsubscribe`,
  )

  // ------------------------------------------------------- 4. idempotence
  const postAgain = await fetch(oneClickUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  })
  const againBody = await postAgain.json().catch(() => ({}))
  const afterSecond = await withdrawals(EMAIL)
  check(
    'oneclick.idempotent.a-second-press-answers-200-and-says-it-was-already-done',
    postAgain.status === 200 && againBody.outcome === 'already-unsubscribed',
    `HTTP ${postAgain.status} ${JSON.stringify(againBody)}`,
  )
  check(
    'oneclick.idempotent.no-second-withdrawal-was-written',
    afterSecond.length === afterPost.length,
    `withdrawals ${afterPost.length} then ${afterSecond.length}`,
  )

  // --------------------------------------------------- 5. the door is shut
  const afterOneClick = await digestWouldReach(EMAIL)
  check(
    'oneclick.door.the-next-digest-no-longer-reaches-this-address',
    afterOneClick.reached === false,
    `dry run reached=${afterOneClick.reached}, refusedByLedger=${afterOneClick.refusedByLedger}`,
  )
  const { data: afterRow } = await db
    .from('marketing_consents')
    .select('status')
    .eq('email', EMAIL)
    .maybeSingle()
  check(
    'oneclick.door.the-current-state-row-is-withdrawn-so-the-audience-merge-drops-them',
    afterRow?.status === 'withdrawn',
    `marketing_consents.status is ${afterRow?.status}`,
  )

  /*
   * THE SECOND DOOR, PROVED INDEPENDENTLY, and this is the check the first run
   * of this drive got wrong.
   *
   * That run asserted refusedByLedger would rise, and it did not, because the
   * withdrawn person is dropped one layer EARLIER: mergeDigestAudience skips a
   * consent row whose status is not granted, so they never become a candidate
   * and the resolver is never asked about them. The assertion named the wrong
   * layer; the product was right.
   *
   * So the resolver is put to the question on its own terms. The CURRENT-STATE
   * row is set back to granted while the append-only ledger keeps its
   * withdrawal, which is exactly the state GA1 v3's ledger exists to survive: a
   * current-state row that has drifted, or been restored, or been imported from
   * somewhere that never heard about the withdrawal. The person is now a
   * candidate again, so the resolver must be the thing that refuses them, and
   * refusedByLedger must rise.
   */
  await db.from('marketing_consents').update({ status: 'granted' }).eq('email', EMAIL)
  const staleState = await digestWouldReach(EMAIL)
  check(
    'oneclick.door.the-ledger-refuses-even-when-the-current-state-row-says-granted-again',
    staleState.reached === false,
    `dry run reached=${staleState.reached} with a granted row over a ledger withdrawal`,
  )
  check(
    'oneclick.door.the-send-path-counts-that-refusal-rather-than-swallowing-it',
    staleState.refusedByLedger > before.refusedByLedger,
    `refusedByLedger ${before.refusedByLedger} before, ${staleState.refusedByLedger} with the stale granted row`,
  )

  // A token that matches nothing must answer 200 as well, so a provider never
  // reads this facility as broken and no caller can use it as an oracle.
  const strangerRes = await fetch(
    `${BASE.replace(/\/+$/, '')}${ONE_CLICK_UNSUBSCRIBE_ROUTE}/00000000-0000-4000-8000-000000000000`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' },
  )
  const strangerBody = await strangerRes.json().catch(() => ({}))
  check(
    'oneclick.unknown-token.answers-200-rather-than-telling-a-caller-which-tokens-exist',
    strangerRes.status === 200 && strangerBody.outcome === 'no-matching-subscription',
    `HTTP ${strangerRes.status} ${JSON.stringify(strangerBody)}`,
  )

  // ------------------------------------ 6. the person can see it, three widths
  browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()
    await page.goto(`${BASE}/marketing/preferences/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    await answerTheBanner(page, { answer: 'decline' })
    await page.waitForLoadState('networkidle').catch(() => {})

    const body = (await page.locator('body').innerText()).toLowerCase()
    check(
      `oneclick.page.${vp.label}.tells-the-person-their-marketing-is-stopped`,
      /unsubscrib|withdrew|withdrawn|stopped|no longer/.test(body),
      body.length > 0 ? `${body.replace(/\s+/g, ' ').slice(0, 160)}` : 'the page rendered no text',
    )

    // No horizontal overflow at any width: this is a page reached from an email
    // on a phone more often than anywhere else.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    check(`oneclick.page.${vp.label}.no-horizontal-overflow`, overflow <= 1, `${overflow}px of overflow`)

    await page.screenshot({ path: join(out, `preferences-${vp.label}.png`), fullPage: true })
    await context.close()
  }
} catch (err) {
  failures.push(`the drive threw: ${err.message}`)
  console.error(`FAIL  the drive threw: ${err.stack ?? err.message}`)
} finally {
  if (browser) await browser.close().catch(() => {})

  // What cannot be cleaned up, reported rather than pretended away.
  try {
    const left = await withdrawals(EMAIL)
    const { data: events } = await db.from('consent_events').select('id').eq('subject_email', EMAIL)
    console.log(
      `\nTEST left as found, except what the ledger refuses to forget: ${events?.length ?? 0} ` +
        `consent_events row(s) for ${EMAIL} (${left.length} of them withdrawals). The consent and ` +
        'suppression ledgers refuse DELETE by design (GA1 v3), so these stay and are named here.',
    )
    await db.from('marketing_consents').delete().eq('email', EMAIL)
    console.log(`marketing_consents row for ${EMAIL}: deleted`)
  } catch (err) {
    console.log(`could not report or clean the lane-b rows: ${err.message}`)
  }
}

const passed = checks.filter((c) => c.ok).length
writeFileSync(
  join(out, 'report.json'),
  JSON.stringify({ base: BASE, lane: LANE, passed, total: checks.length, checks, failures }, null, 2),
)
console.log(`\n${passed} of ${checks.length} checks passed`)
if (failures.length > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  ${f}`)
  exitCode = 1
}
process.exit(exitCode)
