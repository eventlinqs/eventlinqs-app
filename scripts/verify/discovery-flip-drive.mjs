/**
 * THE CITY PAGE FLIPS WHEN A REAL EVENT IS PUBLISHED IN IT, AND FLIPS BACK.
 *
 * ============================================================================
 * WHAT CLOSE-OUT SEO3 ASKS FOR, AND WHY A UNIT TEST CANNOT ANSWER IT
 * ============================================================================
 *
 * Acceptance 3, verbatim: "A test publishes a lane-C event in a city on TEST and
 * asserts that city page flips to indexable and appears in the sitemap on the
 * next generation, then unpublishes it and asserts it flips back."
 *
 * tests/unit/seo/discovery-indexability.test.ts proves the DECISIONS against a
 * fixture catalogue, and it would stay green through every one of the following:
 *
 *   - the page reads the live threshold and the sitemap reads the compiled one,
 *   - the publish path never clears the cache the count is read through, so the
 *     flip is real in the database and invisible on the site for five minutes,
 *   - the page renders its directive correctly and Next merges it away.
 *
 * Only a running server and a real row can answer those, so this drives both.
 * It found the second one on 14 September 2026: the scheduled-publish cron
 * invalidated three paths and not one cache tag.
 *
 * ============================================================================
 * HOW IT PUBLISHES, WHICH IS NOT BY WRITING status = 'published'
 * ============================================================================
 *
 * The event is inserted as `scheduled` with its publish time already past, and
 * then the REAL cron route is called. That route runs the publish gate, moves
 * the row, and invalidates the surfaces, which is the product's own publish
 * path rather than an imitation of it. Writing `status = 'published'` straight
 * into the table would prove the count function and nothing about the platform,
 * and it would have been green on the day the invalidation was missing.
 *
 * THE UNPUBLISH HALF IS HONEST ABOUT ITSELF. There is no cron that unpublishes,
 * and the product's unpublish is a Server Action behind an organiser session. So
 * the row is set back to `draft` directly and a SECOND lane-C event, in a city
 * that is already indexable and therefore changes no verdict, is published
 * through the same cron to force the same invalidation. The flip back is then
 * observed the same way the flip forward was.
 *
 * ============================================================================
 * SAFETY
 * ============================================================================
 *
 * It refuses to run against anything but the TEST project. Every row it creates
 * carries `lane-c` in its slug and title. It deletes its own rows in a `finally`,
 * and it deletes nothing it did not create: the delete is by the two ids it
 * inserted, never by a pattern. It prints no secret.
 *
 * Run:  node --env-file=.env.local scripts/verify/discovery-flip-drive.mjs
 *       DISCOVERY_FLIP_BASE=http://localhost:3200
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/*
 * THE SHARED PREFLIGHT, FIRST, BEFORE ANYTHING ELSE RUNS.
 *
 * This file carries its own TEST-project check a few lines below, and that check
 * is not redundant: it names the ONE project this drive is written for, whereas
 * the preflight refuses production in general. The preflight is here because it
 * is the platform's rule rather than this script's opinion, it is stricter
 * (unreadable ref is a refusal, and a stray VERCEL_ENV cannot buy an exemption),
 * and it tightens automatically if SUPABASE_ENV_ISOLATION is ever tightened.
 * `scripts/guards/no-unguarded-production-write.mjs` requires it of every script
 * holding a service-role credential and a mutation, and this holds both.
 */
assertNotProduction()

const BASE = (process.env.DISCOVERY_FLIP_BASE || 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.DISCOVERY_FLIP_OUT || ''
const TAG = '[discovery-flip]'
const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'

const log = []
const say = (m) => {
  log.push(m)
  console.log(`${TAG} ${m}`)
}
const faults = []
const fail = (m) => {
  faults.push(m)
  log.push(`FAIL: ${m}`)
  console.error(`${TAG} FAIL: ${m}`)
}

/* ------------------------------------------------------------- the refusal */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const cronSecret = process.env.CRON_SECRET || ''

if (!url.includes(TEST_PROJECT_REF)) {
  console.error(
    `${TAG} REFUSING: this drive writes rows, and NEXT_PUBLIC_SUPABASE_URL is not the TEST project ${TEST_PROJECT_REF}.`,
  )
  process.exit(2)
}
if (!serviceKey) {
  console.error(`${TAG} REFUSING: SUPABASE_SERVICE_ROLE_KEY is not set, so no row can be created.`)
  process.exit(2)
}
if (!cronSecret) {
  console.error(
    `${TAG} REFUSING: CRON_SECRET is not set, so the publish cron cannot be called and the only\n` +
      `      remaining way to publish would be to write status directly, which proves nothing.`,
  )
  process.exit(2)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/* ------------------------------------------------------------- the reading */

async function robotsOf(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'cache-control': 'no-cache' } })
  const html = await res.text()
  const m = /<meta name="robots" content="([^"]*)"/.exec(html)
  return { status: res.status, robots: m ? m[1] : null }
}

