/**
 * LB-BLINKDOOR. A BLINK IN THE ONE DOOR SENT A MESSAGE TO SOMEBODY WHO HAD
 * UNSUBSCRIBED, AND TOLD THEM SO ON THEIR OWN PREFERENCES PAGE.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES.
 *
 * `src/lib/consent/resolver.ts` calls itself THE ONE DOOR every message this
 * platform sends to a person goes through, and its catch block says a ledger it
 * cannot read REFUSES the send. Until 21 September 2026 that was true only of a
 * read that THROWS, and none of its three reads did: supabase-js resolves a
 * PostgREST failure as `{ data: null, error }`, and all three were written
 * `result.data ?? []`.
 *
 * `/marketing/preferences/[token]` prints that verdict VERBATIM to the person
 * whose consent it is, with no login, because a right you have to create an
 * account to exercise is not a right anybody exercises. So the defect was not
 * only a wrong send: it was the platform telling somebody, on the page that
 * exists for their unsubscribe, that their unsubscribe had not taken.
 *
 * TWO HALVES, AND THE SEAM BETWEEN THEM IS STATED RATHER THAN GLOSSED.
 *
 *   THE SURFACE, in a real browser at 390, 768 and 1440, against real TEST
 *   rows: three people whose ledgers differ, and the three different sentences
 *   the page prints for them. This proves the page renders the resolver's own
 *   words rather than a paraphrase of them.
 *
 *   THE BLINK, in this process, against the same real TEST project, calling the
 *   real `resolveSend` with `globalThis.fetch` wrapped so that one table's read
 *   fails exactly as PostgREST fails. This proves what the page would print
 *   when a read gives up.
 *
 *   It is done in two halves because the blink has to be injected INSIDE the
 *   process that reads the database, and the dev server on port 3100 was
 *   started by an earlier session of this lane. The brief for this lane says
 *   not to restart a process this session did not start, so the server is used
 *   as it is, and the blink is driven where it can be injected honestly.
 *
 * BLAST RADIUS. Two other lanes build against this same TEST project. Every
 * seeded row carries `lane-b-blinkdoor` in its address, none of them is an
 * event, an organiser or anything a discovery surface reads, and the teardown
 * runs in a finally and VERIFIES rather than trusting its own delete. The two
 * LEDGER tables refuse DELETE by design, so four consent rows and one
 * suppression row stay, tagged, and the seed is idempotent so they never grow.
 *
 * RUN IT, and every flag on this line is load-bearing:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/a-blink-does-not-send-drive.mjs
 *
 *   env -u ...        this shell carries the PRODUCTION Supabase URL, so without
 *                     it the drive reads and writes the live database. The
 *                     refusal at the top is the backstop, not the plan.
 *   server-only-shim  `resolveSend` is a `server-only` module and fails at
 *                     IMPORT without it, which reads as a product defect.
 *   src-alias-loader  the resolver imports through `@/`, which node does not
 *                     resolve on its own.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-BLINKDOOR'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, 'drive.log')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const TAG = 'lane-b-blinkdoor'
const PURPOSE = 'facilitated_event_marketing'
const WORDING = 'EventLinqs will send you marketing about events run by other organisers who sell tickets on EventLinqs.'

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

/** The three people, and the sentence each one's ledger must produce. */
const PEOPLE = [
  {
    key: 'consented',
    email: `${TAG}-consented@example.com`,
    expect: /can send you marketing/i,
    what: 'a live grant, inside the ageing window',
  },
  {
    key: 'unsubscribed',
    email: `${TAG}-unsubscribed@example.com`,
    expect: /an unsubscribe from all EventLinqs marketing, recorded on .*, stops this message/i,
    what: 'a grant, then an unsubscribe after it',
  },
  {
    key: 'withdrawn',
    email: `${TAG}-withdrawn@example.com`,
    expect: /latest consent event is withdrawn/i,
    what: 'a grant, then a withdrawal after it',
  },
]

async function tenantId() {
  const res = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').maybeSingle()
  if (res.error) throw new Error('tenant read failed: ' + res.error.message)
  if (!res.data?.id) throw new Error('the platform tenant does not exist on TEST')
  return res.data.id
}

/**
 * THE LEDGER ROWS CANNOT BE TAKEN BACK, SO THE SEED IS IDEMPOTENT.
 *
 * The first run of this drive tried to delete what it had written and the
 * database refused, in its own words: "append only: DELETE on
 * public.consent_events is refused. A consent record is evidence of what a
 * person was shown and agreed to, so it is never altered and never removed."
 * That is GA1's law working exactly as designed, and the drive was wrong, not
 * the platform.
 *
 * So the ledger rows for these three addresses are written ONCE and reused on
 * every later run. `marketing_consents` is current state rather than evidence
 * and is deletable, so its token is re-minted each time. The teardown checks
 * the ledger counts have not GROWN, which is the only way to notice a seed that
 * has quietly stopped being idempotent.
 */
const LEDGER_ROWS_EXPECTED = { consent_events: 4, suppression_events: 1 }

