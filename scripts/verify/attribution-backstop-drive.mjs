/**
 * THE ATTRIBUTION BACKSTOP, DRIVEN.
 *
 * GA3's invariant is that every order carries exactly one stored attribution
 * decision. Until today the only thing defending it on the database where it is
 * money was four call sites remembering one function, plus a repair somebody
 * runs by hand when a build goes red on a different machine. This drives the
 * scheduled repair that makes it a product guarantee, end to end, against TEST.
 *
 * WHAT IT PROVES, and each line is driven rather than asserted from source:
 *
 *   1. The route FAILS CLOSED. No header and a wrong secret are both refused
 *      before anything is read.
 *   2. The gate and the healer agree about what is broken: an order written by
 *      a path that skips the capture is reported by the SAME view the build
 *      guard reads.
 *   3. The grace is real. A freshly written order is left alone, because the
 *      resolver runs after the response and an order mid-flight is not missing.
 *   4. The repair works. The same order, aged past the window, is healed, and
 *      the record it gets is a real decision with a reason, a model name and a
 *      version, not a placeholder.
 *   5. The build guard that was RED goes green, run as the gate runs it.
 *   6. It is idempotent: a second run finds nothing and does nothing.
 *   7. The healed order reads correctly on the admin screen a fee argument is
 *      settled on, at 390, 768 and 1440, with no horizontal overflow.
 *
 * THE FIXTURE IS INVISIBLE TO DISCOVERY FOR ITS WHOLE LIFE. The organisation is
 * created `pending` and the event `unlisted`, the two values src/app/sitemap.ts
 * excludes, because three lanes share one TEST database and the sitemap holds
 * its snapshot for 300 seconds. A fixture that is visible for the minutes it
 * lives leaves another lane's gate reading URLs that 404, which is not a
 * hypothesis: it refused lane A's push on 14 September 2026.
 *
 * ONE THING IT TOUCHES THAT IS NOT ITS OWN, STATED PLAINLY. Healing repairs
 * EVERY unrecorded order on the project, which on this machine includes orders
 * another lane sold from a tree that does not carry the writer. It writes a row
 * into `marketing_attribution` keyed by those orders; it does not read, edit or
 * delete the orders themselves. That is exactly what the platform will do on
 * its own schedule once this is merged, and it is the remedy the build guard
 * already prints on every failure.
 *
 * Run. The two loader flags are not optional: this drive reaches the @/ alias
 * and a module declaring server-only.
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/attribution-backstop-drive.mjs \
 *          --out C:/dev/EVIDENCE/ATTRIBUTION-BACKSTOP
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { sitemapFootprint, laneFixturesStillPublished } from './lib/sitemap-footprint.mjs'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3100'
const LANE = 'lane-b-backstop'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')
const ROUTE = '/api/cron/attribution-backstop'
const NO_RECORD = 'order has no attribution record'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const cronSecret = process.env.CRON_SECRET ?? ''
if (!cronSecret) {
  console.error('FAIL: CRON_SECRET is not in the environment, so the authorised call cannot be made.')
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 900 },
]

const fixture = {
  ownerId: null,
  organisationId: null,
  organisationSlug: `${LANE}-org-${STAMP}`,
  eventId: null,
  eventSlug: `${LANE}-event-${STAMP}`,
  venueName: `${LANE} room ${STAMP}`,
  orderId: null,
  orderNumber: null,
  admin: null,
}

async function callRoute(headers) {
  const response = await fetch(`${BASE}${ROUTE}`, { headers })
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { status: response.status, body }
}

async function unrecordedNow() {
  const { data, error } = await db
    .from('marketing_attribution_invariant_breaches')
    .select('order_id, order_reference')
    .eq('breach', NO_RECORD)
  if (error) throw new Error(`breaches view read failed: ${error.message}`)
  return data ?? []
}

/* --------------------------------------------------------------- the fixture */

