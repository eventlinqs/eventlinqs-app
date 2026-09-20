/**
 * LB-REACHWHOLE, DRIVEN: MORE THAN A THOUSAND TRACKED ROWS ON ONE REAL EVENT,
 * AND A PANEL THAT COUNTS ALL OF THEM.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DRIVE AND NOT THE UNIT TESTS ALONE. The unit tests stub the client,
 * so they prove the module PAGES. They cannot prove that the thing being paged
 * past is real, because the 1,000-row ceiling belongs to the Supabase project
 * and not to the code. The only honest proof is to put more than a thousand
 * rows behind one event on the real TEST project and read what the organiser's
 * own screen says. Before this item it would have said 1,000.
 *
 * WHAT IT DOES, in order:
 *   1. purges any prior lane-b-reachwhole fixture, then builds one: an
 *      organisation, an organiser, an event, a tier.
 *   2. mints two share links and writes 1,150 share_link_events against them,
 *      700 views and 450 clicks, which is 150 past the ceiling.
 *   3. signs the organiser in and opens their reach page at 1440, 768 and 390.
 *   4. reads the four figures off the page and compares each against a count
 *      the DATABASE performs, not against a number this script worked out.
 *   5. purges, then RE-READS to prove the purge worked.
 *
 * THE ASSERTION THAT IS THE WHOLE POINT is `views + clicks > 1000` AND every
 * figure equal to the server's own count. Either alone is weak: a panel can
 * agree with a count that is itself capped, and a total over a thousand can be
 * reached with the wrong split.
 *
 * WHAT IT LEAVES ON TEST: nothing. Everything hangs off one disposable
 * organisation whose slug begins `lane-b-reachwhole-presents-`, and the teardown
 * re-reads the database rather than trusting its own delete.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-reachwhole-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-REACHWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-REACHWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-reachwhole-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

/**
 * 1,150 rows, which is 150 past the documented ceiling
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19:
 * "By default, Supabase projects return a maximum of 1,000 rows"). Far enough
 * past that an off-by-one cannot be mistaken for a pass, small enough that the
 * teardown is one delete.
 */
const VIEWS = 700
const CLICKS = 450

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

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

