/**
 * LB-EMPTYPROFILE. A REAL ORGANISER'S PROFILE PUBLISHED AN EMPTY CATALOGUE
 * BECAUSE A SOCKET DROPPED.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES.
 *
 * `/organisers/[handle]` is the page an organiser sends their own audience to.
 * Both of its event reads coalesced a failed read to `[]`, and the page then
 * rendered, under the organiser's own name:
 *
 *     "No upcoming events from <name> just yet."
 *
 * A statement about somebody's business, published to the people they invited,
 * at HTTP 200 so nothing on the platform noticed. `/venues/[handle]` carried the
 * identical pair, plus the rail of venues near it, so one blink read as a city
 * with one venue in it.
 *
 * THE FILE IS WHERE THE DOOR WAS BORN. `src/lib/supabase/read-or-throw.ts` names
 * "the organiser profile (twice)" as the first two occurrences of this family
 * and exists so that "the fifth occurrence has nowhere to happen". Those two
 * were the DESTRUCTURE spelling. These two were the whole-response spelling,
 * nine lines apart in the same function, and survived because no matcher in the
 * tree could see them.
 *
 * WHAT IT CHECKS, AND BOTH DIRECTIONS MATTER.
 *
 *   A profile WITH events renders them, at 390, 768 and 1440, and does NOT show
 *   the empty state. That is the regression check: routing three reads through
 *   a door that throws must not turn a working page into a 500.
 *
 *   A profile with NO upcoming events still shows the designed empty state.
 *   That is the other direction, and it is the one a careless fix breaks: an
 *   empty catalogue is a real and legitimate answer, and the defect was never
 *   that the sentence existed, only that a failed read could trigger it.
 *
 * EVERY HANDLE IS ENUMERATED FROM THE DATABASE, never guessed. The standing rule
 * on this project is that guessing a slug once produced both a 404 and a false
 * pass.
 *
 * IT SEEDS NOTHING AND WRITES NOTHING. Two other lanes build against this TEST
 * project; this drive is read-only from first line to last.
 *
 * RUN IT, and every flag on this line is load-bearing:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/a-profile-is-not-emptied-drive.mjs
 *
 *   env -u ...  this shell carries the PRODUCTION Supabase URL, so without it
 *               the drive reads the live database. The refusal below is the
 *               backstop, not the plan.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-EMPTYPROFILE'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, 'drive.log')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const results = []
function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' - ' + detail : ''))
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/vkapkibzokmfaxqogypq/.test(url ?? '')) {
  throw new Error('refusing to run: this is not the TEST project, it is ' + url)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const nowIso = new Date().toISOString()

/** An organiser slug that genuinely has an upcoming public published event. */
async function organiserWithEvents() {
  const res = await db
    .from('events')
    .select('organisation_id, organisation:organisations(slug, name, status)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .order('start_date', { ascending: true })
    .limit(200)
  if (res.error) throw new Error('organiser enumeration failed: ' + res.error.message)
  /*
   * ANOTHER LANE'S ROW IS THE LAST RESORT, NOT THE FIRST MATCH.
   *
   * Three lanes build against this one TEST project and each tags its rows.
   * This drive only READS, so using one would break nothing, but a drive that
   * depends on another lane's fixture is a drive that goes red the day that
   * lane tidies up. Untagged rows first; a tagged one is taken only if nothing
   * else qualifies, and the log says which was used either way.
   */
  const candidates = []
  for (const row of res.data ?? []) {
    const org = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation
    if (org?.slug && org.status === 'active') candidates.push({ handle: org.slug, name: org.name })
  }
  // Written without a regex on purpose: the first version of this line went in
  // through a shell heredoc, the backslash of its word boundary was eaten, and a
  // literal BACKSPACE went into the source. The no-control-characters guard
  // caught it on the very next run, which is exactly what it is for.
  const ownedByAnotherLane = (handle) => handle.includes('lane-a') || handle.includes('lane-c')
  const neutral = candidates.find((c) => !ownedByAnotherLane(c.handle))
  if (neutral) return neutral
  if (candidates.length > 0) return candidates[0]
  throw new Error('no active organiser with an upcoming public event exists on TEST')
}

/** An active organiser with NO upcoming public published event. */
async function organiserWithoutEvents(exclude) {
  const withEvents = await db
    .from('events')
    .select('organisation_id')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .limit(1000)
  if (withEvents.error) throw new Error('busy-organiser read failed: ' + withEvents.error.message)
  const busy = new Set((withEvents.data ?? []).map((r) => r.organisation_id))
  const all = await db.from('organisations').select('id, slug, name').eq('status', 'active').limit(500)
  if (all.error) throw new Error('organiser list read failed: ' + all.error.message)
  for (const org of all.data ?? []) {
    if (!busy.has(org.id) && org.slug && org.slug !== exclude) return { handle: org.slug, name: org.name }
  }
  return null
}

/** A venue name with an upcoming public published event, slugified as the route does. */
async function venueWithEvents() {
  const res = await db
    .from('events')
    .select('venue_name')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .not('venue_name', 'is', null)
    .order('start_date', { ascending: true })
    .limit(200)
  if (res.error) throw new Error('venue enumeration failed: ' + res.error.message)
  for (const row of res.data ?? []) {
    const name = (row.venue_name ?? '').trim()
    if (name) return { handle: slugifyVenue(name), name }
  }
  throw new Error('no venue with an upcoming public event exists on TEST')
}

/*
 * THE ROUTE'S OWN SLUG RULE, COPIED RATHER THAN IMPORTED, and said out loud so
 * nobody mistakes it for a second source of truth: this is a .mjs drive and
 * `venueSlugify` is TypeScript behind the `@/` alias. The drive ASSERTS the
 * resulting page is a 200 before it judges anything on it, so a rule that drifts
 * apart from src/lib/venues/resolver.ts fails here loudly as a 404 rather than
 * quietly as a wrong verdict.
 */
function slugifyVenue(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  writeFileSync(LOG, '')
  log(`LB-EMPTYPROFILE drive, ${new Date().toISOString()}, base ${BASE}`)

  const busy = await organiserWithEvents()
  const quiet = await organiserWithoutEvents(busy.handle)
  const venue = await venueWithEvents()
  log(`  enumerated from the database: organiser /${busy.handle}, venue /${venue.handle}`)
  log(`  organiser with no upcoming events: ${quiet ? '/' + quiet.handle : 'none exists on TEST'}`)

  const browser = await chromium.launch()
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()

      const targets = [
        { key: 'organiser', path: `/organisers/${busy.handle}`, mustShowEvents: true },
        { key: 'venue', path: `/venues/${venue.handle}`, mustShowEvents: true },
      ]
      if (quiet) targets.push({ key: 'organiser-empty', path: `/organisers/${quiet.handle}`, mustShowEvents: false })

      for (const target of targets) {
        const response = await page.goto(BASE + target.path, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        const status = response?.status() ?? 0
        await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
        const body = await page.locator('body').innerText()
        const cards = await page.locator('a[href^="/events/"]').count()
        const saysEmpty = /just yet|nothing (coming up|on)|No upcoming/i.test(body)
        await page.screenshot({ path: join(SHOTS, `${viewport.name}-${target.key}.png`), fullPage: false })

        if (target.mustShowEvents) {
          check(
            `${viewport.name} ${target.key}: 200, a real catalogue rendered, and no empty state`,
            status === 200 && cards > 0 && !saysEmpty,
            `${status}, ${cards} event link(s), empty state ${saysEmpty ? 'SHOWN' : 'absent'}`,
          )
        } else {
          /*
           * THE OTHER DIRECTION. A genuinely empty catalogue must still render
           * the designed empty state. The defect was never that the sentence
           * existed; it was that a failed read could produce it.
           */
          check(
            `${viewport.name} ${target.key}: 200 and the designed empty state still shows`,
            status === 200 && saysEmpty,
            `${status}, empty state ${saysEmpty ? 'shown' : 'MISSING'}`,
          )
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok)
  log('')
  log(`${results.length - failed.length} of ${results.length} checks PASS`)
  writeFileSync(join(EVIDENCE, 'drive-results.json'), JSON.stringify(results, null, 2))
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  log('DRIVE FAILED: ' + (error?.stack ?? error))
  process.exitCode = 1
})
