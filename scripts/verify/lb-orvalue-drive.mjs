/**
 * LB-ORVALUE DRIVEN PROOF, at 390, 768 and 1440.
 *
 * Inside a PostgREST `or(...)` a comma is GRAMMAR. Two screens in lane B's
 * slice dropped a typed search term straight into one:
 *
 *   /admin/pricing    the picker a fee override is attached from. Unescaped, so
 *                     a comma answered PGRST100, the route answered 500 and the
 *                     dropdown stayed empty with nothing said.
 *   /admin/network    the Founding Organiser terms screen. It replaced `,()`
 *                     with spaces, which does not error and does not match
 *                     either: "Rock, Paper" was searched for as "Rock  Paper"
 *                     and found nothing, silently.
 *
 * WHAT MAKES THIS DRIVE HONEST. It creates its own rows whose names carry the
 * character under test, and it searches for a substring THAT SPANS THE COMMA,
 * so a term without one would prove nothing. Four of the first 320 event titles
 * on TEST already carry a comma and all four are of the shape
 * "Something Night, Geelong", so this is the platform's own naming rather than
 * an invented edge case.
 *
 * THE FIXTURE IS NOT PUBLISHED, and it does not need to be. Neither screen
 * filters on status or visibility, so the event is created `draft` and
 * `unlisted` and never enters the sitemap. That is the opposite posture from
 * lb-isodate-drive, which must publish because the picker it proves reads
 * through applyPublicEventVisibility.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/lb-orvalue-drive.mjs --out C:/dev/EVIDENCE/LB-ORVALUE
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
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

const STAMP = Date.now().toString(36)
const TAG = `lane-b-orvalue-${STAMP}`
const EVENT_TITLE = `Lane B ORVALUE Encore Session, Geelong ${STAMP}`
const ORG_NAME = `Lane B ORVALUE Rock, Paper ${STAMP}`
/** Both search terms SPAN the comma. A term without one would prove nothing. */
const EVENT_TERM = `Encore Session, Geelong ${STAMP}`
const ORG_TERM = `Rock, Paper ${STAMP}`

let browser = null
let admin = null
let orgId = null
let eventId = null

async function teardown() {
  const problems = []
  const del = async (label, builder) => {
    const { error } = await builder
    if (error) problems.push(`${label}: ${error.code} ${error.message}`)
  }
  if (eventId) {
    const { data: links } = await db.from('share_links').select('id').eq('event_id', eventId)
    const linkIds = (links ?? []).map(l => l.id)
    if (linkIds.length) await del('share_links', db.from('share_links').delete().in('id', linkIds))
    await del('events', db.from('events').delete().eq('id', eventId))
  }
  if (orgId) {
    const { data: orgLinks } = await db.from('share_links').select('id').eq('organisation_id', orgId)
    const orgLinkIds = (orgLinks ?? []).map(l => l.id)
    if (orgLinkIds.length) await del('share_links (org)', db.from('share_links').delete().in('id', orgLinkIds))
    await del('organisations', db.from('organisations').delete().eq('id', orgId))
  }
  await removeProofAdmin(db, admin)

  const { count: left } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  const { count: orgsLeft } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  check(
    'orvalue.teardown.left-as-found',
    (left ?? 0) === 0 && (orgsLeft ?? 0) === 0 && problems.length === 0,
    problems.length ? problems.join(' | ') : `${left ?? 0} event(s), ${orgsLeft ?? 0} organisation(s) remaining`,
  )
}