async function seed(tenant) {
  const existing = await db
    .from('consent_events')
    .select('subject_email')
    .like('subject_email', TAG + '%')
    .limit(100)
  if (existing.error) throw new Error('seed precheck failed: ' + existing.error.message)
  const alreadyLedgered = new Set((existing.data ?? []).map((r) => r.subject_email))

  const tokens = {}
  for (const person of PEOPLE) {
    const token = randomUUID()
    tokens[person.key] = token
    // Current state, not evidence: this one IS deletable, so it is re-minted.
    const cleared = await db.from('marketing_consents').delete().eq('email', person.email)
    if (cleared.error) throw new Error('seed could not clear the token row: ' + cleared.error.message)
    /*
     * THE TOKEN IS THE PAGE'S ONLY KEY, and it is READ BACK below rather than
     * assumed: the standing rule on this project is never to guess a slug, a
     * route or an id, and a token this script minted is still a guess until the
     * database says it stored it.
     */
    const consent = await db.from('marketing_consents').insert({
      email: person.email,
      unsubscribe_token: token,
      status: 'granted',
      source: TAG,
      consent_text: WORDING,
      consent_version: 'v1',
      granted_at: '2026-06-01T00:00:00.000Z',
    })
    if (consent.error) throw new Error('seed marketing_consents failed: ' + consent.error.message)

    const events = [
      {
        tenant_id: tenant,
        subject_email: person.email,
        purpose: PURPOSE,
        channel_scope: 'both',
        decision: 'granted',
        occurred_at: '2026-06-01T00:00:00.000Z',
        wording: WORDING,
        wording_version: 'v1',
        capture_surface: TAG,
        suppression_scope: 'every EventLinqs facilitated message on every channel',
        third_party_scope: 'events ticketed on EventLinqs, marketed by EventLinqs as the sender',
      },
    ]
    if (person.key === 'withdrawn') {
      events.push({ ...events[0], decision: 'withdrawn', occurred_at: '2026-07-01T00:00:00.000Z' })
    }
    if (!alreadyLedgered.has(person.email)) {
      const written = await db.from('consent_events').insert(events)
      if (written.error) throw new Error('seed consent_events failed: ' + written.error.message)
    }

    if (person.key === 'unsubscribed' && !alreadyLedgered.has(person.email)) {
      const stop = await db.from('suppression_events').insert({
        tenant_id: tenant,
        subject_email: person.email,
        channel: 'both',
        scope: 'all_marketing',
        occurred_at: '2026-07-01T00:00:00.000Z',
        reason: 'unsubscribed',
        request_source: TAG,
      })
      if (stop.error) throw new Error('seed suppression_events failed: ' + stop.error.message)
    }
  }

  // Read every token back out of the database, so the URLs this drives are the
  // database's answer rather than this script's memory.
  const stored = await db
    .from('marketing_consents')
    .select('email, unsubscribe_token')
    .like('email', TAG + '%')
    .limit(50)
  if (stored.error) throw new Error('token read-back failed: ' + stored.error.message)
  const byEmail = new Map((stored.data ?? []).map((r) => [r.email, r.unsubscribe_token]))
  for (const person of PEOPLE) {
    const fromDb = byEmail.get(person.email)
    if (fromDb !== tokens[person.key]) {
      throw new Error(`the stored token for ${person.email} is not the one that was written`)
    }
  }
  return tokens
}

async function teardown() {
  /*
   * ONLY ONE OF THESE THREE TABLES MAY BE EMPTIED, and the other two are not a
   * failure of this drive. `consent_events` and `suppression_events` refuse
   * DELETE in the database because a consent record is evidence; the rows this
   * drive writes are three fake addresses that no discovery surface reads and
   * no campaign can target, and they stay, tagged, for ever. That is the cost
   * of an append-only ledger and it is paid deliberately.
   *
   * What IS checked is that the counts have not grown, because a seed that
   * stopped being idempotent would add four more rows to a shared TEST project
   * on every run and nothing else would ever notice.
   */
  const cleared = await db.from('marketing_consents').delete().like('email', TAG + '%')
  if (cleared.error) log('  teardown marketing_consents: ' + cleared.error.message)
  const tokensLeft = await db
    .from('marketing_consents')
    .select('email', { count: 'exact', head: true })
    .like('email', TAG + '%')
  check('teardown left no unsubscribe tokens behind', (tokensLeft.count ?? -1) === 0, `${tokensLeft.count} left`)

  for (const [table, expected] of Object.entries(LEDGER_ROWS_EXPECTED)) {
    const held = await db
      .from(table)
      .select('subject_email', { count: 'exact', head: true })
      .like('subject_email', TAG + '%')
    check(
      `${table} holds the ${expected} append-only row(s) this drive is allowed to leave, and no more`,
      held.count === expected,
      `${held.count} rows; the ledger refuses DELETE by design, so a higher number means the seed stopped being idempotent`,
    )
  }
}

