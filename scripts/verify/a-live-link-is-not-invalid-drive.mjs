/**
 * A LINK ALREADY IN SOMEBODY'S INBOX MAY NOT BE CALLED INVALID. THIS DRIVES THE
 * THREE DOORS THAT DID IT.
 *
 * Each of these pages looks a token up and, until 21 September 2026, discarded
 * that read's error, so a dropped socket produced a sentence about the link:
 *
 *     /unsubscribe/[token]           "This link is not valid ... It may have
 *                                    already been used."
 *     /waitlist/unsubscribe/[token]  the same, nine lines under a header
 *                                    promising every link in an inbox keeps
 *                                    working
 *     /artists/claim/[token]         "This invite is not valid ... It may have
 *                                    already been claimed."
 *
 * The first is a statutory remedy: the Spam Act unsubscribe facility has to
 * work, and a blink told the reader theirs had been spent.
 *
 * WHAT THIS DRIVE PROVES, AND WHAT IT CANNOT.
 *
 *   IT PROVES both user-visible states on all three doors, at 390, 768 and
 *   1440: a REAL token renders the real page, and a token checked to be absent
 *   still renders the not-valid explanation. That second direction is the one a
 *   careless version of this fix breaks, by deleting the explanation along with
 *   the bug so that a genuinely used token lands on an error page.
 *
 *   IT CANNOT photograph a blink. All three reads live inside Next page
 *   components, which cannot be called from a script, so unlike
 *   a-blink-is-not-a-stale-link-drive.mjs there is no in-process half available
 *   here. The blink behaviour is held by the registered guard, by four drills
 *   that restore each defect and watch the guard refuse, and by five plantings
 *   driven red against the unit tests. That is stated rather than implied.
 *
 * NOTHING IS GUESSED. The waitlist token is read out of the database. The two
 * that do not exist on TEST are seeded and their ids remembered. The absent
 * tokens are generated and then CHECKED against their tables rather than
 * assumed absent.
 *
 * BLAST RADIUS, AND ONE HONEST GAP IN THE TAGGING RULE. Two other lanes build
 * against this TEST project. The organiser consent row carries
 * `lane-b-invalidlink` in its email, so it is this lane's on sight. The
 * event_artists row CANNOT be tagged: every column on that table is a uuid, a
 * number or an enum, and there is no free text to put a lane name in. It is
 * instead minted against an existing event and artist, its id is remembered,
 * and it is deleted in a finally with the delete VERIFIED by reading rather
 * than trusted. The waitlist door writes nothing at all.
 *
 * RUN IT:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/a-live-link-is-not-invalid-drive.mjs
 *
 *   env -u ... this shell carries the PRODUCTION Supabase URL, so without it the
 *   drive writes to the live database. The refusal below is the backstop.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-INVALIDLINK'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, 'drive.log')
writeFileSync(LOG, '')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

let passed = 0
let failed = 0

function say(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

function check(ok, what, detail = '') {
  if (ok) {
    passed += 1
    say(`  PASS  ${what}${detail ? ' :: ' + detail : ''}`)
  } else {
    failed += 1
    say(`  FAIL  ${what}${detail ? ' :: ' + detail : ''}`)
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required.')
  process.exit(1)
}
if (!url.includes('vkapkibzokmfaxqogypq')) {
  console.error(`REFUSING: this drive writes, and ${url} is not the TEST project.`)
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const NONCE = Math.random().toString(36).slice(2, 8)
const minted = { consentId: null, tagId: null }

/** A uuid of the right shape that the named table does not carry. Checked. */
async function absentToken(table, column) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = randomUUID()
    const hit = await db.from(table).select('id').eq(column, token).maybeSingle()
    if (hit.error) throw new Error(`could not check ${table}.${column}: ${hit.error.message}`)
    if (!hit.data) return token
  }
  throw new Error(`could not find an absent ${table}.${column}`)
}

