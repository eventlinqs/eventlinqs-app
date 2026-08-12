/**
 * The waitlist bridge, proven end to end on real data.
 *
 * Founder ruling 2, item 3: "Prove the whole chain end to end with pasted
 * evidence: a signup on /waitlist, an event published, the digest going out
 * carrying that event, and a tracked link attributing a click back. Consent
 * and unsubscribe must be correct and provable, because this is marketing
 * mail to real people and getting it wrong is worse than not sending."
 *
 * Every leg is driven through the real product (a browser filling the real
 * form, the real wizard, the real cron endpoint) and asserted against the
 * database, never against a mock.
 *
 *   1  A stranger joins the city waitlist at /waitlist.
 *   2  The stored consent is the v2 wording that names the weekly email.
 *   3  An organiser publishes an event in that city through the wizard.
 *   4  That event carries city_primary, so the city can actually see it.
 *   5  The digest resolves the waitlist signup as a recipient (it could not
 *      before) and carries the new event.
 *   6  A real digest email is sent and its unsubscribe link is the one that
 *      belongs to that person.
 *   7  A click on a tracked link is attributed back to the event.
 *   8  Unsubscribing works from the waitlist token, and the next send
 *      excludes them.
 *
 * Usage: node scripts/verify/waitlist-bridge-e2e.mjs [baseUrl]
 * Requires .env.test (TEST project only). Never point this at Production.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const OUT = 'docs/roast/waitlist-bridge-evidence'
mkdirSync(OUT, { recursive: true })

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const PROJECT = env.NEXT_PUBLIC_SUPABASE_URL
if (!PROJECT?.includes('vkapkibzokmfaxqogypq')) {
  throw new Error(`Refusing to run: ${PROJECT} is not the TEST project.`)
}
const db = createClient(PROJECT, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const CITY = 'geelong'
const CITY_NAME = 'Geelong'
const STAMP = Date.now().toString(36)
const WAITLIST_EMAIL = `bridge-proof-${STAMP}@mailinator.com`
const ORGANISER_EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const ORGANISER_PASSWORD = 'ArtistGate2026!Drive'
const EVENT_TITLE = `Bridge Proof Night ${STAMP.toUpperCase()}`

const log = []
function step(n, name) {
  const line = `\n===== ${n}. ${name} =====`
  console.log(line)
  log.push(line)
}
function say(...parts) {
  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p, null, 2))).join(' ')
  console.log(line)
  log.push(line)
}
const failures = []
function assert(condition, label, detail) {
  const mark = condition ? 'PASS' : 'FAIL'
  say(`  [${mark}] ${label}${detail === undefined ? '' : ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  if (!condition) failures.push(label)
}

async function cron(params) {
  const url = `${BASE}/api/cron/weekly-digest?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

try {
  step(0, 'Preconditions')
  const { data: flag } = await db
    .from('feature_flags')
    .select('flag, enabled')
    .eq('flag', 'broadcast_digest')
    .maybeSingle()
  say(`  broadcast_digest was ${flag?.enabled}`)
  if (!flag?.enabled) {
    await db.from('feature_flags').update({ enabled: true }).eq('flag', 'broadcast_digest')
    say('  broadcast_digest enabled for this proof (TEST project)')
  }
  // Clear any digest_sends row for this period so the run is not a no-op.
  const periodStart = new Date().toISOString().slice(0, 10)
  await db.from('digest_sends').delete().eq('city_slug', CITY).eq('period_start', periodStart)
  say(`  cleared digest_sends for ${CITY} ${periodStart}`)

  // -------------------------------------------------------------------------
  step(1, 'A stranger joins the city waitlist at /waitlist')
  await page.goto(`${BASE}/waitlist`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: new RegExp(`^${CITY_NAME},`, 'i') }).first().click()
  await page.fill('#wl-name', 'Bridge Proof Person')
  await page.fill('#wl-email', WAITLIST_EMAIL)
  await page.getByText('I go to events').click()

  const consentShown = (
    await page
      .locator('p')
      .filter({ hasText: new RegExp(`^Join the ${CITY_NAME} waitlist: EventLinqs`) })
      .first()
      .innerText()
  ).trim()
  say('  consent wording shown on screen:')
  say(`    "${consentShown}"`)
  assert(
    consentShown.includes(`weekly email of what is on in ${CITY_NAME}`),
    'the wording on screen names the weekly email',
  )

  await page.getByRole('button', { name: new RegExp(`^Join the ${CITY_NAME} waitlist$`) }).click()
  try {
    await page.waitForSelector('text=You are on the list', { timeout: 90000 })
  } catch (err) {
    const alert = await page.locator('[role="alert"]').allInnerTexts()
    say('  join failed. alerts on screen:', alert)
    await page.screenshot({ path: `${OUT}/01-waitlist-FAILED.png` })
    throw err
  }
  await page.screenshot({ path: `${OUT}/01-waitlist-joined.png` })
  say(`  joined as ${WAITLIST_EMAIL}`)

  // -------------------------------------------------------------------------
  step(2, 'The stored consent is the v2 wording, recorded verbatim')
  const { data: signup } = await db
    .from('city_waitlist_signups')
    .select('email, city_slug, consent_version, consent_text, unsubscribe_token, unsubscribed_at')
    .eq('email', WAITLIST_EMAIL)
    .maybeSingle()
  say('  row:', signup)
  assert(!!signup, 'the signup reached city_waitlist_signups')
  assert(signup?.consent_version === 'v2', 'consent_version is v2', signup?.consent_version)
  assert(
    signup?.consent_text === consentShown,
    'the stored wording is EXACTLY the wording shown on screen',
  )
  assert(signup?.unsubscribed_at === null, 'the signup is live')
  const waitlistToken = signup?.unsubscribe_token

  // -------------------------------------------------------------------------
  step(3, 'An organiser publishes an event in that city, through the wizard')
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.fill('input[type="email"]', ORGANISER_EMAIL)
  await page.fill('input[type="password"]', ORGANISER_PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
  say('  organiser signed in')

  await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector('text=Magic Start', { timeout: 60000 })
  const nextFriday = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  const dateWords = nextFriday.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  await page
    .locator('textarea')
    .first()
    .fill(
      `Free live music night called ${EVENT_TITLE} at the Waterfront Pavilion in Geelong on ${dateWords} at 7:30pm, free entry, 80 capacity`,
    )
  await page.getByRole('button', { name: 'Build my event' }).click()
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[placeholder*="Summer Music Festival"]')
      return el && el.value.length > 3
    },
    { timeout: 120000 },
  )
  say('  draft built')

  // Force the title so the digest assertion is unambiguous.
  await page.locator('input[placeholder*="Summer Music Festival"]').fill(EVENT_TITLE)

  let published = false
  let cityTyped = false
  for (let i = 0; i < 16 && !published; i++) {
    await page.waitForTimeout(1200)

    // The location step: type the locality the way an organiser does.
    if (!cityTyped) {
      const cityInput = page.locator('label:has-text("City") + input, input').filter({ hasNot: page.locator('x') })
      const cityLabel = page.getByText('City', { exact: true })
      if (await cityLabel.count()) {
        const input = cityLabel.first().locator('xpath=following-sibling::input[1]')
        if (await input.count()) {
          await input.fill(CITY_NAME)
          cityTyped = true
          say(`  typed the locality "${CITY_NAME}" on the location step`)
        }
      }
      void cityInput
    }

    const fileInput = page.locator('input[type="file"]')
    if ((await fileInput.count()) > 0) {
      const already = await page.locator('img[alt*="cover" i], img[src*="event-images"]').count()
      if (!already) {
        await fileInput.first().setInputFiles(`${OUT}/01-waitlist-joined.png`)
        say('  cover uploaded')
        await page.waitForTimeout(9000)
      }
    }

    const publish = page.getByRole('button', {
      name: /publish and get your launch kit|^publish( event)?$/i,
    })
    if ((await publish.count()) && (await publish.first().isEnabled())) {
      await publish.first().click()
      published = true
      say('  clicked publish')
      break
    }

    const next = page.getByRole('button', { name: /^(next|continue)/i })
    if ((await next.count()) && (await next.first().isEnabled())) {
      await next.first().click()
    }
  }
  assert(published, 'the event was published through the wizard')
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${OUT}/02-published.png` })

  // -------------------------------------------------------------------------
  step(4, 'The published event carries city_primary (the root fix)')
  const { data: event } = await db
    .from('events')
    .select('id, slug, title, status, venue_city, city_primary, start_date, visibility, is_seed_data')
    .eq('title', EVENT_TITLE)
    .maybeSingle()
  say('  row:', event)
  assert(!!event, 'the event exists')
  assert(event?.status === 'published', 'it is published', event?.status)
  assert(
    event?.city_primary === CITY,
    'city_primary was written by the real create path',
    event?.city_primary,
  )

  // -------------------------------------------------------------------------
  step(5, 'The digest resolves the waitlist signup and carries the event')
  const dry = await cron({ city: CITY, dry_run: '1' })
  say('  dry run:', dry.body)
  const cityResult = (dry.body.cities ?? []).find((c) => c.city === CITY) ?? {}
  const emails = cityResult.recipientEmails ?? []
  const titles = cityResult.eventTitles ?? []
  assert(
    emails.includes(`${WAITLIST_EMAIL} (waitlist)`),
    'the waitlist signup is a recipient, sourced from the waitlist',
    emails,
  )
  assert(titles.includes(EVENT_TITLE), 'the new event is carried by the digest', titles)

  // -------------------------------------------------------------------------
  step(6, 'A real digest email goes out with that person the unsubscribe link')
  const sent = await cron({ city: CITY, test_to: WAITLIST_EMAIL })
  say('  send:', sent.body)
  assert(sent.status === 200, 'the send returned 200', sent.status)
  assert(
    (sent.body.cities ?? []).some((c) => c.testSentTo === WAITLIST_EMAIL),
    'the email was addressed to the waitlist signup',
  )

  // Founder ruling 3: dump what was actually produced so a human reads it.
  // Tests prove code paths; only reading proves quality.
  const preview = await cron({ city: CITY, preview_to: WAITLIST_EMAIL })
  const rendered = (preview.body.cities ?? []).find((c) => c.preview)?.preview
  if (rendered) {
    writeFileSync(`${OUT}/05-digest-email.html`, rendered.html, 'utf8')
    writeFileSync(`${OUT}/05-digest-email.txt`, rendered.text, 'utf8')
    say('  ---- the email, as the recipient receives it (plain text) ----')
    say(rendered.text)
    say('  ---- subject ----')
    say(`  ${rendered.subject}`)
    assert(
      rendered.text.includes('Unsubscribe:'),
      'the text part carries an unsubscribe link the recipient can act on',
    )
    assert(
      rendered.text.includes('EventLinqs, hello@eventlinqs.com'),
      'the sender is identified, as the Spam Act requires',
    )
  } else {
    assert(false, 'the rendered email could be read back for review')
  }

  // -------------------------------------------------------------------------
  step(7, 'A click on a tracked link is attributed back to the event')
  const { data: links } = await db
    .from('share_links')
    .select('id, code, channel')
    .eq('event_id', event.id)
  say('  share links minted for this event:', links)

  const link = (links ?? []).find((l) => l.channel === 'digest') ?? (links ?? [])[0]
  if (!link) {
    assert(false, 'a tracked link exists for the event')
  } else {
    const before = await db
      .from('share_link_events')
      .select('id', { count: 'exact', head: true })
      .eq('link_id', link.id)
      .eq('kind', 'click')
    const res = await fetch(`${BASE}/s/${link.code}`, { redirect: 'manual' })
    say(`  GET /s/${link.code} -> ${res.status} ${res.headers.get('location') ?? ''}`)
    await new Promise((r) => setTimeout(r, 2500))
    const after = await db
      .from('share_link_events')
      .select('id', { count: 'exact', head: true })
      .eq('link_id', link.id)
      .eq('kind', 'click')
    assert(
      (after.count ?? 0) > (before.count ?? 0),
      `a click on the ${link.channel} link was recorded`,
      `${before.count} -> ${after.count}`,
    )
    assert(
      link.channel === 'digest',
      'the click is attributed to the digest channel (needs migration 20260808000002)',
      link.channel,
    )
  }

  // -------------------------------------------------------------------------
  step(8, 'Unsubscribe works from the waitlist token, and the next send excludes them')
  await page.goto(`${BASE}/unsubscribe/digest/${waitlistToken}`, { waitUntil: 'load', timeout: 60000 })
  const heading = await page.locator('h1').innerText()
  say(`  page heading: "${heading}"`)
  assert(
    /unsubscribe from the weekly digest/i.test(heading),
    'the waitlist token opens a working unsubscribe page',
  )
  await page.screenshot({ path: `${OUT}/03-unsubscribe.png` })
  await page.getByRole('button', { name: 'Unsubscribe' }).click()
  await page.waitForSelector('text=You are unsubscribed', { timeout: 30000 })
  await page.screenshot({ path: `${OUT}/04-unsubscribed.png` })

  const { data: suppression } = await db
    .from('marketing_consents')
    .select('email, status, consent_text, consent_version, source, granted_at, revoked_at')
    .eq('email', WAITLIST_EMAIL)
    .maybeSingle()
  say('  suppression record:', suppression)
  assert(suppression?.status === 'withdrawn', 'the withdrawal is recorded')
  assert(
    suppression?.consent_text === consentShown,
    'the withdrawal carries the exact wording the person consented to',
  )

  const { data: stillOnList } = await db
    .from('city_waitlist_signups')
    .select('unsubscribed_at')
    .eq('email', WAITLIST_EMAIL)
    .maybeSingle()
  assert(
    stillOnList?.unsubscribed_at === null,
    'their waitlist place is kept, exactly as the page says',
  )

  const dryAfter = await cron({ city: CITY, dry_run: '1' })
  const afterEmails =
    (dryAfter.body.cities ?? []).find((c) => c.city === CITY)?.recipientEmails ?? []
  say('  recipients after unsubscribe:', afterEmails)
  assert(
    !afterEmails.some((e) => e.startsWith(WAITLIST_EMAIL)),
    'the next send excludes them',
    afterEmails,
  )
  // -------------------------------------------------------------------------
  step(9, 'Clean up, so the proof never reaches a real inbox')
  // The proof publishes a real event into a real city and joins a real
  // waitlist. Left behind, both would ride the next genuine Wednesday send.
  const { error: eventDeleteError } = await db
    .from('events')
    .delete()
    .like('title', 'Bridge Proof Night %')
  await db.from('city_waitlist_signups').delete().like('email', 'bridge-proof-%@mailinator.com')
  await db.from('marketing_consents').delete().like('email', 'bridge-proof-%@mailinator.com')
  const { count: leftover } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .like('title', 'Bridge Proof Night %')
  assert(
    !eventDeleteError && (leftover ?? 0) === 0,
    'no proof event is left behind to reach a real subscriber',
    eventDeleteError?.message ?? `${leftover} left`,
  )
} finally {
  await browser.close()
  const verdict = failures.length === 0 ? 'ALL GREEN' : `${failures.length} FAILED`
  const tail = `\n===== VERDICT: ${verdict} =====\n${failures.map((f) => `  FAILED: ${f}`).join('\n')}`
  console.log(tail)
  log.push(tail)
  writeFileSync(`${OUT}/RUN.txt`, log.join('\n'), 'utf8')
  console.log(`\nevidence written to ${OUT}/RUN.txt`)
}
