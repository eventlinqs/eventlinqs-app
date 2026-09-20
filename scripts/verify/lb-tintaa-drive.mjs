/**
 * LB-TINTAA. A SEMANTIC COLOUR IS NOT A TEXT COLOUR ON ITS OWN TINT.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, and why it is in two parts.
 *
 * On 21 September 2026 the tree held TWENTY-NINE class strings painting a
 * semantic token as text on a tint of the same token, and not one reached the
 * WCAG AA floor of 4.5:1. The worst was 1.91:1 on white and 1.67:1 on ink-100,
 * amber on amber, carrying the "18+ only" age restriction on the public event
 * page. `scripts/guards/tinted-text-meets-contrast.mjs` had been registered and
 * blocking since 11 September and reported PASS over every one of them, because
 * it skipped any class string carrying an opacity modifier and a tint is
 * written with one.
 *
 * PART 1, THE REAL SURFACES. An organiser posts a gig, a performer applies, the
 * organiser books and declines them, and the organiser saves their profile,
 * all through the real forms. Six corrected elements are then found by their own
 * text at 1440, 768 and 390, and for each one the BROWSER is asked what colour
 * it actually painted and what is actually behind it. The ratio is computed
 * from those measurements, not from the token table, so a class that generated
 * no colour at all would be caught: globals.css records that `text-ink-700` has
 * always been exactly that, a class the theme never defined, silently
 * inheriting. axe runs on every one of those pages at every viewport as well,
 * which is what judges the elements this drive did not name.
 *
 * PART 2, THE PAIRS THAT PART 1 CANNOT REACH. Twenty sites were corrected and
 * six of them are reachable in one signed-in run. The rest need a ticket in
 * hand, a queue, a failing assistant, or an unverified mailbox. They are not
 * asserted from the token table either: every (ink, tint) COMBINATION the
 * correction introduced is mounted on each of the three light surfaces inside a
 * REAL page, so the stylesheet is the real build's stylesheet, and the browser
 * composites and reports. Any corrected site is one of those combinations on
 * one of those surfaces, so measuring all nine over all three measures all of
 * them. The OLD ink is measured on the SAME element in the same run, so the
 * before and the after come off one instrument.
 *
 * WHAT IT LEAVES ON TEST: nothing. Every fixture hangs off `lane-b-tintaa-` and
 * is deleted and then RE-READ to prove it went.
 *
 * Run (dev server on 3100 against TEST):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   node --env-file=.env.local scripts/verify/lb-tintaa-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-TINTAA
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-TINTAA'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const TAG = 'lane-b-tintaa'
const RUN = Date.now().toString(36)
const FLAG = 'gig_board'
/** The resolver's cache TTL. Read from the product rather than typed here. */
const FLAG_CACHE_TTL_SECONDS = 30
const AA = 4.5
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

