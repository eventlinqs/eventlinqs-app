/**
 * UX3.3 DRIVEN PROOF: THE OWNER'S DAILY ORDER-ALERT CEILING COUNTS THE RIGHT DAY,
 * INCLUDING ON THE TWO DAYS A YEAR THAT ARE NOT 24 HOURS LONG.
 *
 * THE DEFECT THIS PROVES FIXED. `platformDayStart` subtracted the Sydney wall
 * clock from the instant, which is the day start only while a day is 24 hours
 * long. On 4 October 2026, when AEDT begins, it answered 3 October 11:00 pm: not
 * merely an hour out, the WRONG DATE. `individualSentToday` counts order
 * notifications with `sent_at >= platformDayStart(now)` and `routeFor` cuts over
 * to a digest at PLATFORM_ORDER_ALERTS_PER_DAY, so on that morning the window
 * reached back into the previous evening and yesterday's orders were counted
 * against today's ceiling. The owner would have been dropped to a digest early,
 * on a day nobody had told them about. That day is three weeks after this proof
 * was written.
 *
 * WHAT IS DRIVEN AND WHAT IS NOT, stated plainly rather than implied, because
 * the distinction is the whole reason this file has three parts.
 *
 *   PART A, the live path.  The REAL cron route /api/cron/platform-notify is
 *     called over HTTP against the running server, with seeded rows, and its own
 *     JSON is read back for `sent` and `held`. This proves the dispatcher, the
 *     ceiling and the digest all still work today, end to end, in the server.
 *     It CANNOT prove the daylight-saving case, because the route reads the real
 *     clock and the clock cannot be moved to October.
 *   PART B, the boundary at the transition.  The REAL exported
 *     `platformDayStart` and `routeFor` are called with `now` pinned to the
 *     4 October 2026 instant, against REAL rows in the TEST database, using the
 *     product's own count filter. The old boundary is computed alongside so the
 *     report shows the decision FLIP rather than asserting it.
 *     REPLICATED, and named as such: the SELECT. `platform-send.ts` imports
 *     `server-only`, which is not an installable package here, so no script can
 *     import the dispatcher. This script therefore issues the same filter and
 *     ASSERTS, against the dispatcher's source, that the filter it issues is the
 *     filter the product issues; a divergence fails the proof.
 *   PART C, the owner's screen.  /admin/notifications at 390, 768 and 1440 with
 *     the seeded rows visible, and axe at every impact level.
 *
 * Every row it writes carries `lane-c` and every one is deleted in the finally.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/ux3-day-boundary-proof.mjs --out C:/dev/EVIDENCE/UX3-DST
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import {
  PLATFORM_ORDER_ALERTS_PER_DAY,
  platformDayStart,
  routeFor,
} from '@/lib/notifications/platform-policy'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX3-DST'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3200'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/** The tag every row this script writes carries, so lane C's rows are its own. */
const LANE = `lane-c-dst-${Date.now().toString(36)}`

/**
 * THE TRANSITION. 4 October 2026, when Sydney moves to AEDT and 2am becomes 3am.
 * 2026-10-03T23:00Z is 10:00 am on that morning.
 */
const NOW_AT_TRANSITION = new Date('2026-10-03T23:00:00.000Z')
/** 3 October 2026, 11:30 pm AEST. The PREVIOUS evening, and the whole point. */
const PREVIOUS_EVENING = new Date('2026-10-03T13:30:00.000Z')
/** 4 October 2026, 9:00 am AEDT. Genuinely inside the day under test. */
const SAME_MORNING = new Date('2026-10-03T22:00:00.000Z')

/** The implementation that shipped, kept here so the report shows the flip. */
function oldPlatformDayStart(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const secondsIntoDay = get('hour') * 3600 + get('minute') * 60 + get('second')
  return new Date(now.getTime() - secondsIntoDay * 1000 - now.getMilliseconds())
}