/** The server's own count. `head: true` returns no rows, so no ceiling applies. */
async function serverCount(table, build) {
  const { count, error } = await build(
    db.from(table).select('id', { count: 'exact', head: true }),
  )
  if (error) throw new Error(`counting ${table}: ${error.message}`)
  if (count === null) throw new Error(`counting ${table}: no count came back`)
  return count
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  log('purging any prior lane-b-reachwhole fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const stamp = Date.now().toString(36)
  const ownerEmail = `lane-b-reachwhole+${stamp}@eventlinqs.test`
  // Shaped as the other drives shape theirs: a uuid plus the three characters
  // the password policy needs, and no literal text at all. A prefix naming the
  // lane reads better and is exactly what `no-plaintext-credential` refuses,
  // correctly: it cannot tell a generated password from a typed one, and the
  // identifier is called `password`.
  const ownerPassword = `${randomUUID()}Aa1`

  const { ownerId, event } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: 20,
    priceCents: 3500,
    log,
    brand: {
      org: 'Lane B Reachwhole Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Reachwhole Night',
      eventSlug: 'lane-b-reachwhole-night',
      owner: 'Lane B Reachwhole Owner',
    },
  })
  log(`event ${event.id} (${event.slug}), organiser ${ownerId}`)

  // ---------------------------------------------------------------- the rows
  const links = [
    { id: randomUUID(), channel: 'whatsapp', code: `lbrw${stamp}w` },
    { id: randomUUID(), channel: 'instagram', code: `lbrw${stamp}i` },
  ]
  for (const l of links) {
    const { error } = await db.from('share_links').insert({
      id: l.id,
      event_id: event.id,
      channel: l.channel,
      code: l.code,
      created_by: ownerId,
    })
    if (error) throw new Error(`minting the ${l.channel} share link: ${error.message}`)
  }
  log(`minted ${links.length} share links`)

  /*
   * Written in batches because one insert of 1,150 rows is a large body, and
   * split across the two links so the per-channel table has something to say.
   */
  const rows = []
  for (let i = 0; i < VIEWS; i += 1) {
    rows.push({
      link_id: links[i % 2].id,
      kind: 'view',
      visitor_hash: `lane-b-reachwhole-${stamp}-v${i}`,
    })
  }
  for (let i = 0; i < CLICKS; i += 1) {
    rows.push({
      link_id: links[i % 2].id,
      kind: 'click',
      visitor_hash: `lane-b-reachwhole-${stamp}-c${i}`,
    })
  }
  for (let i = 0; i < rows.length; i += 250) {
    const batch = rows.slice(i, i + 250)
    const { error } = await db.from('share_link_events').insert(batch)
    if (error) throw new Error(`writing tracked events at offset ${i}: ${error.message}`)
  }
  log(`wrote ${rows.length} share_link_events rows`)

  // The truth, asked of the database rather than assumed from the loop above.
  const linkIds = links.map(l => l.id)
  const trueViews = await serverCount('share_link_events', q =>
    q.in('link_id', linkIds).eq('kind', 'view'),
  )
  const trueClicks = await serverCount('share_link_events', q =>
    q.in('link_id', linkIds).eq('kind', 'click'),
  )
  const trueTotal = trueViews + trueClicks
  log(`database says: ${trueViews} views, ${trueClicks} clicks, ${trueTotal} tracked rows`)

  check(
    'lb-reachwhole.fixture.is-past-the-ceiling',
    trueTotal > 1000,
    `${trueTotal} tracked rows on one event, ${trueTotal - 1000} past the documented 1,000-row ceiling. Below this the drive would prove nothing.`,
  )

  // ------------------------------------------------------------- the driving
  const browser = await chromium.launch()
  let organiserState = null
  try {
    const signIn = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const signInPage = await signIn.newPage()
    await signInPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(signInPage)
    await signInPage.getByLabel(/email/i).first().fill(ownerEmail)
    await signInPage.getByLabel(/password/i).first().fill(ownerPassword)
    await Promise.all([
      signInPage
        .waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 })
        .catch(() => {}),
      signInPage.getByRole('button', { name: /sign in|log in/i }).first().click(),
    ])
    await signInPage.waitForTimeout(2000)
    organiserState = await signIn.storageState()
    await signIn.close()

    check(
      'lb-reachwhole.organiser.is-signed-in',
      Boolean(organiserState?.cookies?.length),
      `${organiserState?.cookies?.length ?? 0} cookies held after sign-in`,
    )

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: organiserState,
      })
      const page = await context.newPage()

      const failures = []
      page.on('pageerror', e => failures.push(String(e)))

      const response = await page.goto(`${BASE}/dashboard/events/${event.id}/reach`, {
        waitUntil: 'domcontentloaded',
        timeout: 180000,
      })
      await page.waitForTimeout(3000)
      await answerTheCookieBanner(page)

      check(
        `lb-reachwhole.${vp.label}.page-answers-200`,
        response?.status() === 200,
        `HTTP ${response?.status()} at ${vp.width}x${vp.height}`,
      )

      const read = async key => {
        const v = await page
          .locator(`[data-reach-stat="${key}"]`)
          .first()
          .getAttribute('data-reach-value')
          .catch(() => null)
        return v === null ? null : Number(v)
      }
      const shown = {
        views: await read('views'),
        clicks: await read('clicks'),
        conversions: await read('conversions'),
        tickets: await read('tickets'),
      }
      log(`${vp.label} panel shows ${JSON.stringify(shown)}`)

      check(
        `lb-reachwhole.${vp.label}.views-are-every-view`,
        shown.views === trueViews,
        `the panel says ${shown.views}, the database counts ${trueViews}. Before this item an unpaged read stopped at 1,000 for both figures together.`,
      )
      check(
        `lb-reachwhole.${vp.label}.clicks-are-every-click`,
        shown.clicks === trueClicks,
        `the panel says ${shown.clicks}, the database counts ${trueClicks}`,
      )
      check(
        `lb-reachwhole.${vp.label}.counts-more-than-the-ceiling`,
        (shown.views ?? 0) + (shown.clicks ?? 0) === trueTotal,
        `${(shown.views ?? 0) + (shown.clicks ?? 0)} of ${trueTotal} tracked rows reached the panel. The old code could not exceed 1,000 here.`,
      )

      /*
       * The reconciliation. This event sold nothing, so zero ties out to zero
       * and the balance warning must NOT be on screen. It is asserted rather
       * than assumed because the warning is the branch this item made reachable,
       * and a branch that is always taken is as broken as one that never is.
       */
      const body = await page.locator('body').innerText()
      check(
        `lb-reachwhole.${vp.label}.balances-so-it-does-not-warn`,
        !body.includes('do not currently balance'),
        'no balance warning on a panel whose buckets tie out',
      )

      check(
        `lb-reachwhole.${vp.label}.no-client-exception`,
        failures.length === 0,
        failures.length === 0 ? 'clean' : failures.join(' | '),
      )

      await page.screenshot({
        path: join(OUT, 'drive', `reach-${vp.label}.png`),
        fullPage: true,
      })

      /*
       * THE SECOND CALLER, because `fetchReachSummary` is rendered on the
       * launch kit as well and this item changed its failure mode from
       * "return zeros" to "throw". A change that fixes one page and puts the
       * other into an error boundary is not a fix, and the only way to know is
       * to open it.
       */
      const kitFailures = []
      page.on('pageerror', e => kitFailures.push(String(e)))
      const kit = await page.goto(`${BASE}/dashboard/events/${event.id}/launch-kit`, {
        waitUntil: 'domcontentloaded',
        timeout: 180000,
      })
      await page.waitForTimeout(2500)
      const kitBody = await page.locator('body').innerText()
      check(
        `lb-reachwhole.${vp.label}.launch-kit-still-renders`,
        kit?.status() === 200 &&
          kitFailures.length === 0 &&
          !/something went wrong|application error/i.test(kitBody),
        `HTTP ${kit?.status()}, ${kitFailures.length} client error(s). The launch kit is the other caller of fetchReachSummary.`,
      )
      await page.screenshot({
        path: join(OUT, 'drive', `launch-kit-${vp.label}.png`),
        fullPage: true,
      })

      await context.close()
    }
  } finally {
    await browser.close()
  }

  // ------------------------------------------------------------- the teardown
  log('purging the fixture')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const leftoverOrgs = await serverCount('organisations', q => q.like('slug', `${SLUG_PREFIX}-%`))
  const leftoverEvents = await serverCount('share_link_events', q => q.in('link_id', linkIds))
  check(
    'lb-reachwhole.teardown.nothing-is-left-on-test',
    leftoverOrgs === 0 && leftoverEvents === 0,
    `${leftoverOrgs} organisation(s) and ${leftoverEvents} tracked row(s) remain, re-read from the database after the purge`,
  )

  const failed = results.filter(r => !r.ok)
  lines.push('')
  lines.push(`=== ${results.length - failed.length}/${results.length} checks passed ===`)
  writeFileSync(join(OUT, 'lb-reachwhole-drive.txt'), lines.join('\n'), 'utf8')
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
  if (failed.length > 0) {
    for (const f of failed) console.error(`  FAILED: ${f.name} :: ${f.detail}`)
    process.exit(1)
  }
}

main().catch(async err => {
  log(`FATAL ${err.stack ?? err}`)
  try {
    await purgeFixtures(db, log, SLUG_PREFIX)
  } catch (e) {
    log(`teardown after failure also failed: ${e.message}`)
  }
  writeFileSync(join(OUT, 'lb-reachwhole-drive.txt'), lines.join('\n'), 'utf8')
  process.exit(1)
})
