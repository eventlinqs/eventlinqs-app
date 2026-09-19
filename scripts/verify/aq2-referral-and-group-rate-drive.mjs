/**
 * AQ2, DRIVEN: A SHARE LINK THAT PRODUCES AN ATTRIBUTED ORDER, AND A PRICE THE
 * DATABASE REFUSES.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by two different people clicking what people click.
 *
 *   1. THE WHOLE REFERRAL CHAIN, END TO END. A signed-in buyer buys a ticket,
 *      shares the event from their own confirmation page, and a SECOND person,
 *      in a browser that has never seen this platform, arrives through that
 *      short link and buys. The conversion row lands against the second order
 *      and names the first person's link. That is AQ2 acceptance 1, and it is
 *      the only way to prove it: a mocked cookie proves the mock works.
 *
 *   2. THE COEFFICIENT COUNTS IT, AND REPORTS IT. The organiser's reach page
 *      shows new buyers per buyer for that event, and the number moves because
 *      of what happened in step 1 rather than because of a fixture.
 *
 *   3. THE SHARER SEES IT. The first person opens their tickets and is told,
 *      in words, that somebody bought through a link they shared.
 *
 *   4. THE TICKET PAGE CAN BE SHARED AT ALL, at 390, 768 and 1440. Before AQ2
 *      the surface a buyer keeps open and opens again at the door was the one
 *      that asked nothing of them.
 *
 *   5. THE DATABASE REFUSES A GROUP RATE BELOW THE FLOOR. AQ2 acceptance 2, put
 *      to the real database rather than to a unit test's idea of it, including
 *      the cent either side of the floor and the floor the database itself
 *      derives from pricing_rules.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT LEAVES ON TEST: NOTHING, AND IT ASKS THE DATABASE RATHER THAN SAYING SO.
 *
 * Everything it creates hangs off ONE disposable organisation,
 * `lane-b-aq2-presents`, and purgeFixtures removes that organisation and every
 * row under it, orders and tickets included. It purges BEFORE it builds as well
 * as after, because a GA5 run left a published fixture on TEST for two days in
 * September 2026 and it refused lane A's push at the indexing step. The
 * teardown then RE-READS the database and reports what is actually left, so a
 * purge that half worked cannot report success.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/aq2-referral-and-group-rate-drive.mjs \
 *        --out C:/dev/EVIDENCE/AQ2
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 900 },
]

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const stamp = Date.now()
const FIXTURE_SLUG_PREFIX = 'lane-b-aq2-presents'
const ownerEmail = `lane-b-aq2-owner-${stamp}@eventlinqs.test`
const ownerPassword = `${randomUUID()}Aa1`
const sharerEmail = `lane-b-aq2-sharer-${stamp}@eventlinqs.test`
const sharerPassword = `${randomUUID()}Aa1`
const joinerEmail = `lane-b-aq2-joiner-${stamp}@eventlinqs.test`

let browser = null
let sharerId = null
let fixture = null
const groupRatesInserted = []

async function selectOneTicket(page, slug) {
  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1800)
  await answerTheCookieBanner(page)
  const opener = page.getByRole('button', { name: /^(get|buy) tickets$/i }).first()
  if ((await opener.count()) > 0 && (await opener.isEnabled().catch(() => false))) {
    await opener.click()
    await page.waitForTimeout(800)
  }
  await page.getByRole('button', { name: /^increase .+ quantity$/i }).first().click()
  await page.waitForTimeout(900)
}

async function fillTheCheckout(page, name, email) {
  await page.locator('#buyer-name').fill(name)
  await page.locator('#buyer-email').fill(email)
  const copyDown = page.getByRole('button', { name: /^use my details for all tickets$/i }).first()
  if ((await copyDown.count()) > 0) {
    await copyDown.click()
    await page.waitForTimeout(600)
  }
  const first = page.locator('#att-0-first')
  if ((await first.count()) > 0 && !(await first.inputValue())) {
    await first.fill(name.split(' ')[0] ?? 'Lane')
    await page.locator('#att-0-last').fill(name.split(' ').slice(1).join(' ') || 'B')
    await page.locator('#att-0-email').fill(email)
  }
}

try {
  /* ------------------------------------------------------------------ setup */
  const { data: shareFlag } = await db
    .from('feature_flags')
    .select('enabled')
    .eq('flag', 'broadcast_share')
    .maybeSingle()
  check(
    'aq2.setup.tracked-sharing-is-switched-on',
    shareFlag?.enabled === true,
    `feature_flags.broadcast_share = ${shareFlag?.enabled}. With it off the share bar correctly falls back to an untracked link and nothing below could be proved.`,
  )
  if (shareFlag?.enabled !== true) throw new Error('this drive needs broadcast_share on')

  /*
   * A DISPOSABLE ORGANISATION OF THIS LANE'S OWN, and the reason is the
   * organiser's reach page. AQ2 asks for the coefficient to be REPORTED per
   * event, which is a screen only that event's organiser can open. Borrowing a
   * real organiser's published event would prove the chain and leave the report
   * unproved, because this lane holds no password for them.
   *
   * buildFixture is the shape three lane B proofs already use, and
   * purgeFixtures removes the organisation and everything under it, orders
   * included. That matters here more than usual: a GA5 run left a published
   * fixture on TEST for two days in September and it refused lane A's push, so
   * this drive purges BEFORE it builds as well as after.
   */
  await purgeFixtures(db, line => console.log(`  purge: ${line}`), FIXTURE_SLUG_PREFIX)
  fixture = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: 20,
    priceCents: 0,
    log: line => console.log(`  fixture: ${line}`),
    brand: {
      org: 'Lane B AQ2 Presents',
      orgSlug: FIXTURE_SLUG_PREFIX,
      event: 'Lane B AQ2 Night',
      eventSlug: 'lane-b-aq2-night',
      owner: 'Lane B AQ2 Owner',
    },
  })
  const event = fixture.event
  check(
    'aq2.setup.an-event-two-people-can-buy',
    Boolean(event?.slug),
    `${event.slug}, a free event this lane owns and deletes, so the organiser's own reach page can be opened`,
  )

  const created = await db.auth.admin.createUser({
    email: sharerEmail,
    password: sharerPassword,
    email_confirm: true,
  })
  if (created.error) throw new Error(created.error.message)
  sharerId = created.data.user.id
  await db.from('profiles').upsert({ id: sharerId, email: sharerEmail, full_name: 'Lane B AQ2 Sharer' })

  browser = await chromium.launch({ headless: true })

  /* ----------------------------------- 1. the sharer buys, signed in, and shares */
  const sharerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const sharerPage = await sharerContext.newPage()
  await sharerPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await sharerPage.waitForTimeout(1200)
  await answerTheCookieBanner(sharerPage)
  await sharerPage.getByLabel(/email/i).first().fill(sharerEmail)
  await sharerPage.getByLabel(/password/i).first().fill(sharerPassword)
  await Promise.all([
    sharerPage.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
    sharerPage.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  await sharerPage.waitForTimeout(2000)
  check(
    'aq2.sharer.is-signed-in',
    !sharerPage.url().includes('/login'),
    `the sharer ended on ${sharerPage.url()}. Being signed in is what puts their id on the share link, and without it nothing below can prove who shared.`,
  )

  await selectOneTicket(sharerPage, event.slug)
  await sharerPage.getByRole('button', { name: /^(checkout|register) /i }).first().click()
  await sharerPage.waitForURL(u => /\/orders\//.test(u.pathname) || /\/checkout\//.test(u.pathname), {
    timeout: 120000,
  })
  if (/\/checkout\//.test(sharerPage.url())) {
    await fillTheCheckout(sharerPage, 'Lane B AQ2 Sharer', sharerEmail)
    await sharerPage.getByRole('button', { name: /register for free/i }).click()
    await sharerPage.waitForURL(u => /\/orders\//.test(u.pathname), { timeout: 120000 }).catch(() => {})
  }
  await sharerPage.waitForTimeout(2500)
  check(
    'aq2.sharer.bought-a-ticket',
    /\/orders\//.test(sharerPage.url()),
    `the sharer ended on ${sharerPage.url()}, so they hold a ticket and count as a buyer of this event`,
  )
  await sharerPage.screenshot({ path: join(out, 'desktop-1440-1-sharer-confirmation.png'), fullPage: false })

  /*
   * THE SHORT LINK IS READ OUT OF THE DATABASE, not scraped off the page. The
   * share bar mints its links through the API on mount and copies them to the
   * clipboard on click; reading the row the mint wrote is both simpler and
   * stricter, because it asserts the link was actually RECORDED as this
   * person's rather than merely rendered.
   */
  await sharerPage.waitForTimeout(2500)
  const { data: mintedLinks } = await db
    .from('share_links')
    .select('id, code, created_by, channel')
    .eq('event_id', event.id)
    .eq('created_by', sharerId)
    .order('id', { ascending: true })
  const link = mintedLinks?.[0]
  check(
    'aq2.sharer.minted-a-tracked-link-of-their-own',
    Boolean(link?.code),
    link
      ? `${mintedLinks.length} link(s) recorded against the sharer, first code ${link.code} on ${link.channel}`
      : 'no share link was recorded with this person as its creator',
  )
  if (!link?.code) throw new Error('no share link to follow')

  /* ------------------- 2. a second person arrives through it and buys */
  const joinerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const joinerPage = await joinerContext.newPage()
  await joinerPage.goto(`${BASE}/e/${link.code}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await joinerPage.waitForTimeout(2000)
  await answerTheCookieBanner(joinerPage)
  /*
   * IT RENDERS IN PLACE, IT DOES NOT REDIRECT, and the first run of this drive
   * asserted the wrong one. src/app/e/[code]/page.tsx books the click and then
   * calls EventDetailPage directly, so the short URL IS the event page and the
   * address bar keeps the short code. That is better than a redirect, because a
   * redirect is a second round trip on a link somebody tapped in a message. So
   * the check is what a person would see, not what the URL says.
   */
  const joinerSeesTheEvent = await joinerPage.getByText(event.title, { exact: false }).count()
  check(
    'aq2.joiner.the-short-link-shows-them-the-event',
    joinerSeesTheEvent > 0 && joinerPage.url().includes(`/e/${link.code}`),
    `a browser that had never seen this platform followed /e/${link.code} and was shown "${event.title}" without a second round trip`,
  )
  const cookies = await joinerContext.cookies()
  const shareCookie = cookies.find(c => c.name === 'el_share_code')
  check(
    'aq2.joiner.and-the-link-is-remembered-server-side',
    shareCookie?.value === link.code,
    `el_share_code = ${shareCookie?.value ?? 'absent'}. The attribution rides on this rather than on a query string, which is AQ2's own reversal condition: the link carries its own identifier.`,
  )

  await selectOneTicket(joinerPage, event.slug)
  await joinerPage.getByRole('button', { name: /^(checkout|register) /i }).first().click()
  await joinerPage.waitForURL(u => /\/checkout\//.test(u.pathname) || /\/orders\//.test(u.pathname), {
    timeout: 120000,
  })
  await joinerPage.waitForTimeout(1500)
  if (/\/checkout\//.test(joinerPage.url())) {
    await fillTheCheckout(joinerPage, 'Lane B AQ2 Joiner', joinerEmail)
    await joinerPage.getByRole('button', { name: /register for free/i }).click()
    await joinerPage.waitForURL(u => /\/orders\//.test(u.pathname), { timeout: 120000 }).catch(() => {})
  }
  await joinerPage.waitForTimeout(3000)
  const joinerOrderId = /\/orders\/([0-9a-f-]{36})/.exec(joinerPage.url())?.[1] ?? null
  check(
    'aq2.joiner.completed-the-purchase',
    Boolean(joinerOrderId),
    `the second person ended on ${joinerPage.url()}`,
  )
  await joinerPage.screenshot({ path: join(out, 'desktop-1440-2-joiner-confirmation.png'), fullPage: false })

  /* ------------------------------- 3. the attributed order, in the database */
  const { data: conversions } = await db
    .from('share_link_events')
    .select('link_id, kind, order_id')
    .eq('kind', 'conversion')
    .eq('order_id', joinerOrderId ?? '00000000-0000-4000-8000-000000000000')
  const conversion = conversions?.[0]
  check(
    'aq2.attribution.the-share-link-produced-an-attributed-order',
    conversion?.link_id === link.id,
    conversion
      ? `order ${joinerOrderId} is attributed to link ${conversion.link_id}, which is the sharer's own`
      : 'no conversion row was written, so the chain from a shared link to a sale is broken',
  )

  /* -------------------------- 4. the coefficient, on the organiser's own page */
  const organiserContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const organiserPage = await organiserContext.newPage()
  await organiserPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await organiserPage.waitForTimeout(1200)
  await answerTheCookieBanner(organiserPage)
  await organiserPage.getByLabel(/email/i).first().fill(ownerEmail)
  await organiserPage.getByLabel(/password/i).first().fill(ownerPassword)
  await Promise.all([
    organiserPage.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
    organiserPage.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  await organiserPage.waitForTimeout(2000)
  const organiserState = await organiserContext.storageState()
  await organiserContext.close()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: organiserState,
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/dashboard/events/${event.id}/reach`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)

    const reported = await page
      .locator('[data-referral-coefficient]')
      .first()
      .getAttribute('data-referral-coefficient')
      .catch(() => null)
    check(
      `aq2.coefficient.${vp.label}.is-reported-per-event`,
      reported !== null,
      `the organiser's reach page reports ${reported ?? 'nothing'} new buyers per buyer`,
    )
    check(
      `aq2.coefficient.${vp.label}.counts-the-sale-this-drive-produced`,
      reported !== null && Number(reported) > 0,
      `two buyers, one of whom came through the other's link, gives ${reported}. A zero here would mean the chain proved above is not reaching the number.`,
    )
    const words = await page
      .locator('[data-referral-coefficient]')
      .first()
      .innerText()
      .catch(() => '')
    check(
      `aq2.coefficient.${vp.label}.says-it-in-words-as-well-as-a-number`,
      /new buyers per buyer/.test(words) && /came through a link/.test(words),
      words.replace(/\s+/g, ' ').trim().slice(0, 170),
    )
    await page.screenshot({ path: join(out, `${vp.label}-5-referral-coefficient.png`), fullPage: false })
    await context.close()
  }

  const { data: myTickets } = await db
    .from('tickets')
    .select('ticket_code, secret, order_id')
    .eq('event_id', event.id)
    .order('created_at', { ascending: false })
    .limit(20)
  const { data: sharerOrders } = await db
    .from('orders')
    .select('id')
    .eq('user_id', sharerId)
    .limit(5)
  const sharerOrderIds = new Set((sharerOrders ?? []).map(o => o.id))
  const sharerTicket = (myTickets ?? []).find(t => sharerOrderIds.has(t.order_id))
  check(
    'aq2.ticket-page.the-sharer-has-a-ticket-to-open',
    Boolean(sharerTicket?.ticket_code),
    sharerTicket ? `ticket ${sharerTicket.ticket_code}` : 'no ticket row found for the sharer',
  )

  /* ------------------------ 5. the ticket page can be shared, at three widths */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(
      `${BASE}/t/${encodeURIComponent(sharerTicket.ticket_code)}?k=${encodeURIComponent(sharerTicket.secret)}`,
      { waitUntil: 'domcontentloaded', timeout: 120000 },
    )
    await page.waitForTimeout(1800)
    await answerTheCookieBanner(page)
    const heading = await page.getByText('Bring someone with you').count()
    check(
      `aq2.ticket-page.${vp.label}.carries-a-share-link`,
      heading === 1,
      `${heading} share panel(s) on the ticket itself, which had none before AQ2`,
    )
    const buttons = await page.getByRole('button', { name: /whatsapp|copy link|share/i }).count()
    check(
      `aq2.ticket-page.${vp.label}.and-the-share-controls-are-reachable`,
      buttons > 0,
      `${buttons} share control(s) rendered at ${vp.width}px`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-3-ticket-page-share.png`), fullPage: false })
    await context.close()
  }

  /* ------------------------------- 6. the sharer sees what their link produced */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: await sharerContext.storageState(),
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2000)
    await answerTheCookieBanner(page)
    const panel = page.locator('[data-my-shares]')
    const present = await panel.count()
    check(
      `aq2.sharer.${vp.label}.is-told-what-their-link-produced`,
      present === 1,
      present === 1
        ? (await panel.innerText()).replace(/\s+/g, ' ').trim().slice(0, 160)
        : 'the panel is absent, so the person who brought somebody is told nothing',
    )
    await page.screenshot({ path: join(out, `${vp.label}-4-what-your-sharing-did.png`), fullPage: false })
    await context.close()
  }
  await sharerContext.close()
  await joinerContext.close()

  /* --------------------- 7. the database refuses a rate below the floor */
  const { data: paidTiers } = await db
    .from('ticket_tiers')
    .select('id, event_id, price, currency')
    .gt('price', 2000)
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(1)
  const tier = paidTiers?.[0]
  check('aq2.floor.a-paid-tier-to-price', Boolean(tier?.id), tier ? `tier ${tier.id} at ${tier.price}` : 'none')
  if (!tier?.id) throw new Error('no paid tier to set a group rate on')

  const { data: floor } = await db.rpc('group_rate_floor_cents', {
    p_event_id: tier.event_id,
    p_organisation_id: null,
    p_country_code: 'AU',
    p_currency: tier.currency,
  })
  check(
    'aq2.floor.the-database-derives-it-from-pricing_rules',
    Number.isInteger(floor) && floor > 0,
    `the database answered ${floor} cents, computed from the live fee rather than from a number in a migration`,
  )

  async function attempt(label, cents, minSize, shouldPass, why) {
    const r = await db
      .from('event_group_rates')
      .insert({
        event_id: tier.event_id,
        ticket_tier_id: tier.id,
        unit_price_cents: cents,
        min_group_size: minSize,
      })
      .select('id')
      .maybeSingle()
    if (r.data?.id) groupRatesInserted.push(r.data.id)
    const accepted = Boolean(r.data?.id)
    check(
      `aq2.floor.${label}`,
      accepted === shouldPass,
      accepted ? `ACCEPTED at ${cents}c. ${why}` : `REFUSED at ${cents}c: ${r.error?.message.slice(0, 140)}`,
    )
    if (r.data?.id) {
      await db.from('event_group_rates').delete().eq('id', r.data.id)
      groupRatesInserted.pop()
    }
  }

  await attempt('one-cent-below-the-floor-is-refused', floor - 1, 3, false, '')
  await attempt('the-floor-exactly-is-accepted', floor, 3, true, 'the first price that clears the fee on itself')
  await attempt('a-rate-at-the-ticket-price-is-refused', tier.price, 3, false, '')
  await attempt('a-group-of-two-is-refused', Math.round(tier.price * 0.8), 2, false, '')
  await attempt(
    'a-sensible-group-rate-is-accepted',
    Math.max(floor, Math.round(tier.price * 0.8)),
    3,
    true,
    'below the ticket price and above the floor',
  )
} catch (error) {
  check('aq2.the-drive-ran-to-the-end', false, error.message)
} finally {
  if (browser) await browser.close().catch(() => {})

  let ratesRemoved = 0
  for (const id of groupRatesInserted) {
    const { error } = await db.from('event_group_rates').delete().eq('id', id)
    if (!error) ratesRemoved += 1
  }
  if (sharerId) {
    await db.from('profiles').delete().eq('id', sharerId)
    await tearDownAccountOrFailTheRun(db, sharerId)
  }
  await purgeFixtures(db, line => console.log(`  purge: ${line}`), FIXTURE_SLUG_PREFIX).catch(err =>
    console.error(`  purge failed: ${err.message}`),
  )

  /*
   * ASKED, NOT ASSERTED. The teardown above is an intention; these two reads
   * are the fact. A published fixture nobody noticed is a state, and only a
   * question put to the database finds one.
   */
  const { data: orgsLeft } = await db
    .from('organisations')
    .select('id, slug')
    .ilike('slug', `${FIXTURE_SLUG_PREFIX}%`)
  const { data: eventsLeft } = await db
    .from('events')
    .select('id, slug, status')
    .ilike('slug', 'lane-b-aq2-%')
  console.log(
    `teardown.left-as-found  ${ratesRemoved} group rate(s) removed, ${(orgsLeft ?? []).length} fixture ` +
      `organisation(s) and ${(eventsLeft ?? []).length} fixture event(s) still on TEST` +
      ((eventsLeft ?? []).length > 0
        ? `: ${(eventsLeft ?? []).map(e => `${e.slug} (${e.status})`).join(', ')}`
        : ', so this run left nothing behind'),
  )
  if ((orgsLeft ?? []).length > 0 || (eventsLeft ?? []).length > 0) {
    checks.push({
      name: 'aq2.teardown.left-nothing-on-the-shared-database',
      ok: false,
      detail: 'a fixture organisation or event survived the purge, which is the state that refused a push in September',
    })
    console.log('FAIL  aq2.teardown.left-nothing-on-the-shared-database  a fixture survived the purge')
  } else {
    checks.push({
      name: 'aq2.teardown.left-nothing-on-the-shared-database',
      ok: true,
      detail: 'asked the database after purging: no fixture organisation and no fixture event remain',
    })
    console.log('PASS  aq2.teardown.left-nothing-on-the-shared-database  asked the database, nothing remains')
  }

  const passed = checks.filter(c => c.ok).length
  writeFileSync(
    join(out, 'aq2-drive-report.json'),
    JSON.stringify({ at: new Date().toISOString(), base: BASE, passed, total: checks.length, checks }, null, 2),
  )
  console.log(`\n=== ${passed}/${checks.length} checks passed ===`)
  process.exit(passed === checks.length ? 0 : 1)
}