async function buildFixture() {
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  const { data: category } = await db
    .from('event_categories')
    .select('id')
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .single()
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser-${STAMP}@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db.from('profiles').upsert({
    id: fixture.ownerId,
    email: `${LANE}-organiser-${STAMP}@eventlinqs.test`,
    full_name: 'Lane B backstop',
  })

  // pending, never active: an active organisation is published at /organisers/<slug>.
  const org = await db
    .from('organisations')
    .insert({
      name: `Lane B backstop ${STAMP}`,
      slug: fixture.organisationSlug,
      owner_id: fixture.ownerId,
      status: 'pending',
    })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 30 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B backstop night ${STAMP}`,
      slug: fixture.eventSlug,
      organisation_id: fixture.organisationId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      // unlisted, never public: a public event publishes /events/<slug> and a
      // /venues/<handle> derived from venue_name.
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: fixture.venueName,
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the attribution backstop proof. It is deleted when the proof ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id
}

/**
 * An order written by a path that does NOT call the write-time capture.
 *
 * This is the defect shape itself rather than a simulation of it: an insert
 * into `orders` with no `recordClickSignalForOrder` behind it, which is exactly
 * what a fifth checkout path, an admin tool, or another lane's tree produces.
 */
async function writeAnUnattributedOrder() {
  const id = randomUUID()
  const orderNumber = `EL-LB${STAMP.slice(-6)}`
  const { error } = await db.from('orders').insert({
    id,
    order_number: orderNumber,
    event_id: fixture.eventId,
    organisation_id: fixture.organisationId,
    guest_email: `${LANE}-buyer-${STAMP}@eventlinqs.test`,
    guest_name: 'Lane B backstop buyer',
    status: 'pending',
    subtotal_cents: 0,
    total_cents: 0,
    currency: 'AUD',
  })
  if (error) throw new Error(`create order: ${error.message}`)
  fixture.orderId = id
  fixture.orderNumber = orderNumber
}

/** Move the order's creation time back past the grace, so the healer is due it. */
async function ageTheOrderPastTheGrace() {
  const { error } = await db
    .from('orders')
    .update({ created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
    .eq('id', fixture.orderId)
  if (error) throw new Error(`age order: ${error.message}`)
}

async function teardown() {
  if (fixture.orderId) {
    await db.from('marketing_attribution').delete().eq('order_id', fixture.orderId)
    await db.from('marketing_order_signal').delete().eq('order_id', fixture.orderId)
    await db.from('orders').delete().eq('id', fixture.orderId)
  }
  if (fixture.eventId) await db.from('events').delete().eq('id', fixture.eventId)
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.ownerId) {
    await db.from('profiles').delete().eq('id', fixture.ownerId)
    await db.auth.admin.deleteUser(fixture.ownerId).catch(() => {})
  }
  await removeProofAdmin(db, fixture.admin)
}

/* ------------------------------------------------------------------ the drive */

let browser = null
try {
  /* 0. The server under the drive is the one this tree is checked against. */
  {
    const { data: knownTestOnly } = await db
      .from('events')
      .select('slug')
      .like('slug', 'lane-b-%')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .limit(1)
      .maybeSingle()
    if (knownTestOnly) {
      const r = await fetch(`${BASE}/events/${knownTestOnly.slug}`)
      check(
        'backstop.server.is-serving-the-test-project',
        r.status === 200,
        `${BASE} answers ${r.status} for /events/${knownTestOnly.slug}, a slug that exists only on TEST`,
      )
    } else {
      check('backstop.server.is-serving-the-test-project', false, 'no TEST-only lane B slug to probe with')
    }
  }

  /* 1. Fail closed, both ways, before anything is written. */
  {
    const none = await callRoute({})
    check(
      'backstop.auth.refuses-a-caller-with-no-credential',
      none.status === 401,
      `${ROUTE} with no Authorization answered ${none.status}`,
    )
    const wrong = await callRoute({ Authorization: 'Bearer not-the-secret' })
    check(
      'backstop.auth.refuses-a-wrong-secret',
      wrong.status === 401,
      `${ROUTE} with a wrong bearer answered ${wrong.status}`,
    )
  }

  await buildFixture()

  /* 2. The fixture is invisible to discovery for its whole life. */
  {
    const published = await sitemapFootprint(db, {
      organisationSlugs: [fixture.organisationSlug],
      eventSlugs: [fixture.eventSlug],
      venueNames: [fixture.venueName],
    })
    check(
      'backstop.fixture.publishes-nothing-into-the-sitemap',
      published.length === 0,
      published.length === 0 ? 'nothing of this fixture is in the sitemap' : `PUBLISHED: ${published.join(', ')}`,
    )
  }

  await writeAnUnattributedOrder()

  /* 3. The gate and the healer read one definition of what is broken. */
  {
    const unrecorded = await unrecordedNow()
    const mine = unrecorded.find(row => row.order_id === fixture.orderId)
    check(
      'backstop.gate.sees-the-order-written-without-the-capture',
      Boolean(mine),
      mine
        ? `the breaches view names ${mine.order_reference}, the same view the build guard reads`
        : `the view does not report ${fixture.orderNumber}`,
    )
  }

  /* 4. The grace is real: a fresh order is left alone rather than raced. */
  {
    const run = await callRoute({ Authorization: `Bearer ${cronSecret}` })
    const body = run.body ?? {}
    const { data: stored } = await db
      .from('marketing_attribution')
      .select('order_id')
      .eq('order_id', fixture.orderId)
      .maybeSingle()
    check(
      'backstop.grace.leaves-an-order-inside-the-window-alone',
      run.status === 200 && body.withinGrace >= 1 && !stored,
      `answered ${run.status}, withinGrace ${body.withinGrace}, attempted ${body.attempted}; the fresh order has no record yet, which is correct`,
    )
  }

  await ageTheOrderPastTheGrace()

  /* 5. The repair, and the record it produces. */
  let healRun = null
  {
    healRun = await callRoute({ Authorization: `Bearer ${cronSecret}` })
    const body = healRun.body ?? {}
    check(
      'backstop.heals.an-order-past-the-grace-window',
      healRun.status === 200 && body.healed >= 1 && body.unhealed.length === 0,
      `answered ${healRun.status}: ${body.unrecorded} unrecorded, attempted ${body.attempted}, healed ${body.healed}, unhealed ${JSON.stringify(body.unhealed)}`,
    )

    const { data: record } = await db
      .from('marketing_attribution')
      .select('decision, rung, reason, explanation, confidence, billable, model_name, model_version')
      .eq('order_id', fixture.orderId)
      .maybeSingle()
    check(
      'backstop.record.is-a-real-decision-and-not-a-placeholder',
      Boolean(record) &&
        record.decision === 'none' &&
        record.rung === 5 &&
        String(record.reason ?? '').trim().length > 0 &&
        String(record.explanation ?? '').trim().length > 0 &&
        record.billable === false &&
        String(record.model_name ?? '').length > 0 &&
        String(record.model_version ?? '').length > 0,
      record
        ? `decision ${record.decision}, rung ${record.rung}, billable ${record.billable}, model ${record.model_name} ${record.model_version}, reason "${record.reason}"`
        : 'no record was written',
    )
  }

  /* 6. Every unrecorded order on the project is now recorded. */
  {
    const left = await unrecordedNow()
    check(
      'backstop.gate.reports-no-unrecorded-order-afterwards',
      left.length === 0,
      left.length === 0
        ? `0 orders with no attribution record; the run repaired ${(healRun.body ?? {}).healed}`
        : `still unrecorded: ${left.map(r => r.order_reference).join(', ')}`,
    )
  }

  /* 7. The build guard that was red, run exactly as the gate runs it. */
  {
    const r = spawnSync(
      process.execPath,
      ['scripts/guards/attribution-one-record-per-order-never-billable-when-reversed.mjs'],
      { encoding: 'utf8' },
    )
    const output = `${r.stdout ?? ''}${r.stderr ?? ''}`
    check(
      'backstop.guard.the-invariant-guard-goes-green',
      r.status === 0,
      `exit ${r.status}: ${output.trim().split('\n').slice(0, 2).join(' | ')}`,
    )
  }

  /* 8. Idempotent: a sound platform costs this job one query and no writes. */
  {
    const again = await callRoute({ Authorization: `Bearer ${cronSecret}` })
    const body = again.body ?? {}
    check(
      'backstop.is-idempotent-and-does-nothing-on-a-sound-platform',
      again.status === 200 && body.unrecorded === 0 && body.attempted === 0 && body.healed === 0,
      `answered ${again.status}: unrecorded ${body.unrecorded}, attempted ${body.attempted}, healed ${body.healed}`,
    )
  }

  /* 9. The screen a fee argument is settled on, at all three widths. */
  {
    fixture.admin = await createProofAdmin(db, { label: 'Lane B backstop proof' })
    browser = await chromium.launch()
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      try {
        const signedIn = await signInAsOwner(page, BASE, fixture.admin)
        check(`backstop.admin.${vp.label}.signed-in`, signedIn, signedIn ? 'reached the admin console' : `landed on ${page.url()}`)
        if (!signedIn) continue

        await page.goto(`${BASE}/admin/attribution?order=${fixture.orderNumber}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        const landed = page.url()
        const body = await page.locator('body').innerText()
        check(
          `backstop.admin.${vp.label}.shows-the-healed-order`,
          landed.includes('/admin/attribution') && body.includes(fixture.orderNumber),
          `landed on ${landed}; the page names ${fixture.orderNumber}: ${body.includes(fixture.orderNumber)}`,
        )
        check(
          `backstop.admin.${vp.label}.states-the-decision-rather-than-showing-nothing`,
          body.includes('Nothing credited') && body.includes('Not chargeable') && !body.includes('No order with that reference'),
          `"Nothing credited" ${body.includes('Nothing credited')}, "Not chargeable" ${body.includes('Not chargeable')}`,
        )
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        )
        check(`backstop.admin.${vp.label}.no-horizontal-overflow`, !overflow, overflow ? 'the page scrolls sideways' : 'no sideways scroll')
        await page.screenshot({ path: join(out, `admin-attribution-${vp.label}.png`), fullPage: false })
      } finally {
        await context.close()
      }
    }
  }
} catch (error) {
  check('backstop.drive.completed', false, String(error?.message ?? error))
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await teardown()
    const left = await laneFixturesStillPublished(db, LANE)
    check(
      'backstop.teardown.nothing-of-this-drive-is-left-published',
      left.length === 0,
      left.length === 0 ? `nothing under ${LANE}- is published` : `LEFT PUBLISHED: ${left.join(', ')}`,
    )
  } catch (error) {
    check('backstop.teardown.completed', false, String(error?.message ?? error))
  }
}

const passed = checks.filter(c => c.ok).length
writeFileSync(
  join(out, 'attribution-backstop-report.json'),
  JSON.stringify({ base: BASE, project: url, stamp: STAMP, passed, total: checks.length, checks }, null, 2),
)
console.log(`\n${passed} of ${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
