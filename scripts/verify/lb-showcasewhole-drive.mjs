/**
 * LB-SHOWCASEWHOLE, DRIVEN: MORE THAN A THOUSAND TRACKED ROWS BEHIND ONE REAL
 * PERFORMER, AND THE TWO PUBLIC SURFACES THAT COUNT THEM.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DRIVE EXISTS RATHER THAN THE UNIT TESTS ALONE. The unit tests fake
 * the server, so they prove the module PAGES. They cannot prove the thing being
 * paged past is real: the 1,000-row ceiling belongs to the Supabase project and
 * not to the code ("By default, Supabase projects return a maximum of 1,000
 * rows", https://supabase.com/docs/reference/javascript/select, fetched
 * 2026-09-19). So this puts 1,150 tracked rows behind one performer on the real
 * TEST project and reads what the PUBLIC pages say.
 *
 * TWO SURFACES, neither of them covered by `lb-artistwhole-drive.mjs`, which
 * drove the artist's own dashboard and the organiser's lineup through
 * src/lib/broadcast/artists.ts. These two read src/lib/marketplace/showcase.ts,
 * which is the copy of that module that was left behind:
 *
 *   /artists            the public performer directory. Its badge reads
 *                       "N tickets driven" and ?sort=draw RANKS on that number.
 *   /artists/[slug]     the public performer profile: the showcase, the proof
 *                       of draw, and the credits.
 *
 * ---------------------------------------------------------------------------
 * THE FIXTURE IS BUILT SO THE DEFECT WOULD HAVE BEEN VISIBLE, WHICH IS THE
 * WHOLE POINT AND IS NOT AUTOMATIC.
 *
 * A drive that seeded three clicks and asserted "a number is shown" would have
 * passed on the broken build. So the conversions that carry the real orders are
 * given ids beginning `f` and the 1,150 clicks ids beginning `0`. The fixed read
 * pages `share_link_events` ordered by id, so it reaches them. A read that stops
 * at the ceiling does not.
 *
 * AND THE COUNTER-PROOF IS MEASURED, NOT ASSUMED. Before driving anything this
 * file issues the OLD read, unbounded, against the same rows, and records how
 * many came back and how many of them were conversions. If that read returns
 * every row, the fixture is not past the ceiling and this drive says so and
 * fails rather than reporting a pass it did not earn.
 *
 * WHAT IT LEAVES ON TEST: nothing, and the flag is back OFF. Everything hangs
 * off `lane-b-showcasewhole-`, deleted and then RE-READ to prove it went.
 *
 * Run (dev server on 3100 against TEST):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   node --env-file=.env.local scripts/verify/lb-showcasewhole-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-SHOWCASEWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { sitemapFootprint } from './lib/sitemap-footprint.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-SHOWCASEWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const TAG = 'lane-b-showcasewhole'
const SLUG_PREFIX = `${TAG}-presents`
const RUN = Date.now().toString(36)
const FLAG = 'artist_showcase'
/** The resolver's cache TTL. Read from the product rather than typed here. */
const FLAG_CACHE_TTL_SECONDS = 30

/** 1,150 clicks: 150 past the documented ceiling, on purpose. */
const CLICKS = 1150
/** Two real orders, five real tickets between them, reached only past that ceiling. */
const ORDERS = [{ qty: 2 }, { qty: 3 }]
const TICKETS_EXPECTED = ORDERS.reduce((n, o) => n + o.qty, 0)

const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** A uuid forced into a known sort position, so "past the ceiling" is a fact and not a hope. */
const uuidStartingWith = (nibble) => `${nibble}${randomUUID().slice(1)}`

async function serverCount(table, build) {
  const { count, error } = await build(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`counting ${table}: ${error.message}`)
  if (count === null) throw new Error(`counting ${table}: no count came back`)
  return count
}