/**
 * THE BLINK, WRAPPED ROUND THE REAL CLIENT'S REAL FETCH.
 *
 * supabase-js resolves `fetch` from the global at call time, so this sits in
 * front of every read the resolver makes with the real TEST database on the
 * other side of it. The failure thrown is the exact shape the pre-push gate
 * caught on 10 September 2026: a closed socket, which supabase-js catches and
 * hands back as `{ data: null, error }` rather than rejecting. That is the
 * whole reason a discarded error is invisible at the call site.
 */
function withFailingTable(table, run) {
  const real = globalThis.fetch
  let injected = 0
  globalThis.fetch = async function blink(input, init) {
    const href = typeof input === 'string' ? input : input?.url ?? String(input)
    if (href.includes(`/rest/v1/${table}?`)) {
      injected += 1
      const cause = new Error('other side closed')
      cause.code = 'UND_ERR_SOCKET'
      cause.name = 'SocketError'
      throw new TypeError('fetch failed', { cause })
    }
    return real.call(globalThis, input, init)
  }
  return run().finally(() => {
    globalThis.fetch = real
  })
    .then((value) => ({ value, injected }))
}

async function main() {
  writeFileSync(LOG, '')
  log(`LB-BLINKDOOR drive, ${new Date().toISOString()}, base ${BASE}`)

  const tenant = await tenantId()
  let tokens = null
  let browser = null
  try {
    tokens = await seed(tenant)
    log(`  seeded ${PEOPLE.length} people, tokens read back from the database`)

    // ---------------------------------------------------------------- surface
    browser = await chromium.launch()
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()
      for (const person of PEOPLE) {
        const target = `${BASE}/marketing/preferences/${tokens[person.key]}`
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120000 })
        const status = response?.status() ?? 0
        await page.waitForSelector('[data-testid="marketing-state"]', { timeout: 60000 })
        const sentence = (await page.locator('[data-testid="marketing-state"]').innerText()).trim()
        const shot = join(SHOTS, `${viewport.name}-${person.key}.png`)
        await page.screenshot({ path: shot, fullPage: false })
        check(
          `${viewport.name} ${person.key}: 200 and the resolver's own sentence`,
          status === 200 && person.expect.test(sentence),
          `${status}, "${sentence}"`,
        )
      }
      await context.close()
    }

    // ------------------------------------------------------------------ blink
    const { resolveSend } = await import('../../src/lib/consent/resolver.ts')
      .catch(() => import('@/lib/consent/resolver'))

    const working = await resolveSend(db, {
      email: PEOPLE[1].email,
      purpose: PURPOSE,
      channel: 'email',
    })
    check(
      'every read working: the unsubscribed person is REFUSED by their suppression',
      working.permitted === false && /an unsubscribe from all EventLinqs marketing/.test(working.reason),
      JSON.stringify(working),
    )

    const suppressionBlink = await withFailingTable('suppression_events', () =>
      resolveSend(db, { email: PEOPLE[1].email, purpose: PURPOSE, channel: 'email' }),
    )
    check(
      'the suppression read blinks: still REFUSED, and the reason names the read',
      suppressionBlink.value.permitted === false &&
        /consent ledger could not be read/.test(suppressionBlink.value.reason),
      `${suppressionBlink.injected} injection(s), ${JSON.stringify(suppressionBlink.value)}`,
    )
    check(
      'the blink was genuinely injected, so the pass above is not a pass over nothing',
      suppressionBlink.injected > 0,
      `${suppressionBlink.injected} intercepted request(s)`,
    )

    const consentBlink = await withFailingTable('consent_events', () =>
      resolveSend(db, { email: PEOPLE[0].email, purpose: PURPOSE, channel: 'email' }),
    )
    check(
      'the consent read blinks: REFUSED, and NOT with "no consent event is recorded"',
      consentBlink.value.permitted === false &&
        /consent ledger could not be read/.test(consentBlink.value.reason) &&
        !/no consent event is recorded/.test(consentBlink.value.reason),
      JSON.stringify(consentBlink.value),
    )

    const policyBlink = await withFailingTable('consent_policy', () =>
      resolveSend(db, { email: PEOPLE[0].email, purpose: PURPOSE, channel: 'email' }),
    )
    check(
      'the policy read blinks: REFUSED rather than silently restored to 24 months',
      policyBlink.value.permitted === false &&
        /consent ledger could not be read/.test(policyBlink.value.reason),
      JSON.stringify(policyBlink.value),
    )

    const consentedWorking = await resolveSend(db, {
      email: PEOPLE[0].email,
      purpose: PURPOSE,
      channel: 'email',
    })
    check(
      'and with every read working the consented person is still PERMITTED, so the door did not simply close',
      consentedWorking.permitted === true,
      JSON.stringify(consentedWorking),
    )
  } finally {
    if (browser) await browser.close()
    if (tokens) await teardown()
  }

  const failed = results.filter((r) => !r.ok)
  log('')
  log(`${results.length - failed.length} of ${results.length} checks PASS`)
  writeFileSync(join(EVIDENCE, 'drive-results.json'), JSON.stringify(results, null, 2))
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  log('DRIVE FAILED: ' + (error?.stack ?? error))
  process.exitCode = 1
})
