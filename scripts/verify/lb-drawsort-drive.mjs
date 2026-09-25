/**
 * LB-DRAWSORT, DRIVEN: "STRONGEST DRAW FIRST" AGAINST A PLATFORM LARGER THAN
 * ONE PAGE OF IT.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DRIVE EXISTS RATHER THAN THE UNIT TESTS ALONE. The unit tests fake
 * the server, so they prove the module ASKS the database to rank and preserves
 * the order it gets back. They cannot prove the SQL ranks, and they cannot
 * reproduce the condition the defect needed: more performers than the page
 * bound, with the strongest draw outside the alphabetical prefix. TEST holds
 * five performers, so on TEST the alphabetical order and the draw order are the
 * same order and the broken code passes every check anybody would think to
 * write. That is exactly why it survived a driven proof of the numbers on
 * 19 September and was recorded as found-and-not-fixed instead.
 *
 * ---------------------------------------------------------------------------
 * THE FIXTURE IS BUILT SO THE DEFECT WOULD HAVE BEEN VISIBLE.
 *
 *   47 filler performers  named "Lane B Drawsort Filler NNN", so that together
 *                         with the rows already on TEST there are at least 48
 *                         names sorting BEFORE the headliner. One of them
 *                         (Filler 007) carries a small consented draw, so the
 *                         ranked page has more than one non-zero number on it
 *                         and "non-increasing" is a real assertion.
 *   the headliner         "Lane B Drawsort Zenith Headliner", consented, with
 *                         the largest attributed draw on the platform. Her name
 *                         sorts past the page bound, so the OLD read could not
 *                         reach her and the OLD sort could not rank her.
 *   the withheld one      "Lane B Drawsort Aaa Withheld", draw_consent FALSE,
 *                         carrying MORE real attributed tickets than the
 *                         headliner. Her name sorts early, so she is on the
 *                         ranked page, where she must appear with no badge and
 *                         BELOW a performer with two published tickets. That is
 *                         the disclosure half: position is disclosure, so a
 *                         number nobody consented to publish may not place them.
 *
 * AND THE COUNTER-PROOF IS MEASURED, NOT ASSUMED. Before driving anything this
 * file issues the OLD read (48 rows ORDER BY name) against the real project and
 * records whether the headliner survived it. If she does, the fixture is not
 * past the page bound and this drive says so and fails rather than reporting a
 * pass it did not earn.
 *
 * WHAT IT LEAVES ON TEST: nothing, and the flag is back as found. Everything
 * hangs off `lane-b-drawsort-`, deleted and then RE-READ to prove it went.
 *
 * Run (dev server on 3100 against TEST):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   node --env-file=.env.local scripts/verify/lb-drawsort-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-DRAWSORT
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-DRAWSORT'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const TAG = 'lane-b-drawsort'
const SLUG_PREFIX = `${TAG}-presents`
const RUN = Date.now().toString(36)
const FLAG = 'artist_showcase'
/** The resolver's cache TTL. Read from the product rather than typed here. */
const FLAG_CACHE_TTL_SECONDS = 30

/** The page bound the directory applies, read from the product's own default. */
const PAGE_BOUND = 48
/** Enough filler that, with the rows already on TEST, the headliner is past it. */
const FILLERS = 47
/** The filler that carries a small published draw, so the page has a gradient. */
const FILLER_WITH_DRAW = 7

/** tickets per order, by performer. The withheld one deliberately outsells. */
const DRAW = {
  headliner: [3, 3, 3, 3, 3, 3],
  withheld: [5, 5, 5, 5, 5, 5, 5],
  filler: [2],
}

const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

/**
 * The performer's name out of a card's text. Line 0 is the avatar's initials,
 * so `split()[0]` reports "LB" and makes a passing check read like a failing
 * one; the first version of this drive printed exactly that.
 */