async function sitemapHas(path) {
  const res = await fetch(`${BASE}/sitemap.xml`, { headers: { 'cache-control': 'no-cache' } })
  const xml = await res.text()
  return { count: (xml.match(/<loc>/g) ?? []).length, has: xml.includes(`${path}</loc>`) }
}

/**
 * Wait for the site to agree with the database.
 *
 * The caches this crosses are bounded at 300 seconds and the publish path
 * clears them, so this should settle in one poll. It polls anyway, and REPORTS
 * how long it took, because "it settled in 0.4s" and "it settled in 302s" are
 * the difference between an invalidation that works and one that does not, and
 * a fixed sleep would hide which of the two happened.
 */
async function settle(describe, check, deadlineMs = 90_000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < deadlineMs) {
    last = await check()
    if (last.ok) {
      say(`${describe}: settled after ${((Date.now() - started) / 1000).toFixed(1)}s`)
      return last
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  fail(`${describe}: never settled within ${deadlineMs / 1000}s. Last seen: ${JSON.stringify(last)}`)
  return last
}

/* ----------------------------------------------------------- the fixtures */

const stamp = Date.now().toString(36)
const created = []

/** A city with a landing page that currently holds NOTHING, enumerated live. */
async function pickEmptyCity(cities) {
  for (const city of cities) {
    const probe = await robotsOf(`/city/${city.slug}`)
    if (probe.status !== 200) continue
    if (probe.robots && probe.robots.startsWith('noindex')) return city
  }
  return null
}

/** A city with a landing page that is ALREADY indexable, so publishing into it
 *  changes no verdict. Used only to force the second invalidation. */
async function pickFullCity(cities) {
  for (const city of cities) {
    const probe = await robotsOf(`/city/${city.slug}`)
    if (probe.status === 200 && probe.robots === 'index, follow') return city
  }
  return null
}

async function insertScheduledEvent({ city, suffix }) {
  // EVERY VALUE IS READ, NEVER GUESSED. The organisation, its user and a cover
  // that passes the publish gate all come from rows that exist.
  const { data: org, error: orgError } = await db
    .from('organisations')
    .select('id, slug')
    .like('slug', '%lane-c%')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (orgError || !org) throw new Error(`no lane-C organisation on TEST: ${orgError?.message ?? 'none found'}`)

  const { data: donor, error: donorError } = await db
    .from('events')
    .select('created_by, cover_image_url, category_id')
    .eq('organisation_id', org.id)
    .not('cover_image_url', 'is', null)
    .limit(1)
    .maybeSingle()
  if (donorError || !donor) {
    throw new Error(`no existing lane-C event to read a creator and a cover from: ${donorError?.message ?? 'none'}`)
  }

  const start = new Date(Date.now() + 14 * 24 * 3600 * 1000)
  const end = new Date(start.getTime() + 4 * 3600 * 1000)
  const slug = `lane-c-seo3-flip-${suffix}-${stamp}`

  const { data, error } = await db
    .from('events')
    .insert({
      title: `Lane C SEO3 flip probe ${suffix}`,
      slug,
      organisation_id: org.id,
      created_by: donor.created_by,
      category_id: donor.category_id,
      cover_image_url: donor.cover_image_url,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      timezone: 'Australia/Melbourne',
      status: 'scheduled',
      visibility: 'public',
      scheduled_publish_at: new Date(Date.now() - 60_000).toISOString(),
      venue_name: `Lane C Proof Room ${suffix}`,
      venue_address: '1 Lane C Street',
      venue_city: city.name,
      venue_country: 'Australia',
      description: 'A lane-C verification row. Created and deleted by scripts/verify/discovery-flip-drive.mjs.',
    })
    .select('id, slug')
    .single()
  if (error) throw new Error(`could not insert the lane-C event: ${error.message}`)
  created.push(data.id)
  say(`created ${data.slug} (scheduled, ${city.name}) for organisation ${org.slug}`)
  return data
}

async function runPublishCron() {
  const res = await fetch(`${BASE}/api/cron/publish-scheduled`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  })
  const body = await res.json().catch(() => ({}))
  say(`cron publish-scheduled -> ${res.status} considered=${body.considered ?? '?'} published=${body.published ?? '?'} blocked=${body.blocked ?? '?'}`)
  if (res.status !== 200) fail(`the publish cron answered ${res.status}`)
  for (const o of body.outcomes ?? []) {
    if (o.result !== 'published') say(`  not published: ${o.slug} (${o.result}: ${o.reason ?? 'no reason given'})`)
  }
  return body
}