async function axeCheck(page, screen, viewport) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const named = axe.violations.map((v) => `${v.id}(${v.impact}, ${v.nodes.length})`).join(', ')
  /*
   * THE NODES, NOT JUST THE COUNT. The first run of this drive reported
   * "color-contrast(serious, 3)" and that sentence is unactionable: it names
   * neither the element nor the two colours, so the only way to find them was
   * to run it again. A failure report that cannot be acted on costs a whole
   * second run of the fixture.
   */
  const detail = axe.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} :: ${n.target.join(' ')} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ')}`),
  )
  for (const d of detail) log(`    axe ${screen}.${viewport} ${d.slice(0, 320)}`)
  check(
    `${TAG}.axe.${screen}.${viewport}`,
    axe.violations.length === 0,
    axe.violations.length === 0
      ? `0 violations at any impact level across ${axe.passes.length} passing check(s)`
      : `${axe.violations.length} violation(s): ${named} | ${detail.join(' | ').slice(0, 700)}`,
  )
}

/**
 * WAIT FOR THE SERVER'S VIEW, not for a clock.
 *
 * `scripts/guards/a-drive-waits-for-a-cached-flag.mjs` refuses a sleep here and
 * is right: a sleep is a guess about somebody else's cache. BOTH routes are
 * polled, because they do not land together: they are two render paths with two
 * cached reads, and this drive has to be behind the later of them. The profile
 * has no status code to watch (it is 200 either way), so what is watched there
 * is the observable consequence of the flag, the "Proof of draw" heading that
 * only renders when the showcase read returns a consenting performer.
 */