async function axeCheck(page, screen, viewport) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const named = axe.violations.map((v) => `${v.id}(${v.impact}, ${v.nodes.length})`).join(', ')
  check(
    `lb-tintaa.axe.${screen}.${viewport}`,
    axe.violations.length === 0,
    axe.violations.length === 0
      ? `0 violations at any impact level across ${axe.passes.length} passing check(s)`
      : `${axe.violations.length} violation(s): ${named}`,
  )
  for (const v of axe.violations) {
    for (const n of v.nodes) {
      log(`    ${v.id} ${JSON.stringify(n.target)} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
    }
  }
}

/**
 * ASK THE BROWSER WHAT IT PAINTED.
 *
 * The element's own colour, and the effective background found by walking up
 * and compositing every translucent layer on the way, which is what a tint IS.
 * Nothing here consults globals.css: a class the theme never generated reports
 * the colour it inherited, which is the failure mode this has to be able to see.
 */
function MEASURE(el) {
  /*
   * THE BROWSER PARSES AND THE BROWSER COMPOSITES. Nothing here reads a hex.
   *
   * THE FIRST VERSION PARSED `background-color` WITH /rgba?\(/ AND REPORTED
   * EVERY TINT AS PURE WHITE. Tailwind v4 writes a tint as
   * `color-mix(in oklab, var(--color-success) 15%, transparent)` and Chromium
   * serialises the computed value as `oklab(0.612203 -0.135543 0.0658111 /
   * 0.15)`, which that regex does not match. The parse returned null, the layer
   * was skipped, and every measurement came back as the ink on the BARE
   * surface: 6.20:1 where the real answer is 5.20:1. It read as a pass and it
   * was measuring the wrong thing, which is the eighth harness-over-product
   * incident recorded in this lane and the first where the harness FLATTERED
   * the result instead of accusing it.
   *
   * A canvas parses any CSS colour the page can hold and composites with
   * source-over, which is what the compositor does. An unparseable string is
   * REFUSED rather than skipped: two different sentinels, so a colour that
   * happens to equal one of them cannot be mistaken for a rejection.
   */
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const accepts = (css) => {
    ctx.fillStyle = '#123456'
    ctx.fillStyle = css
    if (ctx.fillStyle !== '#123456') return true
    ctx.fillStyle = '#654321'
    ctx.fillStyle = css
    return ctx.fillStyle !== '#654321'
  }
  const rejected = []
  const alphaOf = (css) => {
    if (!accepts(css)) {
      rejected.push(css)
      return 0
    }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    return ctx.getImageData(0, 0, 1, 1).data[3] / 255
  }
  const layers = []
  for (let n = el; n; n = n.parentElement) {
    const css = getComputedStyle(n).backgroundColor
    const a = alphaOf(css)
    if (a > 0) layers.push({ css, a })
    if (a === 1) break
  }
  const base =
    layers.length && layers[layers.length - 1].a === 1
      ? layers.pop().css
      : alphaOf(getComputedStyle(document.documentElement).backgroundColor) === 1
        ? getComputedStyle(document.documentElement).backgroundColor
        : '#FFFFFF'
  const readPixel = () => {
    const d = ctx.getImageData(0, 0, 1, 1).data
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')
  }
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 1, 1)
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    ctx.fillStyle = layers[i].css
    ctx.fillRect(0, 0, 1, 1)
  }
  const behind = readPixel()
  // The ink over what is behind it, so a translucent text colour is handled by
  // the same compositor rather than by an assumption that it is opaque.
  const inkCss = getComputedStyle(el).color
  alphaOf(inkCss)
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = behind
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillStyle = inkCss
  ctx.fillRect(0, 0, 1, 1)
  const ink = readPixel()
  return { ink, behind, layers: layers.length, rejected, text: (el.textContent || '').trim().slice(0, 40) }
}

const channel = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = (hex) =>
  0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
  0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
  0.0722 * channel(parseInt(hex.slice(5, 7), 16))
const contrast = (a, b) => {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * MEASURE ONE CORRECTED ELEMENT ON A REAL PAGE.
 *
 * A LOCATOR THAT FINDS NOTHING IS A FAILURE, NEVER A SKIP. Lane B has recorded
 * seven incidents where a drive reported clean because its selector missed, so
 * the count is a check of its own before anything is measured.
 */
async function measureElement(page, locator, name, viewport) {
  const count = await locator.count()
  check(`lb-tintaa.found.${name}.${viewport}`, count > 0, `${count} element(s) matched`)
  if (count === 0) return null
  // The evidence a ledger cites is the picture, and the first run of this drive
  // photographed the fold: at 390 the applied banner sat below it and the image
  // showed the top of the gig page instead of the thing under test.
  // `scrollIntoViewIfNeeded` was tried first and changed nothing: the banner was
  // PARTIALLY visible behind the mobile bottom nav, so Playwright judged it in
  // view and did not scroll. Centring it is unconditional.
  await locator
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    .catch(() => {})
  await page.waitForTimeout(250)
  const m = await locator.first().evaluate(MEASURE)
  const ratio = contrast(m.ink, m.behind)
  check(
    `lb-tintaa.contrast.${name}.${viewport}`,
    ratio >= AA && m.rejected.length === 0,
    `"${m.text}" ink ${m.ink} on ${m.behind} = ${ratio.toFixed(2)}:1 against a floor of ${AA}` +
      (m.rejected.length ? `; REFUSED to parse ${m.rejected.length} colour(s): ${m.rejected.join(' | ')}` : ''),
  )
  return { ...m, ratio }
}

async function makeUser(label) {
  const email = `${TAG}-${label}-${RUN}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`auth user ${label}: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: `Lane B tintaa ${label}` })
  return { id, email, password }
}

async function signIn(browser, who) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await answerTheCookieBanner(page)
  await page.getByLabel(/email/i).first().fill(who.email)
  await page.getByLabel(/password/i).first().fill(who.password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
    page.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  await page.waitForTimeout(2000)
  const state = await context.storageState()
  await context.close()
  return state
}

/** Wait for the server's view of the flag, never for a clock (LB-FLAGCACHE). */
async function waitForFlagToLand() {
  const budgetMs = (FLAG_CACHE_TTL_SECONDS + 40) * 1000
  const deadline = Date.now() + budgetMs
  for (;;) {
    const [pub, dash] = await Promise.all([
      fetch(`${BASE}/gigs`, { redirect: 'manual' }).catch(() => null),
      fetch(`${BASE}/dashboard/gigs`, { redirect: 'manual' }).catch(() => null),
    ])
    if (pub?.status === 200 && dash && dash.status !== 404) {
      log(`${FLAG} has landed: /gigs answers ${pub.status}, /dashboard/gigs answers ${dash.status}`)
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `after ${Math.round(budgetMs / 1000)}s, /gigs answers ${pub ? pub.status : 'nothing'} and ` +
          `/dashboard/gigs answers ${dash ? dash.status : 'nothing'}.`,
      )
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
}

/**
 * PART 2's SUBJECT. Every (ink, tint) combination the correction introduced,
 * with the ink it replaced, so the before and the after are measured on the
 * same element by the same browser.
 */
const PAIRS = [
  { ink: 'text-ink-900', was: 'text-success', tint: 'bg-success/15', where: 'gig and application status badges' },
  { ink: 'text-ink-900', was: 'text-error', tint: 'bg-error/10', where: 'declined badges' },
  { ink: 'text-ink-900', was: 'text-warning', tint: 'bg-warning/15', where: 'the 18+ age badge on the event page' },
  { ink: 'text-ink-900', was: 'text-warning', tint: 'bg-warning/10', where: 'the ticketing-paused notice' },
  /*
   * THE PAIR THE PLATFORM REFUSES, KEPT AS A MEASUREMENT RATHER THAN DELETED.
   *
   * text-success-strong on bg-success/15 is 4.51:1 over ink-100 by sRGB
   * arithmetic and 4.48:1 when Chromium paints it, because Tailwind writes a
   * tint as a color-mix in oklab and the round trip moves one channel by one
   * unit. Nine sites shipped that pairing before 21 September 2026, including
   * the two /artists badges, and the arithmetic said they were fine. This entry
   * asserts it really is under the floor, which is the evidence for the rule
   * the platform now follows: a -strong ink sits on a /10 tint, dark ink sits
   * on a /15 tint. If a future token change makes this pair safe, this check
   * goes red and the rule can be revisited on a measurement.
   */
  { ink: 'text-success-strong', was: 'text-success', tint: 'bg-success/15', mustFail: true, where: 'the pairing the platform stopped using on 21 September 2026' },
  { ink: 'text-success-strong', was: 'text-success', tint: 'bg-success/10', where: 'the applied, saved, sign-in and profile banners' },
  { ink: 'text-error-strong', was: 'text-error', tint: 'bg-error/10', where: 'the marketplace refusal banners' },
  { ink: 'text-error-strong', was: 'text-error', tint: 'bg-error/5', where: 'the assistant refusal' },
  { ink: 'text-success-strong', was: 'text-success', tint: null, where: 'the queue and resend lines, no tint' },
]
const SURFACES = ['bg-white', 'bg-canvas', 'bg-ink-100']

let flagWasEnabled = null
let organiser = null
let performer = null
let orgId = null
let artistId = null
let gigId = null

const browser = await chromium.launch()
try {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  // ---------------------------------------------------------------- the flag
  const before = await db.from('feature_flags').select('enabled').eq('flag', FLAG).maybeSingle()
  if (before.error) throw new Error(`reading ${FLAG}: ${before.error.message}`)
  flagWasEnabled = before.data?.enabled ?? false
  log(`${FLAG} was ${flagWasEnabled}; switching it on for this run`)
  const flipped = await db.from('feature_flags').update({ enabled: true }).eq('flag', FLAG)
  if (flipped.error) throw new Error(`switching ${FLAG} on: ${flipped.error.message}`)
  await waitForFlagToLand()

  // ------------------------------------------------------------- the fixture
  organiser = await makeUser('organiser')
  performer = await makeUser('performer')

  const orgRow = await db
    .from('organisations')
    .insert({
      name: `Lane B Tintaa Presents ${RUN}`,
      slug: `${TAG}-org-${RUN}`,
      owner_id: organiser.id,
      email: organiser.email,
      // Active, because posting a gig is refused otherwise. No description and
      // no event, so isOrganiserProfileIndexable is false both ways and the row
      // never reaches the sitemap (the same reasoning lb-gigwhole records).
      status: 'active',
    })
    .select('id')
    .single()
  if (orgRow.error) throw new Error(`organisation: ${orgRow.error.message}`)
  orgId = orgRow.data.id

  const artistRow = await db
    .from('artists')
    .insert({
      name: `Lane B Tintaa Performer ${RUN}`,
      slug: `${TAG}-artist-${RUN}`,
      owner_user_id: performer.id,
      bio: 'A lane B fixture performer.',
    })
    .select('id')
    .single()
  if (artistRow.error) throw new Error(`artist: ${artistRow.error.message}`)
  artistId = artistRow.data.id
  check('lb-tintaa.fixture', Boolean(orgId && artistId), `org=${orgId} artist=${artistId}`)

  const organiserSession = await signIn(browser, organiser)
  const performerSession = await signIn(browser, performer)
  check(
    'lb-tintaa.both-accounts-are-signed-in',
    Boolean(organiserSession?.cookies?.length && performerSession?.cookies?.length),
    `organiser ${organiserSession?.cookies?.length ?? 0} cookies, performer ${performerSession?.cookies?.length ?? 0}`,
  )

  // ------------- the gig, through the real form, and its success banner
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: organiserSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/dashboard/gigs`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    const localDateTime = (daysAhead) => new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 16)
    await page.locator('#gig-title').fill(`Lane B Tintaa Slot ${RUN} ${vp.label}`)
    await page.locator('#gig-date').fill(localDateTime(21))
    await page.locator('#gig-deadline').fill(localDateTime(7))
    await page.locator('#gig-description').fill('A lane B fixture slot, posted through the real form.')
    await page.getByRole('button', { name: /^post gig$/i }).first().click()
    await page.waitForTimeout(5000)
    // The post-gig banner: bg-success/15 text-success-strong, role=status.
    await measureElement(page, page.locator('p[role="status"]').first(), 'post-gig-banner', vp.label)
    await page.screenshot({ path: join(OUT, 'drive', `post-gig-banner-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'dashboard-gigs', vp.label)
    await context.close()
  }

  const posted = await db
    .from('gigs')
    .select('id, status, title')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: true })
  gigId = posted.data?.[0]?.id ?? null
  check(
    'lb-tintaa.the-gigs-were-posted-through-the-form',
    (posted.data?.length ?? 0) === VIEWPORTS.length,
    `${posted.data?.length ?? 0} gig(s) posted, first=${gigId}, error=${posted.error?.message ?? 'null'}`,
  )
  if (!gigId) throw new Error('no gig was posted, so nothing below can be driven')

  // ----------- the application, through the panel, and the applied message
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: performerSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    const apply = page.getByRole('button', { name: /apply/i }).first()
    if (await apply.count()) {
      await apply.click()
      await page.waitForTimeout(4000)
      // The apply banner: bg-success/15 text-success-strong.
      await measureElement(page, page.locator('[role="status"]').first(), 'apply-banner', vp.label)
      await page.screenshot({ path: join(OUT, 'drive', `apply-banner-${vp.label}.png`), fullPage: false })
    }
    // Reload: the panel now renders the "You applied to this gig" message,
    // which is the bg-success/15 text-success-strong paragraph on the PAGE
    // rather than in the form.
    await page.goto(`${BASE}/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await measureElement(
      page,
      page.locator('p[role="status"]', { hasText: /you applied to this gig/i }).first(),
      'you-applied',
      vp.label,
    )
    await page.screenshot({ path: join(OUT, 'drive', `you-applied-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'gig-detail-applied', vp.label)
    await context.close()
  }

  /*
   * THE BOOKING IS MADE THE WAY A BOOKING IS ACTUALLY MADE. There is no "Book"
   * button: the organiser shortlists, sends a booking request with pay terms,
   * and the PERFORMER accepts it, which is what moves the application to
   * `booked`. The first version of this drive looked for a Book control, found
   * none, reported "0 control(s)" and would have gone on to accuse three
   * surfaces of losing a badge that had never been created.
   */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: organiserSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/dashboard/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    const shortlist = page.getByRole('button', { name: /^shortlist$/i }).first()
    check('lb-tintaa.the-shortlist-control-is-on-the-applicant-row', (await shortlist.count()) > 0, 'shortlist control')
    await shortlist.click()
    await page.waitForTimeout(3000)
    // The applicant-actions banner: bg-success/15 text-success-strong.
    await measureElement(page, page.locator('p[role="status"]').first(), 'applicant-action-banner', 'desktop-1440')
    await page.screenshot({ path: join(OUT, 'drive', 'applicant-action-banner-desktop-1440.png'), fullPage: false })

    const open = page.getByRole('button', { name: /send booking request/i }).first()
    check('lb-tintaa.the-booking-request-control-is-there', (await open.count()) > 0, 'send booking request')
    await open.click()
    await page.locator('input[id^="req-subject-"]').first().fill(`Lane B tintaa booking ${RUN}`)
    await page.getByRole('button', { name: /^send request$/i }).first().click()
    await page.waitForTimeout(4000)
    const request = await db
      .from('booking_requests')
      .select('id, status')
      .eq('artist_id', artistId)
      .maybeSingle()
    check(
      'lb-tintaa.the-booking-request-was-sent-through-the-form',
      Boolean(request.data?.id),
      `request=${request.data?.id ?? 'NONE'} status=${request.data?.status} error=${request.error?.message ?? 'null'}`,
    )
    await context.close()
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: performerSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/artist/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    const accept = page.getByRole('button', { name: /^accept$/i }).first()
    check('lb-tintaa.the-accept-control-is-on-the-request', (await accept.count()) > 0, 'accept control')
    await accept.click()
    await page.waitForTimeout(5000)
    const booked = await db.from('gig_applications').select('status').eq('gig_id', gigId).eq('artist_id', artistId).maybeSingle()
    check(
      'lb-tintaa.the-application-was-booked-by-the-performer-accepting',
      booked.data?.status === 'booked',
      `status=${booked.data?.status ?? 'NONE'}`,
    )
    await context.close()
  }

  // ------------------ the badges the booking produced, at every viewport
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: organiserSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/dashboard/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    await measureElement(page, page.getByText(/^booked$/i).first(), 'organiser-booked-badge', vp.label)
    await page.screenshot({ path: join(OUT, 'drive', `organiser-badge-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'dashboard-gig-applicants', vp.label)
    await context.close()
  }

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: performerSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/artist/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    await measureElement(page, page.getByText(/^booked$/i).first(), 'performer-booked-badge', vp.label)
    // The requests panel's own accepted badge: bg-success/15 text-ink-900.
    await measureElement(page, page.getByText(/^accepted$/i).first(), 'request-accepted-badge', vp.label)
    await page.screenshot({ path: join(OUT, 'drive', `performer-badge-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'artist-dashboard', vp.label)
    await context.close()
  }

  // --------------------------------------------------------- PART 2, the CSS
  /*
   * THE STYLESHEET IS THE REAL BUILD'S. This mounts nine ink-and-tint
   * combinations on three surfaces inside a page the server rendered, so every
   * colour reported is one the running application actually generates. A class
   * the theme never defined reports the colour it inherited, which is precisely
   * how `text-ink-700` shipped on 131 elements painting nothing.
   */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    for (const pair of PAIRS) {
      for (const surface of SURFACES) {
        const id = `tintaa-${PAIRS.indexOf(pair)}-${SURFACES.indexOf(surface)}`
        await page.evaluate(
          ({ id, surface, tint, ink, was }) => {
            const host = document.createElement('div')
            host.className = surface
            host.style.position = 'fixed'
            host.style.left = '0'
            host.style.top = '0'
            host.style.zIndex = '2147483647'
            host.innerHTML =
              `<span id="${id}-now" class="${tint ?? ''} ${ink} text-sm">now</span>` +
              `<span id="${id}-was" class="${tint ?? ''} ${was} text-sm">was</span>`
            document.body.appendChild(host)
          },
          { id, surface, tint: pair.tint, ink: pair.ink, was: pair.was },
        )
        const now = await page.locator(`#${id}-now`).evaluate(MEASURE)
        const was = await page.locator(`#${id}-was`).evaluate(MEASURE)
        const nowRatio = contrast(now.ink, now.behind)
        const wasRatio = contrast(was.ink, was.behind)
        const label = `${pair.ink}.on.${(pair.tint ?? 'no-tint').replace('/', '-')}.over.${surface}`
        const onInk100 = surface === 'bg-ink-100'
        check(
          `lb-tintaa.css.${label}.${vp.label}`,
          // A pair marked mustFail is asserted to be under the floor on ink-100
          // and is not required to be anywhere in particular on the other two.
          pair.mustFail ? (onInk100 ? nowRatio < AA : true) : nowRatio >= AA,
          `${now.ink} on ${now.behind} = ${nowRatio.toFixed(2)}:1 (the ${pair.was} it replaced measured ` +
            `${wasRatio.toFixed(2)}:1 on the same element) - ${pair.where}` +
            (pair.mustFail && onInk100 ? ` [asserted UNDER ${AA}, which is why the platform does not ship it]` : ''),
        )
        check(
          `lb-tintaa.css.the-old-ink-really-did-fail.${label}.${vp.label}`,
          wasRatio < AA,
          `${was.ink} on ${was.behind} = ${wasRatio.toFixed(2)}:1, under ${AA}`,
        )
        await page.evaluate((id) => document.getElementById(`${id}-now`)?.parentElement?.remove(), id)
      }
    }
    await context.close()
  }
} catch (err) {
  check('lb-tintaa.run', false, `threw: ${err.message}`)
} finally {
  // -------------------------------------------------------------- tear down
  try {
    if (gigId) await db.from('gig_applications').delete().eq('gig_id', gigId)
    if (orgId) {
      const gigs = await db.from('gigs').select('id').eq('organisation_id', orgId)
      for (const g of gigs.data ?? []) await db.from('gig_applications').delete().eq('gig_id', g.id)
      await db.from('gigs').delete().eq('organisation_id', orgId)
    }
    if (artistId) await db.from('artists').delete().eq('id', artistId)
    if (orgId) await db.from('organisations').delete().eq('id', orgId)
    for (const who of [organiser, performer]) {
      if (who) {
        const gone = await tearDownAccountOrFailTheRun(db, who.id)
        check(`lb-tintaa.teardown.${who.email.split('@')[0]}`, gone.gone, gone.detail)
      }
    }
    const leftOrgs = await db.from('organisations').select('id').like('slug', `${TAG}-%`)
    const leftArtists = await db.from('artists').select('id').like('slug', `${TAG}-%`)
    check(
      'lb-tintaa.nothing-is-left-on-test',
      (leftOrgs.data?.length ?? 0) === 0 && (leftArtists.data?.length ?? 0) === 0,
      `${leftOrgs.data?.length ?? 0} organisation(s), ${leftArtists.data?.length ?? 0} artist(s) still matching ${TAG}-`,
    )
    if (flagWasEnabled === false) {
      await db.from('feature_flags').update({ enabled: false }).eq('flag', FLAG)
      const after = await db.from('feature_flags').select('enabled').eq('flag', FLAG).maybeSingle()
      check('lb-tintaa.the-flag-is-back-where-it-was', after.data?.enabled === false, `enabled=${after.data?.enabled}`)
    }
  } catch (err) {
    check('lb-tintaa.teardown', false, `threw: ${err.message}`)
  }
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
writeFileSync(join(OUT, 'lb-tintaa-drive.log'), `${lines.join('\n')}\n`, 'utf8')
writeFileSync(
  join(OUT, 'lb-tintaa-drive.json'),
  `${JSON.stringify({ base: BASE, run: RUN, checks: results.length, failed: failed.length, results }, null, 2)}\n`,
  'utf8',
)
console.log(`\n=== lb-tintaa: ${results.length - failed.length}/${results.length} checks passed ===`)
for (const f of failed) console.error(`  FAIL ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
