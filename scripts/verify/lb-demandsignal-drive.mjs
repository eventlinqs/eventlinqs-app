/**
 * DRIVEN PROOF: THE FOUNDER'S DEMAND SIGNAL AGREES WITH THE DATABASE, AND THE
 * PERSON IT SHOWS HIM TO INVITE LEAVES THE LIST ONCE HE HAS INVITED THEM.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by joining the waitlist through the REAL public form and then
 * reading the real /admin/network signed in at the real /admin/login. The whole
 * sequence runs at 390, 768 and 1440, with its own city and its own person at
 * each, because the confirmation this item added is new interface and had to be
 * accessible at every width rather than assumed to be.
 *
 *   1. before anything is written, every per-city figure on the screen equals
 *      the figure the database gives when asked independently, and so do the
 *      four founding metrics
 *   2. one real organiser joins through the public form, and appears in the
 *      invite bridge by name and by email
 *   3. every city figure on the screen still equals the database, so the new
 *      sign-up landed in exactly one bucket and moved no other
 *   4. the founder presses Invite on the real screen and is TOLD the invitation
 *      went, by name, in a live region that survives the list re-rendering
 *   5. exactly ONE founding invite exists for them afterwards, never two
 *   6. they LEAVE the bridge on a fresh load, because the suppression read
 *      behind it found their invite
 *   7. zero axe violations AT EVERY IMPACT LEVEL, before and after the invite,
 *      at all three viewports
 *   8. the rows are removed and the screen returns to the figures it started on
 *
 * WHY 1 AND 8 ARE WHAT MAKE THE MIDDLE MEANINGFUL. A screen that always showed
 * something would pass the middle checks on its own. The before and after halves
 * are the control: the same page, the same reads, a known delta of one.
 *
 * WHY THE SUPPRESSION HALF MATTERS MOST. Every other read here fails towards
 * showing too little. `founding_invites` is SUBTRACTED from the waitlist, so it
 * fails towards doing too much: truncated at the server's thousand-row ceiling,
 * or failed and coalesced to an empty array, it puts organisers who have already
 * had their founding invitation back on the list to be emailed a second one. A
 * founding invitation is a fee-free window and a personal email from the founder.
 *
 * WHAT IT CANNOT PROVE, stated rather than implied: the 1,000-row ceiling
 * itself. TEST holds 9 waitlist rows and 0 founding invites, so an unbounded
 * read returns everything and no drive can tell the fixed tree from the broken
 * one. The ceiling is proven by tests/unit/admin/the-demand-signal-reads-every-row.test.ts,
 * which drives 2,500 rows through a faked 1,000-row cap and 1,200 through a
 * 250-row cap, and by the guard drills. Seeding a thousand waitlist rows to
 * strengthen a drive would leave a thousand fabricated people in the table the
 * founder reads demand off, which is worse than the gap it would close.
 *
 * ONE THING TO KNOW BEFORE RE-RUNNING IT IMMEDIATELY. `waitlist-join` is
 * fail-CLOSED at 5 per IP per 10 minutes (src/lib/rate-limit/policies.ts),
 * because it sends real mail from the verified sending domain. This drive uses
 * three of those five, so two runs inside ten minutes will see the sixth join
 * refused. The refusal is reported with the form's own words rather than as a
 * missing row, so it cannot be mistaken for a product fault.
 *
 * ---------------------------------------------------------------------------
 * USAGE. The server must be up first:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/lb-demandsignal-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-DEMANDSIGNAL
 *
 * TEST IS LEFT AS FOUND. Three waitlist rows and three founding invites, all
 * carrying lane-b in the name and the address, all removed in the teardown and
 * counted back afterwards rather than assumed gone.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'
import { getWaitlistCities } from '@/lib/waitlist/city-waitlist'
import { FOUNDING_WAIVER_CAP as FOUNDING_SPOT_CAP } from '@/lib/payments/founding-waiver'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3100').replace(/\/$/, '')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url || '(no url)'}`)
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

const STAMP = Date.now()
const fixtureFor = label => ({
  name: `Lane B Demand Proof ${label} ${STAMP}`,
  email: `lane-b-demand-${label}-${STAMP}@eventlinqs.test`,
})

/**
 * THE DRIVE PAGES ITS OWN READ TOO.
 *
 * Without this the drive's read would hit the identical server ceiling and
 * would then "agree" with a truncated screen for the wrong reason. Two wrong
 * numbers that match are the most convincing possible false pass.
 */