/** One seeded notification. `sent` rows need a channel; `pending` rows must not have one. */
function seedRow(n, { state, sentAt, occurredAt }) {
  const id = randomUUID()
  return {
    id,
    kind: 'order_paid',
    occurred_at: (occurredAt ?? sentAt ?? new Date()).toISOString(),
    summary: `Paid order ${LANE}-${String(n).padStart(2, '0')}: Lane C boundary proof`,
    detail: { order_number: `${LANE}-${n}`, total_cents: 2600 + n, currency: 'AUD' },
    admin_path: '/admin/notifications',
    delivery_state: state,
    dedupe_key: `${LANE}:${n}`,
    sent_at: state === 'pending' ? null : (sentAt ?? new Date()).toISOString(),
    channel: state === 'pending' ? null : 'email',
    attempts: state === 'pending' ? 0 : 1,
  }
}

async function insert(rows) {
  const { error } = await db.from('platform_notifications').insert(rows)
  if (error) throw new Error(`seed insert failed: ${error.message}`)
}

/**
 * The dispatcher's own count, issued here because the dispatcher cannot be
 * imported. Verified against its source below rather than trusted.
 */
async function countIndividualSince(kind, since) {
  const { count, error } = await db
    .from('platform_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
    .in('delivery_state', ['sent', 'escalated'])
    .neq('channel', 'digest')
    .gte('sent_at', since.toISOString())
  if (error) throw new Error(`count failed: ${error.message}`)
  return count ?? 0
}

let browser = null
const report = { base: BASE, lane: LANE, parts: {} }

try {
  /* ------------------------------------------------------------------ *
   * PART A. The real cron route, over HTTP, against the running server. *
   *                                                                     *
   * FIRST, and on a queue carrying nothing but one row of its own. The  *
   * ceiling rows PART B seeds are dated October, and `individualSentToday`
   * has no upper bound, so a future-dated row counts as sent TODAY. Run  *
   * in the other order this route would meet a ceiling that only exists  *
   * because the proof put it there, and its answer would say nothing     *
   * about the product.                                                   *
   * ------------------------------------------------------------------ */
  /*
   * DATED 2020 ON PURPOSE, and the reason is worth writing down because the
   * first run of this proof failed on it and the product was innocent.
   * `loadPending` reads OLDEST FIRST and takes 50, which is correct: an owner
   * should read what happened in the order it happened. TEST carried a backlog
   * of more than 50 pending rows, so a row inserted with `occurred_at = now`
   * sorted to the very back and the route quite properly did not reach it. The
   * proof then reported the row "still pending" as though the route had failed.
   * Dating it 2020 puts it at the FRONT of the queue, so one tick reaches it and
   * nobody else's backlog has to be drained to prove the route works.
   */
  await insert([seedRow(0, { state: 'pending', occurredAt: new Date('2020-01-01T00:00:00.000Z') })])
  if (!CRON_SECRET) {
    check('ux3.3.cron.driven', false, 'CRON_SECRET is not in the environment, so the real route could not be called')
  } else {
    const res = await fetch(`${BASE}/api/cron/platform-notify`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const body = await res.json().catch(() => ({}))
    report.parts.cron = { status: res.status, body }
    check(
      'ux3.3.cron.driven',
      res.status === 200 && body.ok === true,
      `the real /api/cron/platform-notify answered ${res.status} ${JSON.stringify(body).slice(0, 200)}`,
    )
    // Observed in the database, not taken from the route's own summary.
    const { data: after } = await db
      .from('platform_notifications')
      .select('delivery_state, channel, sent_at')
      .eq('dedupe_key', `${LANE}:0`)
      .single()
    check(
      'ux3.3.cron.moved-the-queue',
      Boolean(after) && after.delivery_state !== 'pending',
      `the seeded pending row came out of the run as "${after?.delivery_state ?? 'GONE'}" on channel "${after?.channel ?? 'none'}"`,
    )
  }

  /* ------------------------------------------------------------------ *
   * PART B. The boundary at the transition, against real rows.          *
   * ------------------------------------------------------------------ */

  // The replicated filter is only honest if it is the product's filter.
  const dispatcherSource = readFileSync('src/lib/notifications/platform-send.ts', 'utf8')
  const filterClauses = [
    ".eq('kind', kind)",
    ".in('delivery_state', ['sent', 'escalated'])",
    ".neq('channel', 'digest')",
    ".gte('sent_at', since)",
  ]
  const missing = filterClauses.filter((c) => !dispatcherSource.includes(c))
  check(
    'ux3.3.filter.matches-the-product',
    missing.length === 0,
    missing.length === 0
      ? 'the count filter this proof issues is character for character the one the dispatcher issues'
      : `the dispatcher no longer issues: ${missing.join(' , ')}. This proof is measuring something else.`,
  )

  // Twenty orders on the PREVIOUS EVENING, which is the whole ceiling's worth,
  // and one still pending. A correct boundary must not count any of the twenty.
  await insert([
    ...Array.from({ length: PLATFORM_ORDER_ALERTS_PER_DAY }, (_, i) =>
      seedRow(i + 1, { state: 'sent', sentAt: PREVIOUS_EVENING }),
    ),
    seedRow(99, { state: 'pending' }),
  ])

  const fixedStart = platformDayStart(NOW_AT_TRANSITION)
  const oldStart = oldPlatformDayStart(NOW_AT_TRANSITION)
  const sydney = (d) =>
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(d)

  check(
    'ux3.3.boundary.is-midnight-on-the-transition-day',
    sydney(fixedStart).includes('4 Oct 2026') && sydney(fixedStart).includes('12:00:00 am'),
    `the day starts at ${sydney(fixedStart)} (the shipped code said ${sydney(oldStart)})`,
  )

  const countedNow = await countIndividualSince('order_paid', fixedStart)
  const countedOld = await countIndividualSince('order_paid', oldStart)
  check(
    'ux3.3.count.yesterday-does-not-count',
    countedNow === 0,
    `${countedNow} of the ${PLATFORM_ORDER_ALERTS_PER_DAY} orders sent at ${sydney(PREVIOUS_EVENING)} count towards the 4 October ceiling`,
  )
  check(
    'ux3.3.count.the-shipped-code-counted-them',
    countedOld === PLATFORM_ORDER_ALERTS_PER_DAY,
    `the shipped boundary counted ${countedOld} of them, which is what made the next alert a digest`,
  )
  check(
    'ux3.3.route.flips',
    routeFor('order_paid', countedNow) === 'individual' &&
      routeFor('order_paid', countedOld) === 'digest',
    `the 21st order is routed "${routeFor('order_paid', countedNow)}" now and was routed "${routeFor('order_paid', countedOld)}" before`,
  )

  // And the ceiling still bites when the orders really are from today.
  await db.from('platform_notifications').delete().like('dedupe_key', `${LANE}:%`)
  await insert([
    ...Array.from({ length: PLATFORM_ORDER_ALERTS_PER_DAY }, (_, i) =>
      seedRow(i + 1, { state: 'sent', sentAt: SAME_MORNING }),
    ),
    seedRow(99, { state: 'pending' }),
  ])
  const countedSameDay = await countIndividualSince('order_paid', platformDayStart(NOW_AT_TRANSITION))
  check(
    'ux3.3.ceiling.still-bites',
    countedSameDay >= PLATFORM_ORDER_ALERTS_PER_DAY &&
      routeFor('order_paid', countedSameDay) === 'digest',
    `${countedSameDay} orders sent at ${sydney(SAME_MORNING)} DO count, so the next one is routed "${routeFor('order_paid', countedSameDay)}"`,
  )

  report.parts.boundary = {
    now: NOW_AT_TRANSITION.toISOString(),
    fixedStart: fixedStart.toISOString(),
    oldStart: oldStart.toISOString(),
    countedNow,
    countedOld,
    countedSameDay,
  }

  /* ------------------------------------------------------------------ *
   * PART C. The owner's screen, at all three widths.                    *
   * ------------------------------------------------------------------ */
  const adminEmail = `ux3-dst-${Date.now().toString(36)}@eventlinqs.test`
  const adminPassword = `${randomUUID()}Aa1`
  let adminUserId = null
  try {
    const created = await db.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    })
    if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
    adminUserId = created.data.user.id
    await db.from('profiles').upsert({
      id: adminUserId,
      email: adminEmail,
      full_name: 'Lane C Boundary Proof',
      display_name: 'Lane C Boundary Proof',
      is_verified: true,
    })
    const { error: auErr } = await db
      .from('admin_users')
      .insert({ id: adminUserId, role: 'super_admin', display_name: 'Lane C Boundary Proof' })
    if (auErr) throw new Error(`admin_users insert: ${auErr.message}`)

    browser = await chromium.launch()
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.locator('input[name="email"]').fill(adminEmail)
      await page.locator('input[name="password"]').fill(adminPassword)
      const submit = page.locator('button[type="submit"]')
      await submit.waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]')?.disabled,
        undefined,
        { timeout: 30000 },
      )
      await submit.click()
      await Promise.race([
        page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
        page
          .waitForFunction(
            () =>
              [...document.querySelectorAll('[role=alert]')].some(
                (e) => (e.textContent ?? '').trim().length > 0,
              ),
            undefined,
            { timeout: 60000 },
          )
          .catch(() => {}),
      ])
      if (new URL(page.url()).pathname.endsWith('/admin/login')) {
        const shown = await page.locator('[role=alert]').allInnerTexts().catch(() => [])
        await page.screenshot({ path: join(out, `admin-login-refused-${vp.label}.png`), fullPage: true })
        check(`ux3.3.${vp.label}.login`, false, `admin sign-in refused: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
        await ctx.close()
        continue
      }

      await page.goto(`${BASE}/admin/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
      await page.screenshot({ path: join(out, `admin-notifications-${vp.label}.png`), fullPage: true })

      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        `ux3.3.${vp.label}.feed-renders-the-seeded-rows`,
        text.includes(LANE),
        `the lane C rows are readable on the screen at ${vp.width}px`,
      )

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      writeFileSync(
        join(out, `axe-admin-notifications-${vp.label}.json`),
        JSON.stringify({ url: page.url(), violations: axe.violations }, null, 2),
      )
      check(
        `ux3.3.${vp.label}.axe`,
        axe.violations.length === 0,
        axe.violations.length === 0
          ? 'axe: 0 violations at every impact level'
          : `axe: ${axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
      )
      await ctx.close()
    }
  } finally {
    if (adminUserId) {
      await db.from('admin_users').delete().eq('id', adminUserId)
      await db.auth.admin.deleteUser(adminUserId).catch(() => {})
    }
  }
} finally {
  if (browser) await browser.close()
  // Every row this script wrote, and nothing else.
  const { error: cleanupError } = await db
    .from('platform_notifications')
    .delete()
    .like('dedupe_key', `${LANE}:%`)
  const { count: left } = await db
    .from('platform_notifications')
    .select('id', { count: 'exact', head: true })
    .like('dedupe_key', `${LANE}:%`)
  check(
    'ux3.3.cleanup',
    !cleanupError && (left ?? 0) === 0,
    cleanupError ? `cleanup failed: ${cleanupError.message}` : `${left ?? 0} lane C rows left behind`,
  )
  report.checks = checks
  report.failures = failures
  writeFileSync(join(out, 'ux3-day-boundary-report.json'), JSON.stringify(report, null, 2))
}

console.log(`\n  ${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`)
if (failures.length > 0) {
  console.log('\n  FAILURES')
  for (const f of failures) console.log(`    ${f}`)
}
process.exit(failures.length === 0 ? 0 : 1)