const nameOn = (text) =>
  (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[1] ?? '(nothing)'

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
 * WAIT FOR THE SERVER'S VIEW, not for a clock. A sleep is a guess about
 * somebody else's cache, and `scripts/guards/a-drive-waits-for-a-cached-flag.mjs`
 * refuses one here. Both routes are polled because each has its own cached read.
 */
async function waitForFlagToLand() {
  const budgetMs = (FLAG_CACHE_TTL_SECONDS + 60) * 1000
  const deadline = Date.now() + budgetMs
  for (;;) {
    const [plain, ranked] = await Promise.all([
      fetch(`${BASE}/artists`, { redirect: 'manual' }).catch(() => null),
      fetch(`${BASE}/artists?sort=draw`, { redirect: 'manual' }).catch(() => null),
    ])
    if (plain?.status === 200 && ranked?.status === 200) {
      log(`${FLAG} has landed: /artists and /artists?sort=draw both answer 200`)
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `after ${Math.round(budgetMs / 1000)}s, /artists answers ${plain ? plain.status : 'nothing'} and ` +
          `/artists?sort=draw answers ${ranked ? ranked.status : 'nothing'}. The ${FLAG} row and the ` +
          `server's cached copies can disagree for up to ${FLAG_CACHE_TTL_SECONDS}s per route.`,
      )
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
}

/** The names, built once so the fixture and the assertions cannot disagree. */
const NAME = {
  headliner: `Lane B Drawsort Zenith Headliner ${RUN}`,
  withheld: `Lane B Drawsort Aaa Withheld ${RUN}`,
  filler: (n) => `Lane B Drawsort Filler ${String(n).padStart(3, '0')} ${RUN}`,
}
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

let flagWasEnabled = null
let artistIds = []
let artistUserId = null
let linkIds = []
let orderIds = []

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
  log('purging any prior lane-b-drawsort fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)
  await db.from('artists').delete().like('slug', `${TAG}-%`)

  const ownerEmail = `${TAG}+${RUN}@eventlinqs.test`
  const { ownerId, org, event, tier } = await buildFixture(db, {
    stamp: RUN,
    ownerEmail,
    password: `${randomUUID()}Aa1`,
    capacity: 200,
    priceCents: 3500,
    log,
    brand: {
      org: 'Lane B Drawsort Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Drawsort Night',
      eventSlug: 'lane-b-drawsort-night',
      owner: 'Lane B Drawsort Owner',
    },
  })
  log(`organisation ${org.id}, event ${event.id} (${event.slug}), tier ${tier.id}`)

  const artistUser = await db.auth.admin.createUser({
    email: `${TAG}-act+${RUN}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (artistUser.error) throw new Error(`making the artist user: ${artistUser.error.message}`)
  artistUserId = artistUser.data.user.id

  /** Every performer this drive writes, with the row it is built from. */
  const cast = [
    { key: 'headliner', name: NAME.headliner, consent: true, owner: artistUserId },
    { key: 'withheld', name: NAME.withheld, consent: false, owner: null },
    ...Array.from({ length: FILLERS }, (_, i) => ({
      key: `filler-${i + 1}`,
      name: NAME.filler(i + 1),
      consent: i + 1 === FILLER_WITH_DRAW,
      owner: null,
    })),
  ]
  const idOf = new Map()
  const rows = cast.map((c) => {
    const id = randomUUID()
    idOf.set(c.key, id)
    return {
      id,
      slug: slugOf(c.name),
      name: c.name,
      bio: 'A lane B fixture performer, built by lb-drawsort-drive and deleted by it.',
      owner_user_id: c.owner,
      performance_types: ['dj'],
      genres: ['house'],
      city_slug: 'geelong',
      available_for_booking: true,
      draw_consent: c.consent,
      mentor_open: false,
    }
  })
  for (let i = 0; i < rows.length; i += 25) {
    const { error } = await db.from('artists').insert(rows.slice(i, i + 25))
    if (error) throw new Error(`writing performers at offset ${i}: ${error.message}`)
  }
  artistIds = rows.map((r) => r.id)
  log(`wrote ${rows.length} performers, ${rows.filter((r) => r.draw_consent).length} of them consenting`)

  /**
   * Attributed draw for one performer: a share link, one confirmed order per
   * entry in `quantities`, the tickets on it, and a conversion row claiming it.
   * Every row is real, through the same tables the badge and the ranking read.
   */
  async function giveDraw(key, quantities) {
    const artistId = idOf.get(key)
    const linkId = randomUUID()
    const link = await db.from('share_links').insert({
      id: linkId,
      event_id: event.id,
      artist_id: artistId,
      channel: 'copy',
      code: `lbds${RUN}${key.replace(/[^a-z0-9]/g, '').slice(-6)}`,
      created_by: ownerId,
    })
    if (link.error) throw new Error(`minting the link for ${key}: ${link.error.message}`)
    linkIds.push(linkId)

    let written = 0
    for (const [n, qty] of quantities.entries()) {
      const order = await db
        .from('orders')
        .insert({
          organisation_id: org.id,
          event_id: event.id,
          order_number: `LBDS-${RUN}-${key}-${n}`.slice(0, 40),
          guest_email: `${TAG}-buyer-${key}-${n}+${RUN}@eventlinqs.test`,
          status: 'confirmed',
          total_cents: qty * tier.price,
          currency: 'AUD',
        })
        .select('id')
        .single()
      if (order.error) throw new Error(`writing an order for ${key}: ${order.error.message}`)
      orderIds.push(order.data.id)

      const item = await db
        .from('order_items')
        .insert({
          order_id: order.data.id,
          item_name: 'General Admission',
          item_type: 'ticket',
          quantity: qty,
          unit_price_cents: tier.price,
          total_cents: qty * tier.price,
          ticket_tier_id: tier.id,
        })
        .select('id')
        .single()
      if (item.error) throw new Error(`writing an order item for ${key}: ${item.error.message}`)

      const tickets = Array.from({ length: qty }, (_, i) => ({
        event_id: event.id,
        order_id: order.data.id,
        order_item_id: item.data.id,
        ticket_tier_id: tier.id,
        idx_in_item: i,
        ticket_code: `EL-LBDS${RUN.slice(-3).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        secret: randomUUID(),
        status: 'valid',
        holder_name: `Lane B Drawsort Holder ${key} ${n}${i}`,
        holder_email: `${TAG}-holder-${key}-${n}${i}+${RUN}@eventlinqs.test`,
      }))
      const put = await db.from('tickets').insert(tickets)
      if (put.error) throw new Error(`writing tickets for ${key}: ${put.error.message}`)

      const conv = await db.from('share_link_events').insert({
        link_id: linkId,
        kind: 'conversion',
        order_id: order.data.id,
        visitor_hash: `${TAG}-${RUN}-${key}-${n}`,
      })
      if (conv.error) throw new Error(`writing the conversion for ${key}: ${conv.error.message}`)
      written += qty
    }
    return written
  }

  const headlinerTickets = await giveDraw('headliner', DRAW.headliner)
  const withheldTickets = await giveDraw('withheld', DRAW.withheld)
  const fillerTickets = await giveDraw(`filler-${FILLER_WITH_DRAW}`, DRAW.filler)
  log(
    `attributed draw written: headliner ${headlinerTickets}, withheld ${withheldTickets} (not consented), ` +
      `filler ${FILLER_WITH_DRAW} ${fillerTickets}`,
  )

  check(
    `${TAG}.fixture.the-withheld-performer-outsells-the-headliner`,
    withheldTickets > headlinerTickets,
    `the performer who did NOT consent has ${withheldTickets} attributed tickets against the ` +
      `headliner's ${headlinerTickets}, so if consent stopped gating the position she would be first`,
  )

  // ------------------------------------------------ the fixture proves itself
  const totalArtists = await serverCount('artists', (q) => q)
  check(
    `${TAG}.fixture.the-platform-is-larger-than-one-page`,
    totalArtists > PAGE_BOUND,
    `${totalArtists} performers on TEST against a page bound of ${PAGE_BOUND}`,
  )

  /*
   * THE COUNTER-PROOF, MEASURED. This is the read the page used to make: 48
   * rows ORDER BY name, id. If the headliner is inside it, the fixture does not
   * reproduce the defect and nothing below proves anything.
   */
  const old = await db
    .from('artists')
    .select('id, name')
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(PAGE_BOUND)
  if (old.error) throw new Error(`the counter-proof read failed: ${old.error.message}`)
  const oldNames = (old.data ?? []).map((r) => r.name)
  check(
    `${TAG}.counter-proof.the-old-read-never-reached-the-headliner`,
    !oldNames.includes(NAME.headliner),
    `the old page read returned ${oldNames.length} performers ordered by name and "${NAME.headliner}" ` +
      `is ${oldNames.includes(NAME.headliner) ? 'AMONG THEM' : 'not among them'}; the last one it ` +
      `reached was "${oldNames[oldNames.length - 1]}"`,
  )

  /*
   * AND WHAT THE OLD SORT WOULD HAVE SHOWN, computed from the same 48 rows the
   * old read returned, through the ranking the database now does. A number
   * rather than an argument: this is the page the promoter used to be given.
   */
  const oldIds = (old.data ?? []).map((r) => r.id)
  const oldRanked = await db.rpc('directory_artists_ranked_by_draw', { p_limit: 10000 })
  if (oldRanked.error) throw new Error(`reading the ranking: ${oldRanked.error.message}`)
  const rankAll = oldRanked.data ?? []
  const rankById = new Map(rankAll.map((r) => [r.artist_id, r.published_tickets]))
  const oldTop = oldIds
    .map((id) => ({ id, tickets: rankById.get(id) ?? 0 }))
    .sort((a, b) => b.tickets - a.tickets)[0]
  check(
    `${TAG}.counter-proof.the-old-sort-ranked-a-weaker-performer-first`,
    (oldTop?.tickets ?? 0) < headlinerTickets,
    `sorting the old 48 rows by draw puts a performer with ${oldTop?.tickets ?? 0} published tickets ` +
      `first, while the platform's strongest published draw is the headliner's ${headlinerTickets}`,
  )

  // --------------------------------------- the database's own answer, read back
  const topThree = rankAll.slice(0, 3)
  check(
    `${TAG}.rank.the-database-puts-the-headliner-first`,
    topThree[0]?.artist_id === idOf.get('headliner'),
    `the ranking function returns ${topThree.map((r) => r.published_tickets).join(', ')} at the top ` +
      `and its first row is ${topThree[0]?.artist_id === idOf.get('headliner') ? 'the headliner' : 'somebody else'}`,
  )
  check(
    `${TAG}.rank.a-withheld-draw-is-published-as-zero`,
    rankById.get(idOf.get('withheld')) === 0,
    `the performer with ${withheldTickets} attributed tickets and no consent is ranked on ` +
      `${rankById.get(idOf.get('withheld'))}, so her position publishes nothing`,
  )

  await waitForFlagToLand()

  // --------------------------------------------------------------- the drives
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()

    await page.goto(`${BASE}/artists?sort=draw`, { waitUntil: 'domcontentloaded' })
    await answerTheCookieBanner(page)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.screenshot({ path: join(OUT, 'drive', `${vp.label}-1-ranked.png`), fullPage: true })

    /*
     * SCOPED TO `main`, AND THE FIRST VERSION OF THIS DRIVE WAS NOT. A bare
     * `ul[role="list"] > li` counted 53 items against a page bound of 48 and
     * reported the product as wrong three times at three viewports. The extra
     * five were `MobileBottomNav`, which src/app/layout.tsx renders at the root
     * on every route and which is a `ul[role="list"]` of its own. The footer is
     * outside `<main>` too, so this is the directory's list and nothing else.
     */
    const cards = page.locator('main ul[role="list"] > li')
    const cardTexts = await cards.allInnerTexts()
    check(
      `${TAG}.ranked.the-page-is-a-full-page.${vp.label}`,
      cardTexts.length === PAGE_BOUND,
      `${cardTexts.length} cards rendered against a page bound of ${PAGE_BOUND}`,
    )

    check(
      `${TAG}.ranked.the-strongest-draw-is-first.${vp.label}`,
      (cardTexts[0] ?? '').includes(NAME.headliner),
      `the first card is "${nameOn(cardTexts[0])}" and the platform's strongest ` +
        `published draw is "${NAME.headliner}" with ${headlinerTickets} tickets`,
    )

    const headlinerBadge = Number(
      (cardTexts[0] ?? '').match(/(\d+) tickets driven/)?.[1] ?? -1,
    )
    check(
      `${TAG}.ranked.the-badge-equals-the-ledger.${vp.label}`,
      headlinerBadge === headlinerTickets,
      `the first card says ${headlinerBadge === -1 ? 'nothing' : headlinerBadge} tickets driven and ` +
        `the ledger says ${headlinerTickets}`,
    )

    /*
     * THE ORDER AND THE NUMBERS ARE ONE TRUTH. The order comes from the query
     * and the number inside each card comes from the TypeScript; a divergence
     * renders as 40, 120, 90 down the page, so it is asserted rather than
     * assumed.
     */
    const badges = cardTexts.map((t) => Number(t.match(/(\d+) tickets driven/)?.[1] ?? 0))
    const firstDrop = badges.findIndex((n, i) => i > 0 && n > badges[i - 1])
    check(
      `${TAG}.ranked.the-badges-never-increase-down-the-page.${vp.label}`,
      firstDrop === -1,
      firstDrop === -1
        ? `${badges.filter((n) => n > 0).length} card(s) carry a number and the sequence is ` +
          `non-increasing: ${badges.slice(0, 6).join(', ')}, ...`
        : `card ${firstDrop + 1} shows ${badges[firstDrop]} after card ${firstDrop} showed ${badges[firstDrop - 1]}`,
    )

    const withheldAt = cardTexts.findIndex((t) => t.includes(NAME.withheld))
    const fillerAt = cardTexts.findIndex((t) => t.includes(NAME.filler(FILLER_WITH_DRAW)))
    check(
      `${TAG}.ranked.a-withheld-draw-does-not-place-the-performer.${vp.label}`,
      withheldAt > -1 && fillerAt > -1 && fillerAt < withheldAt,
      `the performer with ${withheldTickets} unconsented tickets is at position ${withheldAt + 1} and ` +
        `the performer with ${fillerTickets} PUBLISHED tickets is at position ${fillerAt + 1}; ` +
        `position is disclosure, so the published one must rank above`,
    )
    check(
      `${TAG}.ranked.a-withheld-draw-shows-no-badge.${vp.label}`,
      withheldAt > -1 && !/tickets driven/.test(cardTexts[withheldAt] ?? ''),
      `the withheld performer's card reads "${(cardTexts[withheldAt] ?? '').replace(/\n/g, ' / ').slice(0, 120)}"`,
    )

    await axeCheck(page, 'ranked', vp.label)

    /*
     * LAW 5, BY CLICKING RATHER THAN BY REASONING. This item changed the READ
     * that supplies the cards and no href in the markup, so "the links cannot
     * have broken" is true and is an INFERENCE, which the law does not accept.
     * The first ranked card is followed and the profile it lands on has to
     * answer 200 and carry this performer's name.
     */
    const firstHref = await cards.first().locator('a').first().getAttribute('href')
    const landed = await page.goto(`${BASE}${firstHref}`, { waitUntil: 'domcontentloaded' })
    const nameOnProfile = await page.getByText(NAME.headliner, { exact: false }).count()
    check(
      `${TAG}.ranked.the-first-card-is-a-working-link.${vp.label}`,
      landed?.status() === 200 && nameOnProfile > 0,
      `${firstHref} answered ${landed?.status()} and names the performer ${nameOnProfile} time(s)`,
    )
    await page.screenshot({ path: join(OUT, 'drive', `${vp.label}-3-profile.png`), fullPage: true })

    // ---- and the unranked page still answers, unchanged
    await page.goto(`${BASE}/artists`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.screenshot({ path: join(OUT, 'drive', `${vp.label}-2-unranked.png`), fullPage: true })
    const plain = await page.locator('main ul[role="list"] > li').allInnerTexts()
    check(
      `${TAG}.unranked.is-still-ordered-by-name.${vp.label}`,
      plain.length === PAGE_BOUND && !(plain[0] ?? '').includes(NAME.headliner),
      `${plain.length} cards, the first being "${nameOn(plain[0])}"; the default ` +
        `order is by name and is deliberately unchanged by this item`,
    )

    await axeCheck(page, 'unranked', vp.label)
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
    if (artistIds.length > 0) {
      for (let i = 0; i < artistIds.length; i += 50) {
        await db.from('event_artists').delete().in('artist_id', artistIds.slice(i, i + 50))
        await db.from('artists').delete().in('id', artistIds.slice(i, i + 50))
      }
    }
    await purgeFixtures(db, log, SLUG_PREFIX)
    /*
     * THE ONE DOOR, not auth.admin.deleteUser: it is the only caller that can
     * tell an account that was already gone from a deletion that was REFUSED,
     * and it fails the run rather than letting this drive report a teardown it
     * did not have.
     */
    const removed = await tearDownAccountOrFailTheRun(db, artistUserId)
    check(`${TAG}.teardown.the-performer-account-is-removed`, removed.gone, removed.detail)

    // RE-READ, because a delete that reports success and leaves the row is the
    // failure this proves against rather than assumes away.
    const leftArtists = await serverCount('artists', (q) => q.like('slug', `${TAG}-%`))
    const leftLinks = linkIds.length === 0 ? 0 : await serverCount('share_links', (q) => q.in('id', linkIds))
    const leftEvents =
      linkIds.length === 0 ? 0 : await serverCount('share_link_events', (q) => q.in('link_id', linkIds))
    check(
      `${TAG}.teardown.test-is-left-as-found`,
      leftArtists === 0 && leftLinks === 0 && leftEvents === 0,
      `re-read after delete: ${leftArtists} performer(s), ${leftLinks} link(s), ${leftEvents} tracked row(s)`,
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
    `${JSON.stringify({ base: BASE, run: RUN, passed, total: results.length, results }, null, 2)}\n`,
  )
  log(`evidence in ${OUT}`)
  process.exit(passed === results.length ? 0 : 1)
}
