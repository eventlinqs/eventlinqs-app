/**
 * WI1, DRIVEN: a free walk-in event, end to end, at 390, 768 and 1440, on TEST.
 *
 * WI1-ITEM.md, How it is judged: "A drive with a bp-free test event (or your
 * own test naming) showing the walk-in page, Remind me storing a row, Add to
 * calendar, the browse surfaces listing it, and the structured data." And the
 * plan's verification 4: the organiser form, the honeypot, the sends, the stop,
 * the dashboard numbers and the switch-off state.
 *
 * Usage, against a production build served locally with EMAIL_TRANSPORT=console
 * and the Upstash shim (node scripts/dev/upstash-shim.mjs 8079, the server
 * started with UPSTASH_REDIS_REST_URL pointing at it), the server's stdout in
 * SERVER_LOG (a journey drive needs those three), and every variable cleared of
 * the session's production values:
 *   bash C:/dev/EVIDENCE/C13/clean-env.sh node --env-file=.env.local \
 *     scripts/verify/wi1-walk-in-drive.mjs http://127.0.0.1:3000 --label=run1
 * CRON_SECRET comes from .env.local and is never printed.
 *
 * TEST ONLY, checked twice: the repository preflight, then the TEST ref. Every
 * row it writes is named wi1-walk-in-proof and deleted in finally, and the
 * teardown asks the database whether the rows are gone rather than trusting its
 * own deletes.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

assertNotProduction()

const TAG = '[wi1-walk-in]'
const args = process.argv.slice(2)
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:3000'
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run'
const OUT = join(process.env.DRIVE_OUT ?? 'C:/dev/EVIDENCE/WI1', LABEL)
const SERVER_LOG = process.env.SERVER_LOG ?? ''

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON = process.env.CRON_SECRET
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)
if (!CRON) throw new Error('CRON_SECRET is required to drive the hourly reminder run')
if (!SERVER_LOG || !existsSync(SERVER_LOG)) throw new Error('SERVER_LOG must name the served process stdout, where the console mail lands')

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)
const created = { userId: null, orgId: null, eventIds: [] }
mkdirSync(OUT, { recursive: true })

const results = []
let failures = 0
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Poll until fn answers truthy, never a fixed wait. */
async function until(what, fn, { timeoutMs = 30000, everyMs = 1000 } = {}) {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < timeoutMs) {
    last = await fn()
    if (last) return last
    await sleep(everyMs)
  }
  console.log(`${TAG} gave up waiting for ${what}`)
  return last
}
const logLength = () => readFileSync(SERVER_LOG, 'utf8').length
const logSince = (from) => readFileSync(SERVER_LOG, 'utf8').slice(from)
const cron = () => fetch(`${BASE}/api/cron/walk-in-reminders`, { headers: { Authorization: `Bearer ${CRON}` } }).then((r) => r.json())

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

/** The calendar date in Melbourne, "YYYY-MM-DD", offset by whole days. */
function melbourneDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
/** A Melbourne wall-clock time as a UTC instant (two passes, for daylight saving). */
function melbourneInstant(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, mi)
  const offset = (at) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Melbourne', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at))
    const g = (t) => Number(parts.find((p) => p.type === t).value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - at
  }
  let at = wall - offset(wall)
  at = wall - offset(at)
  return new Date(at).toISOString()
}

/* The only ticket phrases a walk-in page may carry (ruling 1 of 21 October 2026). */
const ALLOWED = ['Free entry, no ticket needed', 'Free, no ticket needed', 'Free · No ticket needed', 'No ticket needed']

/* The organiser's numbers, read the way the dashboard reads them. */
async function slotCounts(eventId) {
  const { data: slots } = await admin.from('ledger_slots').select('id').eq('source_system', 'eventlinqs').eq('source_ref', eventId)
  const ids = (slots ?? []).map((s) => s.id)
  const count = async (action) => {
    if (ids.length === 0) return 0
    const { count } = await admin.from('ledger_entries').select('id', { count: 'exact', head: true }).in('slot_id', ids).eq('kind', 'demand').eq('demand_action', action)
    return count ?? 0
  }
  return { views: await count('page_view'), calendar: await count('calendar_add'), share: await count('share'), follow: await count('follow') }
}
const reminderCount = async (eventId) => (await admin.from('event_reminders').select('id', { count: 'exact', head: true }).eq('event_id', eventId)).count ?? 0

/*
 * ONE VISITOR PER CONTEXT. Remind me is limited per IP (event-reminder, 5 in
 * 10 minutes, fail-closed), and every context here comes from 127.0.0.1, so the
 * sixth honest request of a run would be refused and read as a product failure.
 * Each context gets its own address from the documentation range
 * (RFC 5737, 198.51.100.0/24), set on FIRST-PARTY requests only: a header set on
 * the whole context once reached Google Places and broke it with a CORS
 * preflight.
 */