async function seed() {
  // 1. The organiser marketing consent, tagged in its email.
  /*
   * PREFER AN UNTAGGED ORGANISATION. The first run of this drive hung its
   * consent row off "Refund Proof Presents lane-a-r1-...", which is lane A's
   * fixture. Nothing was broken, because the row is this lane's and is removed,
   * but a drive that depends on another lane's row goes red the day that lane
   * tidies up. The same lesson was recorded during LB-EMPTYPROFILE and is
   * applied here rather than learned twice.
   */
  const orgs = await db.from('organisations').select('id, name').limit(200)
  if (orgs.error) throw new Error('could not read organisations: ' + orgs.error.message)
  const rows = orgs.data ?? []
  const untagged = rows.find((o) => !/lane-[abc]/i.test(o.name ?? ''))
  const org = { data: untagged ?? rows[0], error: null }
  if (!org.data) throw new Error('no organisation to hang a consent on')
  say(`  organisation: ${org.data.name}${untagged ? '' : ' (no untagged organisation exists on TEST)'}`)
  const email = `lane-b-invalidlink-${NONCE}@example.com`
  const consent = await db
    .from('organiser_marketing_consents')
    .insert({
      organisation_id: org.data.id,
      email,
      status: 'granted',
      consent_text: 'Lane B drive row: keep me posted about events from this organiser.',
      consent_version: 'lane-b-drive',
      source: 'lane-b-invalidlink-drive',
    })
    .select('id, unsubscribe_token')
    .single()
  if (consent.error) throw new Error('could not seed a consent: ' + consent.error.message)
  minted.consentId = consent.data.id
  say(`  seeded an organiser consent tagged ${email}`)

  // 2. The waitlist signup: reuse a real one, so this door writes nothing.
  const wait = await db
    .from('city_waitlist_signups')
    .select('unsubscribe_token, city_slug')
    .is('unsubscribed_at', null)
    .limit(1)
    .maybeSingle()
  if (wait.error || !wait.data) throw new Error('no active city waitlist signup to drive')
  say(`  reusing a real city waitlist signup (${wait.data.city_slug}), so nothing is written`)

  /*
   * 3. The performer invite. event_artists on TEST carries invite_token null on
   * every row, so one is minted against an existing event and artist. It cannot
   * be tagged: the table has no free-text column. It is torn down below and the
   * delete is verified.
   */
  const taken = await db.from('event_artists').select('event_id, artist_id').limit(1000)
  if (taken.error) throw new Error('could not read event_artists: ' + taken.error.message)
  const used = new Set((taken.data ?? []).map((r) => `${r.event_id}:${r.artist_id}`))
  const artists = await db.from('artists').select('id').limit(50)
  const events = await db.from('events').select('id').eq('status', 'published').limit(50)
  if (artists.error || events.error) throw new Error('could not read artists or events')
  /*
   * event_artists is unique on (event_id, artist_id), so the pair has to be one
   * that does not exist yet. Searched rather than assumed: the first attempt at
   * this drive reused an existing pair and the database refused it, which is the
   * constraint doing its job on a careless seed.
   */
  let pairData = null
  for (const e of events.data ?? []) {
    for (const a of artists.data ?? []) {
      if (!used.has(`${e.id}:${a.id}`)) {
        pairData = { event_id: e.id, artist_id: a.id }
        break
      }
    }
    if (pairData) break
  }
  const pair = { data: pairData, error: null }
  if (!pair.data) throw new Error('every event and artist pair on TEST is already linked')
  const inviteToken = randomUUID()
  const tag = await db
    .from('event_artists')
    .insert({
      event_id: pair.data.event_id,
      artist_id: pair.data.artist_id,
      invite_token: inviteToken,
      status: 'invited',
      billing_order: 99,
    })
    .select('id, invite_token')
    .single()
  if (tag.error) throw new Error('could not seed a performer invite: ' + tag.error.message)
  minted.tagId = tag.data.id
  say('  seeded a performer invite (untaggable table, removed and verified below)')

  return {
    consentToken: consent.data.unsubscribe_token,
    waitlistToken: wait.data.unsubscribe_token,
    inviteToken: tag.data.invite_token,
    organisationName: org.data.name,
  }
}

async function driveBrowser(tokens, absent) {
  /*
   * THE FOUR DOORS, and what each capture has to show. The "valid" row names a
   * string that can only be rendered when the lookup FOUND something, so a page
   * that quietly fell into its not-valid branch cannot pass it.
   */
  const CASES = [
    {
      slug: 'organiser-unsubscribe-live',
      path: `/unsubscribe/${tokens.consentToken}`,
      wants: 'Unsubscribe',
      not: 'This link is not valid',
      what: 'a live organiser unsubscribe link offers the unsubscribe',
    },
    {
      slug: 'organiser-unsubscribe-absent',
      path: `/unsubscribe/${absent.consent}`,
      wants: 'This link is not valid',
      not: null,
      what: 'a token that genuinely matches nothing still gets the explanation',
    },
    {
      slug: 'waitlist-unsubscribe-live',
      path: `/waitlist/unsubscribe/${tokens.waitlistToken}`,
      wants: 'waitlist',
      not: 'This link is not valid',
      what: 'a live city waitlist unsubscribe link renders its city',
    },
    {
      slug: 'performer-claim-live',
      path: `/artists/claim/${tokens.inviteToken}`,
      wants: 'lineup',
      not: 'This invite is not valid',
      what: 'a live performer invite renders the lineup claim',
    },
  ]

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      for (const c of CASES) {
        await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded', timeout: 120_000 })
        const body = (await page.textContent('body')) ?? ''
        check(body.includes(c.wants), `${vp.name}: ${c.what}`, `looked for "${c.wants}"`)
        if (c.not) {
          check(
            !body.includes(c.not),
            `${vp.name}: it does NOT say "${c.not}" about a live link`,
          )
        }
        await page.screenshot({ path: join(SHOTS, `${vp.name}-${c.slug}.png`), fullPage: false })
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

async function teardown() {
  for (const [table, id, label] of [
    ['organiser_marketing_consents', minted.consentId, 'the seeded organiser consent'],
    ['event_artists', minted.tagId, 'the seeded performer invite'],
  ]) {
    if (!id) continue
    await db.from(table).delete().eq('id', id)
    const left = await db.from(table).select('id').eq('id', id).maybeSingle()
    check(
      !left.error && left.data === null,
      `teardown: ${label} is gone, checked by reading rather than by trusting the delete`,
    )
    // Idempotent on purpose: main() can reach here twice on a failure path, and
    // a teardown that reports the same success twice is a count nobody can read.
    if (table === 'organiser_marketing_consents') minted.consentId = null
    else minted.tagId = null
  }
}

async function main() {
  say(`=== a live link is not an invalid one, driven ${new Date().toISOString()} ===`)
  say(`base ${BASE}, database ${url}`)
  let tokens
  try {
    tokens = await seed()
    const absent = {
      consent: await absentToken('organiser_marketing_consents', 'unsubscribe_token'),
      waitlist: await absentToken('city_waitlist_signups', 'unsubscribe_token'),
      invite: await absentToken('event_artists', 'invite_token'),
    }
    say(`  absent tokens checked against their own tables: ${Object.keys(absent).join(', ')}`)
    say('--- the browser, at 390, 768 and 1440 ---')
    await driveBrowser(tokens, absent)
  } finally {
    say('--- teardown ---')
    await teardown()
  }

  say(`\n=== ${passed} of ${passed + failed} checks passed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  say(`DRIVE FAILED: ${error.stack ?? error.message}`)
  teardown().finally(() => process.exit(1))
})