try {
  // ------------------------------------------------------------------ setup
  admin = await createProofAdmin(db, { label: 'Lane B ORVALUE Proof' })
  check('orvalue.setup.a-throwaway-admin-exists', Boolean(admin.id), admin.email)

  const { data: org, error: orgError } = await db
    .from('organisations')
    .insert({
      name: ORG_NAME,
      slug: `${TAG}-org`,
      owner_id: admin.id,
      email: admin.email,
      // Pending, so nothing here reaches the sitemap. The founding-terms search
      // does not filter on status.
      status: 'pending',
    })
    .select('id, name')
    .single()
  if (orgError) throw new Error(`organisation: ${orgError.message}`)
  orgId = org.id

  const { data: category } = await db.from('event_categories').select('id').limit(1).maybeSingle()
  const start = new Date(Date.now() + 30 * 864e5)
  const { data: event, error: eventError } = await db
    .from('events')
    .insert({
      title: EVENT_TITLE,
      slug: `${TAG}-event`,
      description: 'Lane B ORVALUE proof fixture.',
      summary: 'Lane B ORVALUE proof fixture',
      organisation_id: orgId,
      created_by: admin.id,
      category_id: category?.id ?? null,
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
      timezone: 'Australia/Melbourne',
      event_type: 'in_person',
      venue_name: `Lane B ORVALUE Hall ${STAMP}`,
      venue_city: 'Geelong',
      venue_country: 'Australia',
      // Draft and unlisted: neither screen under test filters on either, and a
      // fixture that cannot be published cannot be left published.
      status: 'draft',
      visibility: 'unlisted',
      is_age_restricted: false,
      is_free: true,
      fee_pass_type: 'pass_to_buyer',
    })
    .select('id, title')
    .single()
  if (eventError) throw new Error(`event: ${eventError.message}`)
  eventId = event.id

  check(
    'orvalue.setup.both-fixtures-carry-a-comma-in-their-name',
    ORG_NAME.includes(',') && EVENT_TITLE.includes(',') && EVENT_TERM.includes(',') && ORG_TERM.includes(','),
    `event "${EVENT_TITLE}" | organisation "${ORG_NAME}"`,
  )

  // ------------------------------------------------- the screens, all widths
  browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()

    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`orvalue.${vp.label}.signed-in-to-the-console`, signedIn, page.url())
    if (!signedIn) {
      await context.close()
      continue
    }

    // ------------------------------------------------------ /admin/pricing
    const statuses = []
    page.on('response', response => {
      if (response.url().includes('/admin/pricing/targets')) statuses.push(response.status())
    })

    await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2000)
    await page.locator('#ov-scope').selectOption('event')
    await page.locator('#ov-search').fill(EVENT_TERM)

    let rows = []
    try {
      await page.waitForSelector('#ov-search ~ ul li button', { timeout: 60000 })
      rows = await page.locator('#ov-search ~ ul li').allInnerTexts()
    } catch {
      rows = []
    }
    await page.screenshot({ path: join(out, `pricing-${vp.label}.png`), fullPage: true })

    const listed = rows.join(' | ').replace(/\s+/g, ' ')
    check(
      `orvalue.${vp.label}.a-comma-search-answers-200-not-500`,
      statuses.length > 0 && statuses.every(s => s === 200),
      `statuses seen: ${statuses.join(', ') || 'none'}`,
    )
    check(
      `orvalue.${vp.label}.the-fee-override-picker-finds-a-comma-titled-event`,
      listed.includes(EVENT_TITLE),
      `searched "${EVENT_TERM}", expected "${EVENT_TITLE}", got ${rows.length} result(s): ${listed.slice(0, 160)}`,
    )

    // ------------------------------------------------------ /admin/network
    await page.goto(`${BASE}/admin/network?org=${encodeURIComponent(ORG_TERM)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(out, `network-${vp.label}.png`), fullPage: true })

    const body = await page.locator('body').innerText()
    check(
      `orvalue.${vp.label}.the-founding-terms-search-finds-a-comma-named-organisation`,
      body.includes(ORG_NAME),
      `searched "${ORG_TERM}", expected the row for "${ORG_NAME}"`,
    )

    await context.close()
  }
} catch (error) {
  check('orvalue.drive.ran-to-completion', false, error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close().catch(() => {})
  await teardown().catch(e => check('orvalue.teardown.completed', false, String(e)))
}

const passed = checks.filter(c => c.ok).length
writeFileSync(
  join(out, 'result.json'),
  JSON.stringify({ base: BASE, tag: TAG, passed, total: checks.length, checks }, null, 2),
)
console.log('')
console.log(`=== ${passed}/${checks.length} checks passed ===`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