let visitor = 0
async function asOwnVisitor(context) {
  visitor += 1
  const ip = `198.51.100.${visitor}`
  await context.route(`${BASE}/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }))
  return context
}

/**
 * Wait until the SERVER renders Remind me as switched (a-drive-waits-for-a-cached-flag):
 * the flag is cached for FEATURE_FLAG_CACHE_TTL_SECONDS, so the row is not the page.
 */
async function waitForFlagToLand(slug, wantOn) {
  const landed = await until(`Remind me ${wantOn ? 'on' : 'off'} on the page`, async () => {
    const html = await fetch(`${BASE}/events/${slug}`).then((r) => r.text())
    return html.includes('data-walk-in-page') && html.includes('data-remind-me-form') === wantOn
  }, { timeoutMs: 120000, everyMs: 5000 })
  return Boolean(landed)
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' })
  await answerTheCookieBanner(page)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
}

let browser = null
try {
  /* ------------------------------------------------------------------ *
   * FIXTURES. One organiser, a real cover borrowed from a published TEST
   * event, and three events:
   *   A  published, public, walk-in, three days from the day after tomorrow,
   *      with its guide: the page, the browse surfaces, Remind me, the program;
   *   B  a draft in-person event with no ticket types: the organiser form;
   *   C  published, unlisted, walk-in, tomorrow: the day-before reminder and
   *      the stop.
   * A is public and the organisation active because the thing under test is
   * public: see the BASELINE entries in scripts/guards/fixtures-are-not-published.mjs.
   * ------------------------------------------------------------------ */
  const password = randomBytes(12).toString('base64url') + '-Aa1'
  const email = `wi1-walk-in-proof-${stamp}@eventlinqs.test`
  const owner = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create the organiser').user
  created.userId = owner.id
  const org = must(
    await admin.from('organisations').insert({ name: `WI1 Walk-in Proof ${stamp}`, slug: `wi1-walk-in-proof-${stamp}`, owner_id: owner.id, status: 'active', website: 'https://example.com', instagram_handle: 'wi1proof', short_name: 'WI1 Proof' }).select('id').single(),
    'create the organisation',
  )
  created.orgId = org.id

  const donor = must(
    await admin.from('events').select('cover_image_url, category_id, category:event_categories(slug)').eq('status', 'published').eq('visibility', 'public').not('cover_image_url', 'is', null).not('category_id', 'is', null).limit(1).single(),
    'borrow a real cover from a published TEST event',
  )
  const category = Array.isArray(donor.category) ? donor.category[0] : donor.category

  const days = [melbourneDate(2), melbourneDate(3), melbourneDate(4)]
  const venue = `WI1 Proof Hall ${stamp}`
  const titleA = `WI1 walk-in proof ${stamp}`
  const eventA = must(
    await admin.from('events').insert({
      organisation_id: org.id, created_by: owner.id, timezone: 'Australia/Melbourne', event_type: 'in_person',
      venue_name: venue, venue_address: '44 Moorabool Street', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
      venue_latitude: -38.1471, venue_longitude: 144.3607, cover_image_url: donor.cover_image_url, category_id: donor.category_id,
      title: titleA,
      slug: `wi1-walk-in-proof-${stamp}`,
      summary: 'Three free days of music and food. A WI1 verification row, created and deleted by scripts/verify/wi1-walk-in-drive.mjs.',
      start_date: melbourneInstant(days[0], '10:00'),
      end_date: melbourneInstant(days[2], '20:00'),
      entry_mode: 'walk_in',
      status: 'published',
      published_at: new Date().toISOString(),
      visibility: 'public',
    }).select('id, slug').single(),
    'create walk-in event A',
  )
  created.eventIds.push(eventA.id)
  must(
    await admin.from('event_guides').insert({
      event_id: eventA.id,
      days: [
        { date: days[0], opens: null, hours_label: '10am or 11am, to confirm', closes: '22:00', items: [{ when: 'Opening', what: 'Welcome to Country' }, { when: 'All day', what: 'Food stalls from $10' }], closer: { name: 'Niasha', note: 'Zimbabwean artist' } },
        { date: days[1], opens: '10:00', hours_label: null, closes: '22:00', items: [{ when: '9pm', what: 'Main stage' }], closer: null },
        { date: days[2], opens: '10:00', hours_label: null, closes: '20:00', items: [], closer: null },
      ],
      at_a_glance: [{ value: 'Free', label: 'for every visitor' }],
      highlights: [{ title: 'Art workshops', body: '30 places a session. Bookings open through the organiser.' }],
      program_note: 'The full timetable is still to come.',
      getting_there: 'Opposite the station.',
      access_notes: 'Step-free entry and accessible toilets.',
    }),
    'create the guide of event A',
  )

  const dateB = melbourneDate(6)
  const eventB = must(
    await admin.from('events').insert({
      organisation_id: org.id, created_by: owner.id, timezone: 'Australia/Melbourne', event_type: 'in_person',
      venue_name: venue, venue_address: '44 Moorabool Street', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
      venue_latitude: -38.1471, venue_longitude: 144.3607, cover_image_url: donor.cover_image_url, category_id: donor.category_id,
      title: `WI1 walk-in form proof ${stamp}`,
      slug: `wi1-walk-in-form-proof-${stamp}`,
      start_date: melbourneInstant(dateB, '19:00'),
      end_date: melbourneInstant(dateB, '23:00'),
      status: 'draft',
      visibility: 'unlisted',
    }).select('id, slug').single(),
    'create draft event B',
  )
  created.eventIds.push(eventB.id)
  // B starts as a draft that ALREADY HOLDS a ticket type, the way an organiser
  // who began with tickets and then chose free entry arrives. The database
  // refuses walk-in while a ticket type exists, and the form hides the tier
  // editor once free entry is chosen, so the save must remove it first
  // (updateEvent). The form clause below proves the switch lands with none left.
  must(
    await admin.from('ticket_tiers').insert({ event_id: eventB.id, name: 'General admission', price: 0, currency: 'AUD', total_capacity: 100 }),
    'give draft event B a ticket type',
  )

  const tomorrow = melbourneDate(1)
  const eventC = must(
    await admin.from('events').insert({
      organisation_id: org.id, created_by: owner.id, timezone: 'Australia/Melbourne', event_type: 'in_person',
      venue_name: venue, venue_address: '44 Moorabool Street', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
      venue_latitude: -38.1471, venue_longitude: 144.3607, cover_image_url: donor.cover_image_url, category_id: donor.category_id,
      title: `WI1 day-before proof ${stamp}`,
      slug: `wi1-day-before-proof-${stamp}`,
      start_date: melbourneInstant(tomorrow, '19:00'),
      end_date: melbourneInstant(tomorrow, '22:00'),
      entry_mode: 'walk_in',
      status: 'published',
      published_at: new Date().toISOString(),
      visibility: 'unlisted',
    }).select('id, slug').single(),
    'create walk-in event C',
  )
  created.eventIds.push(eventC.id)
  must(await admin.from('event_guides').insert({ event_id: eventC.id, days: [{ date: tomorrow, opens: '19:00', hours_label: null, closes: '22:00', items: [], closer: null }] }), 'create the guide of event C')

  /*
   * REMIND ME ON, AND SEEN TO BE ON. Migration 20261021000020 seeds the switch
   * OFF everywhere; TEST runs with it on. A row read true is not a page showing
   * the form (the server caches the flag), so the drive waits for the page.
   */
  must(await admin.from('feature_flags').update({ enabled: true }).eq('flag', 'walk_in_remind_me'), 'switch Remind me on, on TEST')
  if (!(await waitForFlagToLand(eventA.slug, true))) throw new Error('Remind me never appeared on the page after the switch was turned on')

  browser = await chromium.launch()

  /* ------------------------------------------------------------------ *
   * THE PAGE, AT EACH WIDTH: what it says, what it carries, Remind me and
   * the trap.
   * ------------------------------------------------------------------ */
  for (const vp of VIEWPORTS) {
    const phone = vp.width < 768
    const context = await asOwnVisitor(await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: phone, hasTouch: phone }))
    const page = await context.newPage()
    const res = await page.goto(`${BASE}/events/${eventA.slug}`, { waitUntil: 'load' })
    await answerTheCookieBanner(page)
    check(`${vp.label}: the walk-in page answers 200`, res?.status() === 200, `HTTP ${res?.status()}`)
    check(`${vp.label}: it is the walk-in page`, (await page.locator('[data-walk-in-page]').count()) === 1)
    await page.screenshot({ path: join(OUT, `page-${vp.label}.png`), fullPage: true })

    // ONE BAR AT THE FOOT below lg (locked design A): the site's bottom nav steps
    // aside, and the walk-in bar's buttons are what a finger lands on, not
    // something drawn over them.
    if (vp.width < 1024) {
      const navShown = await page.locator('nav[data-bottom-nav]').isVisible().catch(() => false)
      const onTop = await page.evaluate(() => {
        const bar = document.querySelector('[data-walk-in-bar]')
        const share = bar?.querySelector('button:last-of-type')
        if (!share) return 'no walk-in bar'
        const r = share.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit && share.contains(hit) ? 'ok' : `covered by ${hit?.tagName ?? 'nothing'}`
      })
      check(`${vp.label}: one bar at the foot, the site nav hidden and the walk-in bar on top`, !navShown && onTop === 'ok', `nav shown ${navShown}, ${onTop}`)
    }

    // Every word EventLinqs wrote between the chrome, plus the bottom bar.
    const ours = await page.evaluate(() => {
      const out = []
      const walk = (node) => {
        if (node.nodeType === 3) { out.push(node.textContent); return }
        if (!(node instanceof HTMLElement)) return
        if (node.dataset.textSource === 'organiser') return
        if (['SCRIPT', 'STYLE', 'HEADER', 'FOOTER', 'NOSCRIPT'].includes(node.tagName)) return
        if (node.getAttribute('aria-label') === 'Cookies and measurement') return
        for (const c of node.childNodes) walk(c)
      }
      walk(document.querySelector('[data-walk-in-page]'))
      return out.join(' ')
    })
    let rest = ours
    for (const p of ALLOWED) rest = rest.split(p).join(' ')
    const banned = rest.match(/\b(tickets?|book|books|booked|booking|bookings)\b/gi) ?? []
    check(`${vp.label}: no ticket or book word EventLinqs wrote, but "No ticket needed"`, banned.length === 0, banned.join(', ') || null)
    check(`${vp.label}: no dollar sign EventLinqs wrote`, !ours.includes('$'))
    const organiserWords = (await page.locator('[data-text-source="organiser"]').allTextContents()).join(' ')
    check(`${vp.label}: the organiser's own words show as written`, organiserWords.includes('Food stalls from $10') && organiserWords.includes('Bookings open through the organiser.'))
    check(`${vp.label}: no ticket column, no checkout, no Get tickets`, (await page.locator('#tickets').count()) === 0 && !(await page.content()).includes('Get tickets'))

    const ld = (await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => x.textContent))).map((t) => JSON.parse(t))
    const block = ld.find((j) => j['@type'] === 'Event' || j.offers)
    const offers = block ? [].concat(block.offers ?? []) : []
    check(
      `${vp.label}: structured data, one Offer at price 0 in AUD, isAccessibleForFree, start and end`,
      offers.length === 1 && Number(offers[0].price) === 0 && offers[0].priceCurrency === 'AUD' && block.isAccessibleForFree === true && Boolean(block.startDate) && Boolean(block.endDate),
      block ? JSON.stringify({ offers, isAccessibleForFree: block.isAccessibleForFree, startDate: block.startDate, endDate: block.endDate }) : 'no Event block',
    )
    check(`${vp.label}: the structured data names no ticket`, Boolean(block) && !/\b(tickets?|book\w*)\b/i.test(JSON.stringify(block)))

    // Remind me: the panel from lg, the bottom bar's sheet below it.
    const reminderEmail = `wi1-remind-${vp.label}-${stamp}@eventlinqs.test`
    let form
    if (vp.width >= 1024) {
      form = page.locator('aside form[data-remind-me-form]')
    } else {
      await page.locator('[data-walk-in-bar] button', { hasText: 'Remind me' }).click()
      form = page.locator('[role="dialog"] form[data-remind-me-form]')
      await form.waitFor({ timeout: 10000 })
      await page.screenshot({ path: join(OUT, `remind-sheet-${vp.label}.png`) })
    }
    await form.locator('input[type="email"]').fill(reminderEmail)
    await form.locator('button[type="submit"]').click()
    await form.getByText('Done. We will send only what is promised above.').waitFor({ timeout: 20000 })
    const stored = await until('the Remind me row', async () => {
      const { data } = await admin.from('event_reminders').select('id, consent_version, consent_text').eq('event_id', eventA.id).eq('email', reminderEmail)
      return data?.length === 1 ? data[0] : null
    })
    check(`${vp.label}: Remind me stores one row with the wording shown and its version`, stored?.consent_version === 'remind-me-v1-2026-10-21' && /Nothing else\.$/.test(stored?.consent_text ?? ''), stored?.consent_text)
    await context.close()

    // The same address again, from a fresh page: still one row.
    const again = await asOwnVisitor(await browser.newContext({ viewport: { width: 1440, height: 1000 } }))
    const p2 = await again.newPage()
    await p2.goto(`${BASE}/events/${eventA.slug}`, { waitUntil: 'load' })
    await answerTheCookieBanner(p2)
    const f2 = p2.locator('aside form[data-remind-me-form]')
    await f2.locator('input[type="email"]').fill(reminderEmail)
    await f2.locator('button[type="submit"]').click()
    await f2.getByText('Done. We will send only what is promised above.').waitFor({ timeout: 20000 })
    const { count: dupes } = await admin.from('event_reminders').select('id', { count: 'exact', head: true }).eq('event_id', eventA.id).eq('email', reminderEmail)
    check(`${vp.label}: asking twice keeps one row`, dupes === 1, `${dupes} rows`)

    // The trap (Lawal's change 4): filled by script, answered Done, nothing stored.
    await p2.reload({ waitUntil: 'load' })
    const before = await reminderCount(eventA.id)
    const f3 = p2.locator('aside form[data-remind-me-form]')
    await f3.locator('input[type="email"]').fill(`wi1-bot-${vp.label}-${stamp}@eventlinqs.test`)
    await p2.evaluate(() => {
      const trap = document.querySelector('aside input[name="remind_extra_note"]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(trap, 'http://bot.example')
      trap.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await f3.locator('button[type="submit"]').click()
    await f3.getByText('Done. We will send only what is promised above.').waitFor({ timeout: 20000 })
    await sleep(2000)
    const after = await reminderCount(eventA.id)
    check(`${vp.label}: the trap answers Done and stores nothing`, before === after, `${before} rows before, ${after} after`)
    await again.close()
  }

  /* ------------------------------------------------------------------ *
   * WITHOUT SCRIPT, the tabs cannot switch, so every day shows, stacked.
   * ------------------------------------------------------------------ */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto(`${BASE}/events/${eventA.slug}`, { waitUntil: 'load' })
    const panels = page.locator('[data-day-panel]')
    const total = await panels.count()
    let shown = 0
    for (let i = 0; i < total; i += 1) if (await panels.nth(i).isVisible()) shown += 1
    const tabsShown = await page.locator('[data-day-tabs]').isVisible().catch(() => false)
    check('no script: every day of the program shows, and the tab row does not', total === 3 && shown === 3 && !tabsShown, `${shown} of ${total} days shown, tabs shown ${tabsShown}`)
    await page.screenshot({ path: join(OUT, 'no-script-1440.png'), fullPage: true })
    await context.close()
  }

  /* ------------------------------------------------------------------ *
   * ADD TO CALENDAR, SHARE AND FOLLOW, signed in, at 1440. Then the
   * organiser's numbers, then the program.
   * ------------------------------------------------------------------ */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    // A share is counted only once it happened (walk-in-client.ts). Headless
    // Chromium may offer navigator.share and never open a sheet, so the copy path
    // is taken here, every time, with the clipboard granted above.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true })
    })
    const page = await context.newPage()
    await signIn(page, email, password)
    await page.goto(`${BASE}/events/${eventA.slug}`, { waitUntil: 'load' })
    const countsBefore = await slotCounts(eventA.id)
    await page.locator('aside').getByRole('button', { name: 'Add to calendar' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Apple or Outlook (.ics)' }).click()])
    const icsPath = join(OUT, 'walk-in.ics')
    await download.saveAs(icsPath)
    const ics = readFileSync(icsPath, 'utf8')
    const dtstart = new Date(melbourneInstant(days[0], '10:00')).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    check('1440: Add to calendar downloads an .ics that starts when the event starts', ics.includes('BEGIN:VEVENT') && ics.includes(dtstart), `looked for ${dtstart}`)
    await page.locator('aside').getByRole('button', { name: 'Share' }).click()
    await page.locator('section').filter({ hasText: 'Organised by' }).getByRole('button', { name: /Follow/ }).click()
    const countsAfter = await until('the calendar, share and follow rows', async () => {
      const c = await slotCounts(eventA.id)
      return c.calendar > countsBefore.calendar && c.share > countsBefore.share && c.follow > countsBefore.follow ? c : null
    })
    check('1440: Add to calendar, Share and Follow each record a row on the event', Boolean(countsAfter), JSON.stringify(countsAfter ?? (await slotCounts(eventA.id))))
    await page.screenshot({ path: join(OUT, 'page-signed-in-1440.png'), fullPage: false })

    await page.goto(`${BASE}/dashboard/events/${eventA.id}`, { waitUntil: 'load' })
    const tiles = await page.evaluate(() => {
      const out = {}
      for (const card of document.querySelectorAll('section[aria-label="What people did"] > div')) {
        const label = card.querySelector('div')?.textContent?.trim()
        const value = card.querySelector('p')?.textContent?.trim()
        if (label) out[label] = value
      }
      return out
    })
    const counts = await slotCounts(eventA.id)
    const reminders = await reminderCount(eventA.id)
    const expected = { Views: counts.views, 'Remind me': reminders, 'Calendar adds': counts.calendar, Shares: counts.share, Follows: counts.follow }
    check('dashboard: every number equals the database', Object.entries(expected).every(([k, v]) => tiles[k] === String(v)), `shown ${JSON.stringify(tiles)}, database ${JSON.stringify(expected)}`)
    await page.screenshot({ path: join(OUT, 'dashboard-1440.png'), fullPage: true })

    // The program: pressed once, sent once to each person who asked.
    const from = logLength()
    await page.getByRole('button', { name: 'Send the full program' }).click()
    await page.getByRole('button', { name: 'Send it' }).click()
    await page.getByRole('heading', { name: 'Full program sent' }).waitFor({ timeout: 45000 })
    const programSends = await until('the program sends', async () => {
      const { data } = await admin.from('event_reminder_sends').select('kind, sent_at, reminder:event_reminders!inner(event_id)').eq('kind', 'program').eq('reminder.event_id', eventA.id)
      return data && data.length === reminders && data.every((s) => s.sent_at) ? data : null
    }, { timeoutMs: 45000 })
    check(`program: one update to each of the ${reminders} people who asked, each recorded sent`, Boolean(programSends), `${programSends?.length ?? 0} sends`)
    const mail = logSince(from)
    // The console inbox prints the subject, the headers and the links, never the
    // body (src/lib/email/send.ts), so the body's "Free entry, no ticket needed"
    // is held by tests/unit/walk-in/reminder-sends.test.ts, not read here.
    check(
      'program: the mail names the program, links the page, and carries the one-click stop headers',
      mail.includes(`The full program for ${titleA} is out`) &&
        mail.includes(`/events/${eventA.slug}`) &&
        mail.includes('List-Unsubscribe: <') &&
        mail.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'),
    )
    await page.screenshot({ path: join(OUT, 'dashboard-sent-1440.png'), fullPage: true })
    await context.close()
  }
  const rerun = await cron()
  check('program: the hourly run afterwards sends no second copy', rerun?.program?.sent === 0, JSON.stringify(rerun?.program))

  /* ------------------------------------------------------------------ *
   * THE DAY BEFORE, for event C, through the real hourly route. Three
   * people: one stays, one stops on the page, one stops by one-click POST.
   * Due from 9am Melbourne on the day before, so before 9am this clause
   * says NOT JUDGED rather than pass.
   * ------------------------------------------------------------------ */
  const melbourneHour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  const consent = { consent_version: 'remind-me-v1-2026-10-21', consent_text: 'We send one reminder the day before. Nothing else.' }
  const stays = must(await admin.from('event_reminders').insert({ event_id: eventC.id, email: `wi1-daybefore-stays-${stamp}@eventlinqs.test`, ...consent }).select('id, unsubscribe_token').single(), 'create a reminder for C')
  const stopsOnPage = must(await admin.from('event_reminders').insert({ event_id: eventC.id, email: `wi1-daybefore-page-${stamp}@eventlinqs.test`, ...consent }).select('id, unsubscribe_token').single(), 'create a second reminder for C')
  const stopsByPost = must(await admin.from('event_reminders').insert({ event_id: eventC.id, email: `wi1-daybefore-post-${stamp}@eventlinqs.test`, ...consent }).select('id, unsubscribe_token').single(), 'create a third reminder for C')

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const res = await page.goto(`${BASE}/remind/stop/${stopsOnPage.unsubscribe_token}`, { waitUntil: 'load' })
    check(`${vp.label}: the stop page answers 200 with no login`, res?.status() === 200, `HTTP ${res?.status()}`)
    await page.screenshot({ path: join(OUT, `stop-${vp.label}.png`), fullPage: true })
    await context.close()
  }
  const pageStopped = must(await admin.from('event_reminders').select('unsubscribed_at').eq('id', stopsOnPage.id).single(), 'read the stopped row')
  check('stop: the page stops the row at once', Boolean(pageStopped.unsubscribed_at))
  const post = await fetch(`${BASE}/api/remind/stop/${stopsByPost.unsubscribe_token}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })
  const postStopped = must(await admin.from('event_reminders').select('unsubscribed_at').eq('id', stopsByPost.id).single(), 'read the one-click row')
  check('stop: the one-click POST answers 200 and stops the row', post.status === 200 && Boolean(postStopped.unsubscribed_at), `HTTP ${post.status}`)
  const mangled = await fetch(`${BASE}/remind/stop/not-a-token`)
  check('stop: a mangled link answers a page, never a 500', mangled.status === 200, `HTTP ${mangled.status}`)

  if (melbourneHour >= 9) {
    const from = logLength()
    const run1 = await cron()
    const { data: sendsC } = await admin.from('event_reminder_sends').select('reminder_id, sent_at').eq('kind', 'day_before').in('reminder_id', [stays.id, stopsOnPage.id, stopsByPost.id])
    check('day before: the hourly run sends exactly one reminder, to the person who did not stop', sendsC?.length === 1 && sendsC[0].reminder_id === stays.id && Boolean(sendsC[0].sent_at), JSON.stringify({ run: run1?.dayBefore, sends: sendsC }))
    check('day before: the mail says Tomorrow and names the event', logSince(from).includes(`Tomorrow: WI1 day-before proof ${stamp}`))
    const run2 = await cron()
    const { count: sendsAfter } = await admin.from('event_reminder_sends').select('id', { count: 'exact', head: true }).eq('kind', 'day_before').in('reminder_id', [stays.id, stopsOnPage.id, stopsByPost.id])
    check('day before: a second run sends nothing', sendsAfter === 1, JSON.stringify(run2?.dayBefore))
  } else {
    check(`day before: NOT JUDGED, it is ${melbourneHour}:00 in Melbourne and the reminder is due from 9am`, false)
  }

  /* ------------------------------------------------------------------ *
   * THE BROWSE SURFACES list it, labelled Free entry. Cached reads are
   * polled, never assumed.
   * ------------------------------------------------------------------ */
  const surfaces = ['/events?preset=free', '/events', '/city/geelong', category?.slug ? `/categories/${category.slug}` : null, '/'].filter(Boolean)
  for (const path of surfaces) {
    const found = await until(`${path} listing the event`, async () => {
      const html = await fetch(`${BASE}${path}`).then((r) => r.text())
      return html.includes(titleA) && html.includes('Free entry')
    }, { timeoutMs: 360000, everyMs: 15000 })
    check(`browse: ${path} lists the walk-in event labelled Free entry`, Boolean(found))
  }
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/events?preset=free`, { waitUntil: 'load' })
    await answerTheCookieBanner(page)
    const card = page.locator(`a[href$="/events/${eventA.slug}"]`).first()
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(OUT, 'browse-free-1440.png'), fullPage: false })
    // The card is a Next <Link>, so the click is an in-app navigation and
    // waitForNavigation sees no HTTP response for it (run1 read HTTP undefined).
    // Judge where the click lands and what it renders, and ask that address for
    // its status as a fresh request.
    await card.click()
    await page.waitForURL(`**/events/${eventA.slug}`, { timeout: 30000 })
    const landed = await page.locator('[data-walk-in-page]').first().waitFor({ timeout: 30000 }).then(() => true, () => false)
    const status = (await page.request.get(page.url())).status()
    check('browse: clicking the card opens the walk-in page, 200', landed && status === 200, `HTTP ${status}, walk-in page ${landed}`)
    await context.close()
  }

  /* ------------------------------------------------------------------ *
   * THE ORGANISER FORM, at 1440: choose free entry, refused without hours,
   * then published with zero ticket types.
   * ------------------------------------------------------------------ */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await signIn(page, email, password)
    await page.goto(`${BASE}/dashboard/events/${eventB.id}/edit`, { waitUntil: 'load' })
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByText('Free entry, no ticket needed', { exact: true }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    const refused = await page.getByText('Give every day you kept an opening and a closing time').isVisible()
    check('form: a walk-in day with no hours is refused', refused)
    await page.screenshot({ path: join(OUT, 'form-refused-1440.png'), fullPage: true })
    await page.locator(`#opens-${dateB}`).fill('19:00')
    await page.locator(`#closes-${dateB}`).fill('23:00')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.screenshot({ path: join(OUT, 'form-review-1440.png'), fullPage: true })
    await page.getByRole('button', { name: /^(Save Changes|Publish Now|Publish and get your launch kit)$/ }).click()
    const published = await until('event B published', async () => {
      const { data } = await admin.from('events').select('status, entry_mode, is_free').eq('id', eventB.id).single()
      return data?.status === 'published' ? data : null
    }, { timeoutMs: 45000 })
    check('form: the event publishes as walk-in and free', published?.entry_mode === 'walk_in' && published?.is_free === true, JSON.stringify(published))
    const { count: tiersB } = await admin.from('ticket_tiers').select('id', { count: 'exact', head: true }).eq('event_id', eventB.id)
    check('form: a draft that held a ticket type switches to free entry with none left', tiersB === 0, `${tiersB} tiers`)
    const { data: guideB } = await admin.from('event_guides').select('days').eq('event_id', eventB.id).single()
    check('form: the hours were saved with the event', guideB?.days?.[0]?.opens === '19:00' && guideB?.days?.[0]?.closes === '23:00', JSON.stringify(guideB?.days))

    // The edit page reads the guide through the organiser's own session, so this
    // is the authenticated grant and the organiser policy at work, not the service role.
    await page.goto(`${BASE}/dashboard/events/${eventB.id}/edit`, { waitUntil: 'load' })
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Continue' }).click()
    const opensShown = await page.locator(`#opens-${dateB}`).inputValue().catch(() => null)
    await page.screenshot({ path: join(OUT, 'form-reopened-1440.png'), fullPage: true })
    // The same read the edit page makes, under the organiser's own session, so a
    // failure says whether the row never came back or the form never showed it.
    const asOrganiser = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { auth: { persistSession: false, autoRefreshToken: false } })
    await asOrganiser.auth.signInWithPassword({ email, password })
    const { data: sessionGuide, error: sessionError } = await asOrganiser.from('event_guides').select('*').eq('event_id', eventB.id).maybeSingle()
    await asOrganiser.auth.signOut()
    const sessionRead = sessionError ? `error ${sessionError.message}` : sessionGuide ? `days ${JSON.stringify(sessionGuide.days)}` : 'no row'
    check('form: reopened, the edit page reads the saved hours back through the organiser session', opensShown === '19:00', `opens shows ${opensShown}; the session read: ${sessionRead}`)
    await context.close()
  }

  /* ------------------------------------------------------------------ *
   * THE SCHEDULED PUBLISH reads the guide with the service role and judges
   * the hours before it publishes. It publishes EVERY due scheduled event on
   * the database, so it runs only when this drive's event is the only one due.
   * ------------------------------------------------------------------ */
  {
    const dateD = melbourneDate(8)
    const eventD = must(
      await admin.from('events').insert({
        organisation_id: org.id, created_by: owner.id, timezone: 'Australia/Melbourne', event_type: 'in_person',
        venue_name: venue, venue_address: '44 Moorabool Street', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
        venue_latitude: -38.1471, venue_longitude: 144.3607, cover_image_url: donor.cover_image_url, category_id: donor.category_id,
        title: `WI1 scheduled proof ${stamp}`,
        slug: `wi1-scheduled-proof-${stamp}`,
        start_date: melbourneInstant(dateD, '18:00'),
        end_date: melbourneInstant(dateD, '22:00'),
        entry_mode: 'walk_in',
        status: 'scheduled',
        scheduled_publish_at: new Date(Date.now() - 60000).toISOString(),
        visibility: 'unlisted',
      }).select('id').single(),
      'create scheduled walk-in event D',
    )
    created.eventIds.push(eventD.id)
    must(await admin.from('event_guides').insert({ event_id: eventD.id, days: [{ date: dateD, opens: '18:00', hours_label: null, closes: '22:00', items: [], closer: null }] }), 'create the guide of event D')
    const { count: othersDue } = await admin.from('events').select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled').lte('scheduled_publish_at', new Date().toISOString()).neq('id', eventD.id)
    if (othersDue === 0) {
      const run = await fetch(`${BASE}/api/cron/publish-scheduled`, { headers: { Authorization: `Bearer ${CRON}` } })
      const { data: d } = await admin.from('events').select('status').eq('id', eventD.id).single()
      check('scheduled: the publish job reads the walk-in hours with the service role and publishes it', run.status === 200 && d?.status === 'published', `HTTP ${run.status}, status ${d?.status}`)
    } else {
      check(`scheduled: NOT JUDGED, ${othersDue} other scheduled event(s) are due on TEST and the job would publish them too`, false)
    }
  }

  /* ------------------------------------------------------------------ *
   * THE SWITCH OFF (production until Lawal approves the privacy version):
   * no email box and no Remind me. Then back on, on TEST.
   * ------------------------------------------------------------------ */
  must(await admin.from('feature_flags').update({ enabled: false }).eq('flag', 'walk_in_remind_me'), 'switch Remind me off on TEST')
  try {
    const off = await waitForFlagToLand(eventA.slug, false)
    check('switch off: the page shows no email box and no Remind me', off)
    if (off) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      const page = await context.newPage()
      await page.goto(`${BASE}/events/${eventA.slug}`, { waitUntil: 'load' })
      await answerTheCookieBanner(page)
      check('switch off: the bottom bar carries no Remind me', (await page.locator('[data-walk-in-bar]').getByText('Remind me').count()) === 0)
      await page.screenshot({ path: join(OUT, 'switch-off-390.png'), fullPage: true })
      await context.close()
    }
  } finally {
    must(await admin.from('feature_flags').update({ enabled: true }).eq('flag', 'walk_in_remind_me'), 'switch Remind me back on, on TEST')
    check('switch on again: TEST is left as it was found, with Remind me showing', await waitForFlagToLand(eventA.slug, true))
  }
} catch (error) {
  failures += 1
  console.error(`${TAG} FAILED: ${error.stack ?? error.message}`)
} finally {
  if (browser) await browser.close()
  for (const id of created.eventIds) {
    const { error } = await admin.from('events').delete().eq('id', id)
    if (error) console.error(`${TAG} TEARDOWN: event ${id} could not be deleted: ${error.message}`)
  }
  if (created.orgId) await admin.from('organisations').delete().eq('id', created.orgId)
  if (created.userId) await tearDownAccountOrFailTheRun(admin, created.userId)
  // Asked, not trusted: nothing named for this run may remain.
  const { count: leftEvents } = await admin.from('events').select('id', { count: 'exact', head: true }).like('slug', `%-proof-${stamp}`)
  const { count: leftOrgs } = await admin.from('organisations').select('id', { count: 'exact', head: true }).eq('slug', `wi1-walk-in-proof-${stamp}`)
  const { count: leftReminders } = await admin.from('event_reminders').select('id', { count: 'exact', head: true }).like('email', `%-${stamp}@eventlinqs.test`)
  check('teardown: no event, organisation or reminder of this run remains', leftEvents === 0 && leftOrgs === 0 && leftReminders === 0, JSON.stringify({ leftEvents, leftOrgs, leftReminders }))
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ base: BASE, label: LABEL, stamp, results, failures }, null, 2))
  console.log(`${TAG} ${failures === 0 ? 'ALL PASS' : `${failures} FAIL(S)`} - ${results.length} checks, evidence in ${OUT}`)
  process.exitCode = failures === 0 ? 0 : 1
}