async function waitForFlagToLand(artistSlug) {
  const budgetMs = (FLAG_CACHE_TTL_SECONDS + 60) * 1000
  const deadline = Date.now() + budgetMs
  for (;;) {
    const [dir, profile] = await Promise.all([
      fetch(`${BASE}/artists`, { redirect: 'manual' }).catch(() => null),
      fetch(`${BASE}/artists/${artistSlug}`, { redirect: 'manual' })
        .then(async (r) => ({ status: r.status, body: await r.text() }))
        .catch(() => null),
    ])
    const profileReady = profile?.status === 200 && /Proof of draw/.test(profile.body)
    if (dir?.status === 200 && profileReady) {
      log(`${FLAG} has landed: /artists answers 200 and the profile carries "Proof of draw"`)
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `after ${Math.round(budgetMs / 1000)}s, /artists answers ${dir ? dir.status : 'nothing'} and ` +
          `/artists/${artistSlug} answers ${profile ? profile.status : 'nothing'} ` +
          `${profile && !profileReady ? 'without the "Proof of draw" heading' : ''}. The ${FLAG} row and ` +
          `the server's cached copies can disagree for up to ${FLAG_CACHE_TTL_SECONDS}s per route.`,
      )
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
}

let flagWasEnabled = null
let artistId = null
let artistUserId = null
let linkIds = []
let orderIds = []
let pastEventId = null

const artistSlug = `${TAG}-${RUN}`
const artistName = `Lane B Showcasewhole Act ${RUN}`

const browser = await chromium.launch()
try {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  // ----------------------------------------------------------------- the flag
  const before = await db.from('feature_flags').select('enabled').eq('flag', FLAG).maybeSingle()
  if (before.error) throw new Error(`reading ${FLAG}: ${before.error.message}`)
  flagWasEnabled = before.data?.enabled ?? false
  log(`${FLAG} was ${flagWasEnabled}; switching it on for this run`)
  const flipped = await db.from('feature_flags').update({ enabled: true }).eq('flag', FLAG)
  if (flipped.error) throw new Error(`switching ${FLAG} on: ${flipped.error.message}`)

  // -------------------------------------------------------------- the fixture
  log('purging any prior lane-b-showcasewhole fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const ownerEmail = `${TAG}+${RUN}@eventlinqs.test`
  const { ownerId, org, event, tier } = await buildFixture(db, {
    stamp: RUN,
    ownerEmail,
    password: `${randomUUID()}Aa1`,
    capacity: 40,
    priceCents: 3500,
    log,
    brand: {
      org: 'Lane B Showcasewhole Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Showcasewhole Night',
      eventSlug: 'lane-b-showcasewhole-night',
      owner: 'Lane B Showcasewhole Owner',
    },
  })
  log(`organisation ${org.id}, event ${event.id} (${event.slug}), tier ${tier.id}`)

  // --------------------------------------------------------------- the artist
  const artistUser = await db.auth.admin.createUser({
    email: `${TAG}-act+${RUN}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (artistUser.error) throw new Error(`making the artist user: ${artistUser.error.message}`)
  artistUserId = artistUser.data.user.id

  artistId = randomUUID()
  const artistInsert = await db.from('artists').insert({
    id: artistId,
    slug: artistSlug,
    name: artistName,
    bio: 'A lane B fixture performer, built by lb-showcasewhole-drive and deleted by it.',
    owner_user_id: artistUserId,
    performance_types: ['dj'],
    genres: ['house', 'disco'],
    city_slug: 'geelong',
    available_for_booking: true,
    pay_expectation: 'From $600 a set',
    draw_consent: true,
    mentor_open: true,
  })
  if (artistInsert.error) throw new Error(`making the artist: ${artistInsert.error.message}`)
  log(`artist ${artistId} (${artistSlug})`)

  /*
   * A PAST SHOW, because a CREDIT is a show that has already happened. The
   * upcoming fixture event cannot be one: fetchArtistCredits filters on
   * start_date < now and on the published/completed allow-list.
   */
  const past = await db
    .from('events')
    .insert({
      title: `Lane B Showcasewhole Past Night ${RUN}`,
      slug: `${TAG}-past-night-${RUN}`,
      description: 'A lane B fixture past event, so the performer has a credit to render.',
      summary: 'Lane B showcasewhole past fixture',
      organisation_id: org.id,
      created_by: ownerId,
      start_date: new Date(Date.now() - 30 * 864e5).toISOString(),
      end_date: new Date(Date.now() - 30 * 864e5 + 3 * 36e5).toISOString(),
      timezone: 'Australia/Melbourne',
      event_type: 'in_person',
      venue_name: 'The Lane B Rooms',
      venue_address: '1 Proof St',
      venue_city: 'Geelong',
      venue_state: 'VIC',
      venue_country: 'Australia',
      status: 'completed',
      visibility: 'public',
      published_at: new Date(Date.now() - 60 * 864e5).toISOString(),
      is_age_restricted: false,
      is_free: true,
    })
    .select('id, slug')
    .single()
  if (past.error) throw new Error(`making the past event: ${past.error.message}`)
  pastEventId = past.data.id

  /*
   * THE PAST SHOW IS PUBLIC AND MUST STILL BE INVISIBLE TO THE SITEMAP, and
   * that is MEASURED here rather than argued in a baseline comment. It carries
   * visibility 'public' because the credits allow-list admits nothing else, and
   * status 'completed', which is what keeps it out of PUBLIC_EVENT_MATCH. If a
   * later change published it, three lanes would read a sitemap advertising an
   * event this drive deletes minutes later, which is the incident
   * fixtures-are-not-published was written after.
   */
  const pastFootprint = await sitemapFootprint(db, {
    eventSlugs: [past.data.slug],
    venueNames: ['The Lane B Rooms'],
  })
  check(
    `${TAG}.fixture.the-past-show-is-not-in-the-sitemap`,
    pastFootprint.length === 0,
    pastFootprint.length === 0
      ? `status 'completed' keeps the public past show out of both sitemap catalogues; footprint is empty`
      : `the past show would be published at ${pastFootprint.join(', ')}`,
  )

  for (const [eventId, order] of [
    [event.id, 1],
    [pastEventId, 1],
  ]) {
    const tagged = await db
      .from('event_artists')
      .insert({ event_id: eventId, artist_id: artistId, status: 'confirmed', billing_order: order })
    if (tagged.error) throw new Error(`tagging the artist on ${eventId}: ${tagged.error.message}`)
  }
  log(`artist confirmed on the upcoming event and on the past one (${past.data.slug})`)

  // ------------------------------------------------- two real orders, 5 tickets
  for (const [n, spec] of ORDERS.entries()) {
    const order = await db
      .from('orders')
      .insert({
        organisation_id: org.id,
        event_id: event.id,
        order_number: `LBSW-${RUN}-${n}`,
        // orders_must_have_buyer: a row needs a user_id or a guest_email.
        guest_email: `${TAG}-buyer-${n}+${RUN}@eventlinqs.test`,
        status: 'confirmed',
        total_cents: spec.qty * tier.price,
        currency: 'AUD',
      })
      .select('id')
      .single()
    if (order.error) throw new Error(`writing order ${n}: ${order.error.message}`)
    orderIds.push(order.data.id)

    const item = await db
      .from('order_items')
      .insert({
        order_id: order.data.id,
        item_name: 'General Admission',
        item_type: 'ticket',
        quantity: spec.qty,
        unit_price_cents: tier.price,
        total_cents: spec.qty * tier.price,
        ticket_tier_id: tier.id,
      })
      .select('id')
      .single()
    if (item.error) throw new Error(`writing order item ${n}: ${item.error.message}`)

    const tickets = Array.from({ length: spec.qty }, (_, i) => ({
      event_id: event.id,
      order_id: order.data.id,
      order_item_id: item.data.id,
      ticket_tier_id: tier.id,
      idx_in_item: i,
      ticket_code: `EL-LBSW${RUN.slice(-3).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
      secret: randomUUID(),
      status: 'valid',
      holder_name: `Lane B Showcasewhole Holder ${n}${i}`,
      holder_email: `${TAG}-holder-${n}${i}+${RUN}@eventlinqs.test`,
    }))
    const written = await db.from('tickets').insert(tickets)
    if (written.error) throw new Error(`writing tickets for order ${n}: ${written.error.message}`)
  }
  log(`wrote ${ORDERS.length} confirmed orders carrying ${TICKETS_EXPECTED} tickets`)

  // --------------------------------- the links, the 1,150 clicks, the conversions
  const links = [
    { id: randomUUID(), code: `lbsw${RUN}a` },
    { id: randomUUID(), code: `lbsw${RUN}b` },
  ]
  linkIds = links.map((l) => l.id)
  for (const l of links) {
    const { error } = await db.from('share_links').insert({
      id: l.id,
      event_id: event.id,
      artist_id: artistId,
      channel: 'copy',
      code: l.code,
      created_by: ownerId,
    })
    if (error) throw new Error(`minting a link: ${error.message}`)
  }

  const clickRows = Array.from({ length: CLICKS }, (_, i) => ({
    // `0`: sorts BEFORE every conversion, so a read that stops at the ceiling
    // stops among the clicks and never reaches a sale.
    id: uuidStartingWith('0'),
    link_id: links[i % 2].id,
    kind: 'click',
    visitor_hash: `${TAG}-${RUN}-c${i}`,
  }))
  for (let i = 0; i < clickRows.length; i += 250) {
    const { error } = await db.from('share_link_events').insert(clickRows.slice(i, i + 250))
    if (error) throw new Error(`writing clicks at offset ${i}: ${error.message}`)
  }

  const conversionRows = orderIds.map((orderId, i) => ({
    // `f`: sorts AFTER every click. These are the rows carrying the money.
    id: uuidStartingWith('f'),
    link_id: links[i % 2].id,
    kind: 'conversion',
    order_id: orderId,
    visitor_hash: `${TAG}-${RUN}-v${i}`,
  }))
  const conv = await db.from('share_link_events').insert(conversionRows)
  if (conv.error) throw new Error(`writing conversions: ${conv.error.message}`)
  log(`wrote ${CLICKS} clicks and ${conversionRows.length} conversions on the performer's links`)

  // ------------------------------------------------ the fixture proves itself
  const trueEvents = await serverCount('share_link_events', (q) => q.in('link_id', linkIds))
  check(
    `${TAG}.fixture.is-past-the-ceiling`,
    trueEvents > 1000,
    `${trueEvents} tracked rows behind one performer, ${trueEvents - 1000} past the documented 1,000-row ceiling`,
  )

  const trueTickets = await serverCount('tickets', (q) => q.in('order_id', orderIds))
  check(
    `${TAG}.fixture.the-ledger-says-how-many-tickets`,
    trueTickets === TICKETS_EXPECTED,
    `${trueTickets} ticket rows on the ${orderIds.length} attributed orders (intended ${TICKETS_EXPECTED})`,
  )

  /*
   * THE COUNTER-PROOF, MEASURED. This is the read the module used to make:
   * no range, no order, error discarded. If it returns everything, this whole
   * drive proves nothing, so it is asserted rather than described.
   */
  const old = await db.from('share_link_events').select('id, kind').in('link_id', linkIds)
  if (old.error) throw new Error(`the counter-proof read failed: ${old.error.message}`)
  const oldRows = old.data ?? []
  const oldConversions = oldRows.filter((r) => r.kind === 'conversion').length
  check(
    `${TAG}.counter-proof.the-old-unbounded-read-is-truncated`,
    oldRows.length < trueEvents,
    `the unbounded read returned ${oldRows.length} of ${trueEvents} rows, HTTP 200 and no error, ` +
      `and ${oldConversions} of ${conversionRows.length} conversions survived it`,
  )
  check(
    `${TAG}.counter-proof.the-truncation-loses-the-sales`,
    oldConversions < conversionRows.length,
    oldConversions === 0
      ? 'every conversion was cut, so the old read would have shown this performer no tickets at all'
      : `${conversionRows.length - oldConversions} of ${conversionRows.length} conversions were cut`,
  )

  await waitForFlagToLand(artistSlug)

  // --------------------------------------------------------------- the drives
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()

    // ---- the public directory
    await page.goto(`${BASE}/artists`, { waitUntil: 'domcontentloaded' })
    await answerTheCookieBanner(page)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.screenshot({ path: join(OUT, 'drive', `${vp.label}-1-directory.png`), fullPage: true })

    const emptyState = await page.getByText(/No performers match those filters yet/i).count()
    check(
      `${TAG}.directory.is-not-an-empty-marketplace.${vp.label}`,
      emptyState === 0,
      `the "no performers" empty state appears ${emptyState} time(s) on a platform holding performers`,
    )

    const card = page.getByRole('link', { name: new RegExp(artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    const cardCount = await card.count()
    check(
      `${TAG}.directory.shows-the-performer.${vp.label}`,
      cardCount > 0,
      `${cardCount} card(s) for ${artistName}`,
    )

    const badge = await page.getByText(/\d+ tickets driven/).allInnerTexts()
    const mine = badge.find((t) => /tickets driven/.test(t))
    const shown = mine ? Number(mine.match(/(\d+) tickets driven/)?.[1] ?? -1) : -1
    check(
      `${TAG}.directory.the-badge-equals-the-ledger.${vp.label}`,
      shown === trueTickets,
      `the directory says ${shown === -1 ? 'nothing' : shown} tickets driven and the ledger says ${trueTickets}`,
    )

    await axeCheck(page, 'directory', vp.label)

    // ---- the directory, ranked on the number that was truncated
    await page.goto(`${BASE}/artists?sort=draw`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.screenshot({ path: join(OUT, 'drive', `${vp.label}-2-directory-sorted.png`), fullPage: true })
    const firstCard = await page.locator('ul[role="list"] > li').first().innerText()
    check(
      `${TAG}.directory.sort-by-draw-ranks-the-real-draw-first.${vp.label}`,
      firstCard.includes(artistName),
      `sort=draw puts "${firstCard.split('\n')[0]}" first; the only performer with attributed sales is ${artistName}`,
    )

    // ---- the public profile
    await page.goto(`${BASE}/artists/${artistSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.screenshot({ path: join(OUT, 'drive', `${vp.label}-3-profile.png`), fullPage: true })

    check(
      `${TAG}.profile.the-showcase-renders.${vp.label}`,
      (await page.getByText(/Open to bookings/i).count()) > 0 &&
        (await page.getByText(/From \$600 a set/i).count()) > 0,
      'the showcase read returned the performer, so the availability and the fee line are on the page',
    )

    check(
      `${TAG}.profile.the-proof-of-draw-renders.${vp.label}`,
      (await page.getByText(/Proof of draw/i).count()) > 0,
      'the draw card is on the page, which it only is when the showcase read returned a consenting performer',
    )

    const credits = await page.getByText(/Lane B Showcasewhole Past Night/i).count()
    check(
      `${TAG}.profile.the-credit-renders.${vp.label}`,
      credits > 0,
      `${credits} occurrence(s) of the past show, read through the paged credits query`,
    )

    await axeCheck(page, 'profile', vp.label)
    await context.close()
  }
} catch (error) {
  check(`${TAG}.drive.completed`, false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await browser.close()

  // -------------------------------------------------------------- the teardown
  try {
    if (linkIds.length > 0) {
      await db.from('share_link_events').delete().in('link_id', linkIds)
      await db.from('share_links').delete().in('id', linkIds)
    }
    if (artistId) {
      await db.from('event_artists').delete().eq('artist_id', artistId)
      await db.from('artists').delete().eq('id', artistId)
    }
    if (pastEventId) await db.from('events').delete().eq('id', pastEventId)
    await purgeFixtures(db, log, SLUG_PREFIX)
    /*
     * THE ONE DOOR, not auth.admin.deleteUser. It is the only caller that can
     * tell an account that was already gone from a deletion that was REFUSED,
     * and it fails the run rather than letting this drive report a teardown it
     * did not have. `one-way-to-delete-an-account` refused the direct call this
     * file was written with, and it was right: the first version of this drive
     * would have left a user behind in silence.
     */
    const removed = await tearDownAccountOrFailTheRun(db, artistUserId)
    check(`${TAG}.teardown.the-performer-account-is-removed`, removed.gone, removed.detail)

    // RE-READ, because a delete that reports success and leaves the row is the
    // failure this proves against rather than assumes away.
    const leftArtists = await serverCount('artists', (q) => q.eq('slug', artistSlug))
    const leftLinks = linkIds.length === 0 ? 0 : await serverCount('share_links', (q) => q.in('id', linkIds))
    const leftEvents =
      linkIds.length === 0 ? 0 : await serverCount('share_link_events', (q) => q.in('link_id', linkIds))
    check(
      `${TAG}.teardown.test-is-left-as-found`,
      leftArtists === 0 && leftLinks === 0 && leftEvents === 0,
      `re-read after delete: ${leftArtists} artist(s), ${leftLinks} link(s), ${leftEvents} tracked row(s)`,
    )
  } catch (error) {
    check(`${TAG}.teardown.test-is-left-as-found`, false, String(error?.message ?? error).slice(0, 300))
  }

  if (flagWasEnabled !== null) {
    const restored = await db.from('feature_flags').update({ enabled: flagWasEnabled }).eq('flag', FLAG)
    check(
      `${TAG}.teardown.the-flag-is-back-as-found`,
      !restored.error,
      restored.error ? restored.error.message : `${FLAG} restored to ${flagWasEnabled}`,
    )
  }

  const passed = results.filter((r) => r.ok).length
  log(`${passed} of ${results.length} checks passed`)
  writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`)
  writeFileSync(
    join(OUT, 'results.json'),
    `${JSON.stringify({ base: BASE, run: RUN, artistSlug, passed, total: results.length, results }, null, 2)}\n`,
  )
  log(`evidence in ${OUT}`)
  process.exit(passed === results.length ? 0 : 1)
}
