/**
 * PL1. THE TWO PRODUCT LOOPS, DRIVEN.
 *
 * WHAT IT PROVES, in the order PL1's acceptance asks for it:
 *
 *   1. The run-your-event line is in the RENDERED ticket email and on the
 *      confirmation page at 390, 768 and 1440, BELOW the ticket and never
 *      above it, with both parameters on the link.
 *   2. The share controls render on an event page at the three widths, every
 *      one of their links carries the parameters, and a driven click on copy
 *      link puts an address carrying src=share on the clipboard.
 *   3. A signup through an organiser's referral link stores referred_by.
 *   4. DESIGN-LOCK: the event page above the share controls is pixel identical
 *      to what it was before this item, proven by capturing both and counting
 *      the differing pixels rather than by looking at them.
 *
 * Run. The first version of this block named the two --import flags and nothing
 * else, and running exactly what it said failed three checks with product
 * sounding messages: 'no link was printed', 'the referred account's role is
 * attendee after confirming', and 'the weekly query counted 0 referred signups'.
 * All three were this command, not the loops. Corrected 14 September 2026.
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     SERVER_LOG=.tmp-lane-b-serve.log \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/pl1-loops-drive.mjs \
 *          --out C:/dev/EVIDENCE/PL1
 *
 * SERVER_LOG is the one that matters here and it is the one that was missing.
 * The referral leg reads the confirmation link out of the console email inbox,
 * which IS the running server's own log. Left on the harness default
 * `.tmp-serve.log` it reads some other lane's file, or a stale one, finds no
 * link, and then reports the two downstream failures that follow from never
 * having confirmed the account. Lane B's server writes `.tmp-lane-b-serve.log`.
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { gitEnv } from '../lib/git-env.mjs'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { linkFromInbox } from '../journeys/harness.mjs'
import { PNG } from 'pngjs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const ROOT = process.cwd()
const BASE = process.env.PL1_BASE_URL ?? 'http://localhost:3100'
const LANE = 'lane-b-pl1'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')

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

/**
 * IS THE SERVER SERVING THE WHOLE APPLICATION? Twice on 14 September a dev
 * server on this machine came up with part of the route tree missing and every
 * check read as a product failure. The answer to that is to ask first.
 */
async function everyRouteThisDriveNeedsIsServed() {
  const missing = []
  for (const path of ['/', '/signup', '/dashboard']) {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual' }).catch(() => null)
    if (!response) missing.push(`${path} did not answer`)
    else if (response.status === 404) missing.push(`${path} answered 404`)
  }
  return missing
}

async function answerTheCookieBanner(page) {
  for (const label of [/that is fine/i, /accept/i]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {})
      await page.waitForTimeout(400)
      return
    }
  }
}

const fixture = {
  organiserId: null,
  organisationId: null,
  eventId: null,
  eventSlug: null,
  tierId: null,
  orderId: null,
  ticketId: null,
  referredId: null,
  referralCode: null,
}