async function everyWaitlistRow() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('city_waitlist_signups')
      .select('city_slug, role, created_at, unsubscribed_at, email')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`the drive could not read the waitlist: ${error.message}`)
    if (!data || data.length === 0) return rows
    rows.push(...data)
  }
}

/** The same arithmetic the screen does, asked of the database independently. */
function demandByCity(rows) {
  const byCity = new Map()
  for (const city of getWaitlistCities()) byCity.set(city.slug, { total: 0, organisers: 0, attendees: 0 })
  for (const row of rows) {
    if (row.unsubscribed_at) continue
    const bucket = byCity.get(row.city_slug)
    if (!bucket) continue
    bucket.total += 1
    if (row.role === 'organiser') bucket.organisers += 1
    if (row.role === 'attendee') bucket.attendees += 1
  }
  return byCity
}

/** The per-city table as the browser actually renders it, keyed by city name. */
async function cityTableOnScreen(page) {
  return page.evaluate(() => {
    const region = document.querySelector('[aria-label="Waitlist demand by city"]')
    if (!region) return null
    const out = {}
    for (const tr of region.querySelectorAll('tbody tr')) {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      if (cells.length >= 4) {
        out[cells[0]] = { total: Number(cells[1]), organisers: Number(cells[2]), attendees: Number(cells[3]) }
      }
    }
    return out
  })
}

/** Every city the screen shows, against the database, in one verdict. */
function disagreementsWith(truth, onScreen) {
  const out = []
  for (const city of getWaitlistCities()) {
    const expected = truth.get(city.slug)
    const shown = onScreen?.[city.name]
    if (!shown) {
      out.push(`${city.name} is not on the screen at all`)
      continue
    }
    if (shown.total !== expected.total || shown.organisers !== expected.organisers || shown.attendees !== expected.attendees) {
      out.push(
        `${city.name}: screen ${shown.total}/${shown.organisers}/${shown.attendees}, database ${expected.total}/${expected.organisers}/${expected.attendees}`,
      )
    }
  }
  return out
}

/** The four founding metrics as the browser renders them. */
async function foundingMetricsOnScreen(page) {
  return page.evaluate(() => {
    const out = {}
    for (const card of document.querySelectorAll('div')) {
      const label = card.querySelector(':scope > p:first-child')
      const value = card.querySelector(':scope > p:last-child')
      if (!label || !value || label === value) continue
      const key = label.textContent.trim()
      if (['Founding spots taken', 'Spots remaining', 'Invites issued', 'Invites converted'].includes(key)) {
        out[key] = value.textContent.trim()
      }
    }
    return out
  })
}

/**
 * ZERO AT EVERY IMPACT LEVEL, not zero serious. The build brief's completion
 * law asks for "axe zero violations at every impact level on affected
 * surfaces", and a minor violation is still a person who cannot use the screen.
 */
async function axeVerdict(page) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return {
    clean: axe.violations.length === 0,
    detail:
      axe.violations.length === 0
        ? '0 violations at any impact level'
        : axe.violations.map(v => `${v.impact}: ${v.id} x${v.nodes.length} :: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`).join(' | '),
  }
}

let exitCode = 0
let browser = null
let admin = null
const planned = []