/* ----------------------------------------------------------------- the run */

async function main() {
  const citiesRaw = process.env.DISCOVERY_FLIP_CITIES
  if (!citiesRaw) throw new Error('DISCOVERY_FLIP_CITIES was not supplied by the caller')
  const cities = JSON.parse(citiesRaw)
  say(`${cities.length} city landing page(s) read from src/lib/cities/data.ts`)

  const empty = await pickEmptyCity(cities)
  if (!empty) throw new Error('every city landing page is already indexable, so there is no flip to observe')
  const full = await pickFullCity(cities)
  if (!full) throw new Error('no city landing page is indexable, so the second invalidation cannot be forced')
  say(`the empty city is /city/${empty.slug} (${empty.name}); the already-full one is /city/${full.slug}`)

  /* ---- 1. the baseline, measured rather than assumed ---- */
  const before = await robotsOf(`/city/${empty.slug}`)
  const sitemapBefore = await sitemapHas(`/city/${empty.slug}`)
  say(`BEFORE  /city/${empty.slug} -> ${before.status} robots="${before.robots}" inSitemap=${sitemapBefore.has} sitemapUrls=${sitemapBefore.count}`)
  if (before.robots !== 'noindex, follow') fail(`the empty city did not start at "noindex, follow" (got "${before.robots}")`)
  if (sitemapBefore.has) fail(`the empty city was already in the sitemap while carrying noindex`)

  /* ---- 2. publish a lane-C event there, through the product's own path ---- */
  await insertScheduledEvent({ city: empty, suffix: 'a' })
  await runPublishCron()

  const flipped = await settle(`/city/${empty.slug} flips to indexable`, async () => {
    const r = await robotsOf(`/city/${empty.slug}`)
    const s = await sitemapHas(`/city/${empty.slug}`)
    return { ok: r.robots === 'index, follow' && s.has, robots: r.robots, inSitemap: s.has, sitemapUrls: s.count }
  })
  say(`AFTER   /city/${empty.slug} robots="${flipped?.robots}" inSitemap=${flipped?.inSitemap} sitemapUrls=${flipped?.sitemapUrls}`)

  /* ---- 3. unpublish it, and force the same invalidation again ---- */
  const { error: draftError } = await db.from('events').update({ status: 'draft' }).eq('id', created[0])
  if (draftError) throw new Error(`could not set the lane-C event back to draft: ${draftError.message}`)
  say(`set ${created[0]} back to draft (directly: there is no unpublish cron, and the product's unpublish is a Server Action behind a session)`)

  await insertScheduledEvent({ city: full, suffix: 'b' })
  await runPublishCron()

  const back = await settle(`/city/${empty.slug} flips back to noindex`, async () => {
    const r = await robotsOf(`/city/${empty.slug}`)
    const s = await sitemapHas(`/city/${empty.slug}`)
    return { ok: r.robots === 'noindex, follow' && !s.has, robots: r.robots, inSitemap: s.has, sitemapUrls: s.count }
  })
  say(`BACK    /city/${empty.slug} robots="${back?.robots}" inSitemap=${back?.inSitemap} sitemapUrls=${back?.sitemapUrls}`)
}

try {
  await main()
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
} finally {
  for (const id of created) {
    const { error } = await db.from('events').delete().eq('id', id)
    if (error) fail(`could not delete the lane-C row ${id}: ${error.message}. IT IS STILL ON TEST.`)
    else say(`deleted lane-C row ${id}`)
  }
  if (created.length > 0) await runPublishCron().catch(() => {})
  if (OUT) {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, 'discovery-flip-drive.txt'), `${log.join('\n')}\n`, 'utf8')
  }
}

if (faults.length > 0) {
  console.error(`\n${TAG} ${faults.length} fault(s). The discovery layer did not flip as SEO3 requires.`)
  process.exit(1)
}
console.log(`\n${TAG} PASS - the city page and the sitemap flip together, both ways, on a real publish.`)