async function buildFixture() {
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  const { data: category } = await db.from('event_categories').select('id').eq('is_active', true).order('sort_order').limit(1).single()
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()

  const organiser = await db.auth.admin.createUser({
    email: `${LANE}-organiser-${STAMP}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (organiser.error) throw new Error(`organiser: ${organiser.error.message}`)
  fixture.organiserId = organiser.data.user.id
  await db.from('profiles').upsert({
    id: fixture.organiserId,
    email: `${LANE}-organiser-${STAMP}@eventlinqs.test`,
    full_name: 'Lane B PL1 organiser',
    role: 'organiser',
  })

  const org = await db
    .from('organisations')
    .insert({ name: `Lane B PL1 ${STAMP}`, slug: `${LANE}-org-${STAMP}`, owner_id: fixture.organiserId, status: 'active' })
    .select('id')
    .single()
  if (org.error) throw new Error(`organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 21 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B PL1 loop night ${STAMP}`,
      slug: `${LANE}-event-${STAMP}`,
      organisation_id: fixture.organisationId,
      created_by: fixture.organiserId,
      category_id: category.id,
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: 'Lane B PL1 warehouse',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the PL1 loops drive. It is deleted when the drive ends.',
    })
    .select('id, slug')
    .single()
  if (event.error) throw new Error(`event: ${event.error.message}`)
  fixture.eventId = event.data.id
  fixture.eventSlug = event.data.slug

  const tier = await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.eventId, name: 'General', price: 4500, currency: 'AUD', total_capacity: 200, is_active: true })
    .select('id')
    .single()
  if (tier.error) throw new Error(`tier: ${tier.error.message}`)
  fixture.tierId = tier.data.id

  const orderId = randomUUID()
  const order = await db.from('orders').insert({
    id: orderId,
    order_number: `EL-PL1${STAMP.slice(-5)}`,
    event_id: fixture.eventId,
    organisation_id: fixture.organisationId,
    guest_email: `${LANE}-buyer-${STAMP}@eventlinqs.test`,
    guest_name: 'Lane B PL1 buyer',
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    subtotal_cents: 4500,
    total_cents: 4500,
    currency: 'AUD',
  })
  if (order.error) throw new Error(`order: ${order.error.message}`)
  fixture.orderId = orderId

  /*
   * A TICKET NEEDS AN ORDER ITEM, and the column is `ticket_tier_id` rather
   * than `tier_id`. Both were read out of information_schema on TEST rather
   * than guessed: the first version of this fixture guessed and the database
   * refused it.
   */
  const item = await db
    .from('order_items')
    .insert({
      order_id: orderId,
      ticket_tier_id: fixture.tierId,
      item_type: 'ticket',
      item_name: 'General',
      quantity: 1,
      unit_price_cents: 4500,
      total_cents: 4500,
    })
    .select('id')
    .single()
  if (item.error) throw new Error(`order item: ${item.error.message}`)

  const ticket = await db
    .from('tickets')
    .insert({
      order_id: orderId,
      order_item_id: item.data.id,
      event_id: fixture.eventId,
      ticket_tier_id: fixture.tierId,
      idx_in_item: 0,
      ticket_code: `PL1${STAMP.slice(-8)}`,
      holder_name: 'Lane B PL1 buyer',
      holder_email: `${LANE}-buyer-${STAMP}@eventlinqs.test`,
      status: 'valid',
    })
    .select('id')
    .single()
  if (ticket.error) throw new Error(`ticket: ${ticket.error.message}`)
  fixture.ticketId = ticket.data.id
}

async function teardown() {
  if (fixture.orderId) {
    await db.from('tickets').delete().eq('order_id', fixture.orderId)
    await db.from('order_items').delete().eq('order_id', fixture.orderId)
    await db.from('marketing_attribution_reversal').delete().eq('order_id', fixture.orderId)
    await db.from('marketing_attribution').delete().eq('order_id', fixture.orderId)
    await db.from('orders').delete().eq('id', fixture.orderId)
  }
  if (fixture.eventId) {
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  for (const id of [fixture.referredId, fixture.organiserId]) {
    if (!id) continue
    await db.from('profiles').update({ referred_by: null }).eq('id', id)
    await db.auth.admin.deleteUser(id).catch(() => {})
  }
}

let browser = null
const SHARE_BAR = join(ROOT, 'src/components/features/events/event-share-bar.tsx')

try {
  const unserved = await everyRouteThisDriveNeedsIsServed()
  if (unserved.length > 0) {
    console.error('FAIL: this dev server is serving a partial route tree, so nothing measured against it would mean anything.')
    for (const line of unserved) console.error(`  ${line}`)
    console.error('Restart `next dev` on this port and run again. It is the server, not the product.')
    process.exit(1)
  }

  await buildFixture()
  console.log(`event  /events/${fixture.eventSlug}`)
  console.log(`order  /orders/${fixture.orderId}/confirmation`)

  const loops = await import(pathToFileURL(join(ROOT, 'src/lib/growth/loops.ts')).href)
  const email = await import(pathToFileURL(join(ROOT, 'src/lib/email/order-confirmation.ts')).href)

  fixture.referralCode = new URL(loops.organiserReferralUrl('https://x.test', fixture.organiserId)).searchParams.get('ref')

  browser = await chromium.launch({ headless: true })

  /* ---- acceptance 1a: the RENDERED ticket email ---- */
  {
    const html = email.buildConfirmationEmailHtml(
      { id: fixture.orderId, order_number: `EL-PL1${STAMP.slice(-5)}`, total_cents: 4500, currency: 'AUD', user_id: null },
      {
        title: `Lane B PL1 loop night ${STAMP}`,
        start_date: new Date(Date.now() + 21 * 86_400_000).toISOString(),
        timezone: 'Australia/Melbourne',
        venue_name: 'Lane B PL1 warehouse',
        venue_city: 'Geelong',
      },
      [{ ticket_code: 'PL1TICKET', secret: 'pl1', holder_name: 'Lane B PL1 buyer', status: 'valid', seat: null }],
      null,
      'Robin',
    )
    const text = email.buildConfirmationEmailText(
      { id: fixture.orderId, order_number: `EL-PL1${STAMP.slice(-5)}`, total_cents: 4500, currency: 'AUD', user_id: null },
      {
        title: `Lane B PL1 loop night ${STAMP}`,
        start_date: new Date(Date.now() + 21 * 86_400_000).toISOString(),
        timezone: 'Australia/Melbourne',
        venue_name: 'Lane B PL1 warehouse',
        venue_city: 'Geelong',
      },
      [{ ticket_code: 'PL1TICKET', secret: 'pl1', holder_name: 'Lane B PL1 buyer', status: 'valid', seat: null }],
      null,
      'Robin',
    )
    const emailFile = join(out, 'ticket-email.html')
    writeFileSync(emailFile, html)
    writeFileSync(join(out, 'ticket-email.txt'), text)

    check(
      'pl1.email.carries-the-line-and-both-parameters',
      html.includes(loops.RUN_YOUR_EVENT_LINE) &&
        html.includes(`src=${loops.LOOP_SOURCES.TICKET}`) &&
        text.includes(loops.RUN_YOUR_EVENT_LINE) &&
        text.includes(`src=${loops.LOOP_SOURCES.TICKET}`),
      'the run-your-event line and src=ticket are in both the html and the plain text body',
    )

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await page.goto(pathToFileURL(emailFile).href, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      const link = await page.getByRole('link', { name: /Run your event on EventLinqs/i }).first()
      const href = await link.getAttribute('href').catch(() => null)
      const box = await link.boundingBox().catch(() => null)
      check(
        `pl1.email.${vp.label}.the-line-is-visible-and-its-link-is-parameterised`,
        Boolean(href) && href.includes(`src=${loops.LOOP_SOURCES.TICKET}`) && Boolean(box),
        `the footer link points at ${href ?? 'nothing'}`,
      )
      await page.screenshot({ path: join(out, `${vp.label}-ticket-email.png`), fullPage: true })
      await context.close()
    }
  }

  /* ---- acceptance 1b: the confirmation page, below the ticket ---- */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(`${BASE}/orders/${fixture.orderId}/confirmation`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)

    const geometry = await page.evaluate(() => {
      const prompt = document.querySelector('[data-loop="organiser-invite"]')
      const codes = [...document.querySelectorAll('dt')].filter(d => /ticket code/i.test(d.textContent ?? ''))
      const ticket = codes.length > 0 ? codes[codes.length - 1] : null
      const anchor = prompt?.querySelector('a')
      return {
        promptTop: prompt ? Math.round(prompt.getBoundingClientRect().top + window.scrollY) : null,
        ticketTop: ticket ? Math.round(ticket.getBoundingClientRect().top + window.scrollY) : null,
        href: anchor ? anchor.getAttribute('href') : null,
        text: prompt ? (prompt.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }
    })

    check(
      `pl1.confirmation.${vp.label}.the-prompt-is-below-the-ticket`,
      geometry.promptTop !== null && geometry.ticketTop !== null && geometry.promptTop > geometry.ticketTop,
      `the ticket code sits at ${geometry.ticketTop} and the prompt at ${geometry.promptTop}`,
    )
    check(
      `pl1.confirmation.${vp.label}.the-link-carries-both-parameters`,
      Boolean(geometry.href) && geometry.href.includes('src=confirmation') && geometry.href.includes('via='),
      `the prompt links to ${geometry.href ?? 'nothing'}`,
    )
    check(
      `pl1.confirmation.${vp.label}.no-horizontal-overflow`,
      !geometry.overflow,
      `the page fits ${vp.width} across`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-confirmation.png`), fullPage: true })
    await context.close()
  }

  /* ---- acceptance 2: the share controls on an event page ---- */
  const shareBarTops = {}
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/events/${fixture.eventSlug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(3500)
    await answerTheCookieBanner(page)

    const bar = await page.evaluate(() => {
      const instagram = [...document.querySelectorAll('button')].find(b => /instagram/i.test(b.textContent ?? ''))
      if (!instagram) return null
      const row = instagram.parentElement
      const anchors = [...row.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
      const buttons = [...row.querySelectorAll('button')].map(b => (b.textContent ?? '').trim())
      return {
        top: Math.round(row.getBoundingClientRect().top + window.scrollY),
        anchors,
        buttons,
      }
    })

    check(
      `pl1.share.${vp.label}.the-controls-render`,
      Boolean(bar) && bar.anchors.length >= 4 && bar.buttons.some(b => /instagram/i.test(b)),
      bar
        ? `${bar.anchors.length} link control(s) and ${bar.buttons.length} button control(s), including Instagram`
        : 'no share row was found on the page, which is the failure',
    )
    if (bar) {
      shareBarTops[vp.label] = bar.top
      /*
       * DECODED FIRST. A share intent carries the event URL as an ENCODED
       * parameter of its own, so `src=share` arrives inside a wa.me link as
       * `src%3Dshare`. The first version of this check read the raw href and
       * reported four correct links as unparameterised, which is the check
       * being wrong rather than the product.
       */
      const unparameterised = bar.anchors.filter(h => !decodeURIComponent(h).includes('src=share'))
      check(
        `pl1.share.${vp.label}.every-shared-link-carries-the-source`,
        unparameterised.length === 0,
        unparameterised.length === 0
          ? `all ${bar.anchors.length} shared links carry src=share`
          : `${unparameterised.length} link(s) carry no src: ${JSON.stringify(unparameterised.slice(0, 2))}`,
      )
    }

    // The copy-link click, and what actually lands on the clipboard.
    const copy = page.getByRole('button', { name: /^Copy link$/ }).first()
    await copy.scrollIntoViewIfNeeded().catch(() => {})
    await copy.click({ timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(700)
    const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    check(
      `pl1.share.${vp.label}.copy-link-copies-an-address-carrying-the-source`,
      typeof clipboard === 'string' && clipboard.includes('src=share'),
      `the clipboard holds ${clipboard ? clipboard.slice(0, 90) : 'nothing'}`,
    )

    await page.screenshot({ path: join(out, `${vp.label}-share-controls.png`), fullPage: false })
    await context.close()
  }

  /* ---- acceptance 4: DESIGN-LOCK, above the share controls ---- */
  {
    const after = readFileSync(SHARE_BAR, 'utf8')
    /*
     * `env: gitEnv()`, because a child that inherits GIT_DIR ignores cwd when
     * it chooses a repository, and this drive can be run from a hook. That is
     * how core.bare=true once landed in the shared config.
     */
    const before = execFileSync('git', ['show', 'HEAD:src/components/features/events/event-share-bar.tsx'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: gitEnv(),
    })

    async function captureAbove(label) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      await page.goto(`${BASE}/events/${fixture.eventSlug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(4000)
      await answerTheCookieBanner(page)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(600)
      const path = join(out, `design-lock-${label}.png`)
      await page.screenshot({ path, fullPage: false })
      await context.close()
      return path
    }

    const afterShot = await captureAbove('after')
    // The committed version, put back just long enough to photograph, then
    // restored and verified byte for byte. Nothing is committed and no history
    // is touched: this is the same shape as a guard drill.
    writeFileSync(SHARE_BAR, before)
    await new Promise(r => setTimeout(r, 6000))
    const beforeShot = await captureAbove('before')
    writeFileSync(SHARE_BAR, after)
    await new Promise(r => setTimeout(r, 6000))
    check(
      'pl1.design-lock.the-file-was-restored',
      readFileSync(SHARE_BAR, 'utf8') === after,
      'the share bar is back as it was, byte for byte',
    )

    const a = PNG.sync.read(readFileSync(beforeShot))
    const b = PNG.sync.read(readFileSync(afterShot))
    /*
     * ONLY THE REGION ABOVE THE SHARE CONTROLS. Below them the row is allowed
     * to be different, because a control was added to it; that is the change.
     * Above them nothing may move, and this counts the pixels rather than
     * looking at them.
     */
    const cut = Math.min(shareBarTops['desktop-1440'] ?? 0, a.height, b.height)
    let differing = 0
    if (a.width === b.width && cut > 0) {
      for (let y = 0; y < cut; y += 1) {
        for (let x = 0; x < a.width; x += 1) {
          const i = (a.width * y + x) << 2
          if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) differing += 1
        }
      }
    }
    check(
      'pl1.design-lock.the-page-above-the-share-controls-is-unchanged',
      a.width === b.width && cut > 0 && differing === 0,
      cut > 0
        ? `${differing} differing pixel(s) in the ${a.width} by ${cut} region above the share controls`
        : 'the share controls were never located, so there was no region to compare, which is itself the failure',
    )
  }

  /* ---- acceptance 3: a signup through the referral link stores referred_by ---- */
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const referredEmail = `${LANE}-referred-${STAMP}@eventlinqs.test`
    const password = `${randomUUID()}Aa1`

    const link = loops.organiserReferralUrl(BASE, fixture.organiserId)
    check('pl1.referral.the-link-is-minted', Boolean(link), `the organiser's link is ${link ?? 'null, which is the failure'}`)

    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(3000)
    await answerTheCookieBanner(page)
    await page.goto(`${BASE}/signup?role=organiser`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2500)
    await page.locator('#fullName').fill('Lane B PL1 referred')
    await page.locator('#email').fill(referredEmail)
    await page.locator('#password').fill(password)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(u => u.pathname.startsWith('/verify-email-sent'), { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(out, 'mobile-390-referred-signup.png'), fullPage: false })

    /*
     * CONFIRM THE ADDRESS BEFORE ASKING THE WEEKLY QUESTION. The organiser role
     * is applied at /auth/confirm, and the weekly line counts ORGANISERS, so an
     * unconfirmed signup is correctly counted as nothing. Same finding as AN1,
     * and the reason it is confirmed here rather than the query being loosened.
     */
    const confirmUrl = linkFromInbox(referredEmail, /auth\/confirm/)
    check(
      'pl1.referral.the-confirmation-email-carries-a-link',
      Boolean(confirmUrl),
      confirmUrl ? 'the console inbox holds the confirmation link' : 'no link was printed, so SERVER_LOG is not the running server',
    )
    if (confirmUrl) {
      await page.goto(confirmUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(3500)
    }

    const { data: referred } = await db
      .from('profiles')
      .select('id, referred_by, signup_src, role')
      .eq('email', referredEmail)
      .maybeSingle()
    fixture.referredId = referred?.id ?? null
    check(
      'pl1.referral.the-new-account-records-who-sent-them',
      referred?.referred_by === fixture.organiserId,
      `referred_by is ${referred?.referred_by ?? 'null'} and the organiser is ${fixture.organiserId}`,
    )
    check(
      'pl1.referral.the-arrival-surface-is-recorded-too',
      referred?.signup_src === loops.LOOP_SOURCES.ORGANISER_REFERRAL,
      `signup_src is ${JSON.stringify(referred?.signup_src)}`,
    )
    check(
      'pl1.referral.confirming-makes-them-an-organiser',
      referred?.role === 'organiser',
      `the referred account's role is ${JSON.stringify(referred?.role)} after confirming`,
    )

    const { getOrganiserSignupSources } = await import(pathToFileURL(join(ROOT, 'src/lib/growth/signup-sources.ts')).href)
    const counts = await getOrganiserSignupSources()
    check(
      'pl1.referral.the-weekly-line-counts-it',
      counts.unavailable === false && counts.referred >= 1,
      `the weekly query counted ${counts.referred} referred signup(s) this week`,
    )

    await context.close()
  }
} catch (error) {
  check('pl1.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await teardown()
    const { count } = await db
      .from('events')
      .select('id', { count: 'exact', head: true })
      .like('slug', `${LANE}-event-${STAMP}`)
    check('pl1.teardown.left-as-found', (count ?? 0) === 0, `${count ?? 0} lane B PL1 event row(s) remain`)
  } catch (error) {
    check('pl1.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'pl1-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`PL1 DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