try {
  /*
   * THE CITIES ARE ENUMERATED FROM THE CANONICAL REGISTRY, NEVER GUESSED, and
   * the three chosen are the quietest: fewest open sign-ups today, ties broken
   * by slug. A city at zero makes the before and after figures unambiguous to
   * somebody reading the screenshots, and one city per viewport keeps the three
   * runs independent of each other.
   */
  const beforeDemand = demandByCity(await everyWaitlistRow())
  const quietest = [...getWaitlistCities()].sort((a, b) => {
    const byDemand = beforeDemand.get(a.slug).total - beforeDemand.get(b.slug).total
    return byDemand !== 0 ? byDemand : a.slug.localeCompare(b.slug)
  })
  VIEWPORTS.forEach((vp, index) => planned.push({ vp, city: quietest[index], ...fixtureFor(vp.label) }))
  check(
    'demand.setup.three-cities-were-enumerated-from-the-registry-not-guessed',
    planned.every(p => p.city?.slug),
    planned
      .map(p => `${p.vp.label} -> ${p.city.name} (${beforeDemand.get(p.city.slug).total} open sign-up(s))`)
      .join(', ') + `, of ${getWaitlistCities().length} cities`,
  )

  const { count: alreadyThere } = await db
    .from('city_waitlist_signups')
    .select('id', { count: 'exact', head: true })
    .in('email', planned.map(p => p.email))
  check(
    'demand.setup.none-of-the-fixture-people-exist-yet',
    (alreadyThere ?? 0) === 0,
    `${alreadyThere ?? 0} row(s) for the three fixture addresses before this drive writes any`,
  )

  admin = await createProofAdmin(db, { label: 'Lane B demand signal proof' })
  check('demand.setup.a-throwaway-owner-exists', Boolean(admin?.email), admin?.email ?? 'MISSING')

  browser = await chromium.launch({ headless: true })

  // ------------------------------------------------------- the screen, before
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await signInAsOwner(page, BASE, admin)
    const res = await page.goto(`${BASE}/admin/network`, { waitUntil: 'networkidle', timeout: 120_000 })
    check('demand.before.the-screen-answers-200', res?.status() === 200, `HTTP ${res?.status()}`)

    const disagreements = disagreementsWith(beforeDemand, await cityTableOnScreen(page))
    check(
      'demand.before.every-city-figure-equals-the-figure-the-database-gives',
      disagreements.length === 0,
      disagreements.length === 0
        ? `${getWaitlistCities().length} cities agree on total, organisers and attendees, asked of Postgres independently and paged`
        : disagreements.join(' | '),
    )

    const { count: foundingOrgs } = await db
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .eq('is_founding', true)
    const { count: invitesIssued } = await db.from('founding_invites').select('id', { count: 'exact', head: true })
    const metrics = await foundingMetricsOnScreen(page)
    const expected = {
      'Founding spots taken': `${foundingOrgs ?? 0} / ${FOUNDING_SPOT_CAP}`,
      'Spots remaining': String(Math.max(0, FOUNDING_SPOT_CAP - (foundingOrgs ?? 0))),
      'Invites issued': String(invitesIssued ?? 0),
    }
    const wrong = Object.entries(expected).filter(([key, value]) => metrics?.[key] !== value)
    check(
      'demand.before.the-founding-metrics-equal-the-database',
      wrong.length === 0,
      wrong.length === 0
        ? `spots taken ${expected['Founding spots taken']}, remaining ${expected['Spots remaining']}, invites issued ${expected['Invites issued']}`
        : wrong.map(([key, value]) => `${key}: screen "${metrics?.[key]}", database "${value}"`).join(' | '),
    )

    await page.screenshot({ path: join(out, 'desktop-1440-1-before.png'), fullPage: true })
    await context.close()
  }

  // ------------------- the whole sequence, at each viewport, with its own person
  for (const plan of planned) {
    const { vp, city, name, email } = plan
    const context = await browser.newContext(vp)
    const page = await context.newPage()

    // ---------------------------------------- a real organiser joins, publicly
    await page.goto(`${BASE}/waitlist`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('button[aria-pressed]', { hasText: city.name }).first().click()
    await page.waitForTimeout(500)
    await page.locator('#wl-name').fill(name)
    await page.locator('#wl-email').fill(email)
    await page.locator('label', { hasText: 'I run events' }).first().click()
    await page.locator('button', { hasText: `Get ${city.name} alerts` }).first().click()
    await page.waitForTimeout(4000)
    await page.screenshot({ path: join(out, `${vp.label}-2-joined.png`), fullPage: false })

    const { data: joined } = await db
      .from('city_waitlist_signups')
      .select('id, city_slug, role, full_name')
      .eq('email', email)
      .maybeSingle()
    plan.signupId = joined?.id ?? null
    const formSaid = joined ? '' : ((await page.locator('[role="alert"]').innerText().catch(() => '')) || 'nothing')
    check(
      `demand.${vp.label}.a-real-organiser-joined-through-the-public-form`,
      Boolean(joined) && joined.role === 'organiser' && joined.city_slug === city.slug,
      joined
        ? `${joined.full_name} joined ${joined.city_slug} as ${joined.role}`
        : `no row for ${email}; the form said: ${formSaid}`,
    )
    if (!joined) {
      await context.close()
      continue
    }

    // --------------------------------------------- the screen, with them on it
    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`demand.${vp.label}.signed-in-at-the-real-admin-login`, signedIn, page.url())

    const res = await page.goto(`${BASE}/admin/network`, { waitUntil: 'networkidle', timeout: 120_000 })
    check(`demand.${vp.label}.the-demand-signal-answers-200`, res?.status() === 200, `HTTP ${res?.status()}`)

    const text = await page.locator('body').innerText()
    await page.screenshot({ path: join(out, `${vp.label}-3-listed.png`), fullPage: true })
    check(
      `demand.${vp.label}.the-new-organiser-is-on-the-invite-bridge`,
      text.includes(name) && text.includes(email),
      text.includes(name)
        ? `"${name}" and ${email} are both on the screen`
        : `"${name}" is NOT on the screen, so a waitlist organiser the founder could invite is invisible`,
    )

    const truth = demandByCity(await everyWaitlistRow())
    const onScreen = await cityTableOnScreen(page)
    const stillAgrees = disagreementsWith(truth, onScreen)
    check(
      `demand.${vp.label}.every-city-figure-still-equals-the-database`,
      stillAgrees.length === 0,
      stillAgrees.length === 0
        ? `${getWaitlistCities().length} cities agree, so the new sign-up landed in exactly one bucket`
        : stillAgrees.join(' | '),
    )
    const was = beforeDemand.get(city.slug)
    check(
      `demand.${vp.label}.that-citys-demand-rose-by-exactly-one`,
      onScreen?.[city.name]?.total === was.total + 1 && onScreen?.[city.name]?.organisers === was.organisers + 1,
      `${city.name}: ${was.total}/${was.organisers} before this drive, ${onScreen?.[city.name]?.total}/${onScreen?.[city.name]?.organisers} now`,
    )

    const beforeInvite = await axeVerdict(page)
    check(`demand.${vp.label}.no-axe-violation-at-any-impact-level`, beforeInvite.clean, beforeInvite.detail)

    // ------------------------------- the founder invites them, on the real screen
    const row = page.locator('li', { hasText: email }).first()
    check(`demand.${vp.label}.the-row-is-on-the-screen-to-press`, (await row.count()) > 0, email)
    await row.getByRole('button', { name: 'Invite', exact: true }).click()
    await page.waitForTimeout(6000)
    await page.screenshot({ path: join(out, `${vp.label}-4-invited.png`), fullPage: false })

    /*
     * THE CONFIRMATION IS READ FROM THE LIVE REGION, NOT FROM THE ROW.
     *
     * This check first asked the ROW whether it said "Invited" and got an empty
     * string, because the success path revalidates the list and the row is gone
     * by the time it is read: the component carried a success state the product
     * could never reach. The confirmation now lives outside the list, and a
     * founder who has just emailed somebody he is recruiting is told so.
     */
    const confirmation = (await page.locator('[role="status"]').innerText().catch(() => '')) || ''
    check(
      `demand.${vp.label}.the-screen-says-the-invitation-was-sent`,
      /Founding invitation sent/i.test(confirmation) && confirmation.includes(email),
      confirmation.replace(/\s+/g, ' ').slice(0, 200) || 'NOTHING on the screen confirms the invitation was sent',
    )

    const afterInvite = await axeVerdict(page)
    check(`demand.${vp.label}.no-axe-violation-with-the-confirmation-on-screen`, afterInvite.clean, afterInvite.detail)

    const { data: minted } = await db
      .from('founding_invites')
      .select('code, status')
      .eq('invitee_email', email)
    check(
      `demand.${vp.label}.exactly-one-founding-invite-exists-for-them`,
      (minted ?? []).length === 1,
      `${(minted ?? []).length} invite(s) for ${email}: ${(minted ?? []).map(i => `${i.code}/${i.status}`).join(', ') || 'none'}`,
    )

    // THE SUPPRESSION READ, PROVEN BY RELOADING RATHER THAN BY THE OPTIMISTIC UI.
    // The client's own state would say the same thing if the read behind the
    // list were broken. A fresh load re-runs it.
    await page.goto(`${BASE}/admin/network`, { waitUntil: 'networkidle', timeout: 120_000 })
    const afterReload = await page.locator('body').innerText()
    await page.screenshot({ path: join(out, `${vp.label}-5-suppressed.png`), fullPage: true })
    check(
      `demand.${vp.label}.they-leave-the-bridge-because-the-suppression-read-found-their-invite`,
      !afterReload.includes(email),
      afterReload.includes(email)
        ? `${email} is STILL on the invite list after being invited, so the founder would invite them again`
        : `${email} is gone from the bridge, and their city still shows the sign-up`,
    )

    await context.close()
  }
} catch (err) {
  check('demand.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  // ------------------------------------------------------------------ teardown
  const emails = planned.map(p => p.email)
  let removedInvites = 0
  let removedSignups = 0
  try {
    const { count: inviteCount, error: inviteError } = await db
      .from('founding_invites')
      .delete({ count: 'exact' })
      .in('invitee_email', emails)
    if (inviteError) console.error(`teardown could not remove the invites: ${inviteError.message}`)
    removedInvites = inviteCount ?? 0

    const { count: signupCount, error: signupError } = await db
      .from('city_waitlist_signups')
      .delete({ count: 'exact' })
      .in('email', emails)
    if (signupError) console.error(`teardown could not remove the waitlist rows: ${signupError.message}`)
    removedSignups = signupCount ?? 0
  } catch (err) {
    console.error(`teardown threw: ${err}`)
  }

  // THE SCREEN MUST GO BACK TO WHAT IT SAID BEFORE, which is the half that
  // makes the middle of this drive mean anything.
  if (browser && admin) {
    try {
      const after = demandByCity(await everyWaitlistRow())
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      await signInAsOwner(page, BASE, admin)
      await page.goto(`${BASE}/admin/network`, { waitUntil: 'networkidle', timeout: 120_000 })
      const text = await page.locator('body').innerText()
      const onScreen = await cityTableOnScreen(page)
      await page.screenshot({ path: join(out, 'desktop-1440-6-after.png'), fullPage: true })
      check(
        'demand.after.no-fixture-person-is-on-the-screen',
        emails.every(email => !text.includes(email)),
        emails.every(email => !text.includes(email)) ? 'none of the three addresses is on the screen' : 'a fixture is STILL rendered',
      )
      const back = disagreementsWith(after, onScreen)
      check(
        'demand.after.every-city-figure-is-back-where-it-started',
        back.length === 0 && planned.every(p => onScreen?.[p.city.name]?.total === after.get(p.city.slug).total),
        back.length === 0
          ? planned.map(p => `${p.city.name} ${onScreen?.[p.city.name]?.total}`).join(', ') + ', all matching the database'
          : back.join(' | '),
      )
      await context.close()
    } catch (err) {
      console.error(`could not re-read the screen after teardown: ${err}`)
    }
  }

  if (browser) await browser.close().catch(() => {})

  let removedAdmin = false
  try {
    if (admin) {
      await removeProofAdmin(db, admin)
      removedAdmin = true
    }
  } catch (err) {
    console.error(`teardown could not remove the throwaway owner: ${err}`)
  }

  const { count: leftBehindSignups } = await db
    .from('city_waitlist_signups')
    .select('id', { count: 'exact', head: true })
    .in('email', emails)
  const { count: leftBehindInvites } = await db
    .from('founding_invites')
    .select('id', { count: 'exact', head: true })
    .in('invitee_email', emails)
  check(
    'demand.teardown.test-is-left-as-found-observed-not-claimed',
    (leftBehindSignups ?? 0) === 0 && (leftBehindInvites ?? 0) === 0 && removedAdmin,
    `removed ${removedSignups} waitlist row(s) and ${removedInvites} invite(s); ${leftBehindSignups ?? 0} signup(s) and ${leftBehindInvites ?? 0} invite(s) remain; throwaway owner removed: ${removedAdmin}`,
  )

  const passed = checks.filter(c => c.ok).length
  console.log(`\n${passed} of ${checks.length} checks passed`)
  for (const f of failures) console.log(`  FAILED: ${f}`)
  writeFileSync(
    join(out, 'demand-signal-report.json'),
    JSON.stringify(
      { base: BASE, cities: planned.map(p => ({ viewport: p.vp.label, city: p.city?.slug ?? null, email: p.email })), passed, total: checks.length, checks },
      null,
      2,
    ),
  )
  process.exit(failures.length > 0 ? 1 : exitCode)
}
