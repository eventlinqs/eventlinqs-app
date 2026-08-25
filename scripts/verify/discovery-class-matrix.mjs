/**
 * THE DISCOVERY CLASS MATRIX: can any public surface show an event it should not,
 * or advertise a sale it cannot honour?
 *
 * ============================================================================
 * WHY, AND WHY IT IS A DRIVE RATHER THAN A TEST
 * ============================================================================
 *
 * On 25 August 2026, after the demo catalogue was purged from production,
 * /events printed a correct header count of 2 beside a "Popular this week" rail
 * listing EIGHT deleted events. Every visitor clicking one got a 404.
 *
 * No unit test could have caught it. The visibility predicate was correct in
 * every file. What was wrong was that a server-side data cache held event ROWS,
 * and a cached row outlives the row it copied. That is only visible by changing
 * a row and then LOADING THE PAGE.
 *
 * The founder's rule, which this script exists to enforce: a surface you did not
 * load is UNVERIFIED, never a pass. So every cell below is driven.
 *
 * ============================================================================
 * THE DESIGN: ONE SYNTHETIC EVENT THAT APPEARS ON EVERY FAMILY
 * ============================================================================
 *
 * Choosing a different target per family means seven targets, seven baselines
 * and seven ways to be wrong about which surface should have shown what. Instead
 * this clones ONE existing event, so the clone inherits a city, a suburb, a
 * category, an organisation and a tag set that already place it on every family:
 *
 *     /  /events  /events?q=  /sitemap.xml
 *     /city/<city>  /city/<city>/<suburb>  /categories/<cat>
 *     /community/<...>  /organisers/<org>  /events/browse/<city>
 *
 * Cloning also makes the HARD DELETE safe: the row being destroyed is one this
 * script created, so nothing pre-existing is at risk, and a true `delete from
 * public.events` is driven rather than simulated with a status change.
 *
 * ============================================================================
 * SCENARIOS
 * ============================================================================
 *
 * Two kinds, measured two different ways.
 *
 *   PRESENCE  the event must DISAPPEAR from every surface.
 *             HARD DELETE, UNPUBLISHED, CANCELLED, PRIVATE, ORG DELETED.
 *
 *   POSTURE   the event must REMAIN but must stop advertising a purchase.
 *             SOLD OUT, ORGANISER CANNOT CHARGE. Measuring these by presence
 *             would be wrong: a sold out event is still a real event and should
 *             still be discoverable. What must change is the affordance.
 *
 * TEST ONLY. Everything created is torn down in a finally block, and the
 * teardown reports what it removed so an interrupted run is visible.
 *
 * USAGE
 *   Build and serve against TEST, then:
 *     node scripts/verify/discovery-class-matrix.mjs --project test
 */
import { randomUUID } from 'node:crypto'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import { refForAlias } from '../lib/db-credentials.mjs'

const BASE = process.env.DRIVE_BASE || 'http://127.0.0.1:3210'
const MAX_WAIT_MS = Number(process.env.MATRIX_MAX_WAIT_MS ?? 45000)
const POLL_MS = 2500
/** The event this clones. Chosen because it carries a city, suburb, category, org and tags. */
const CLONE_SOURCE = process.env.MATRIX_SOURCE_SLUG || 'cat-combat-sports-fight-night-brisbane'

const target = assertNotProductionDatabase()
const TEST_REF = refForAlias('test')
if (!TEST_REF || target.ref !== TEST_REF) {
  console.error(`REFUSED: this matrix creates and deletes rows. TEST only. Resolved ${target.ref}.`)
  process.exit(1)
}
const db = await target.connect()
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function body(path) {
  try {
    const r = await fetch(BASE + path, { headers: { 'user-agent': 'class-matrix' } })
    return { status: r.status, text: await r.text() }
  } catch (e) {
    return { status: 0, text: '', error: String(e.message ?? e) }
  }
}

const slugsIn = html => {
  const seen = new Set()
  for (const m of String(html).matchAll(/\/events\/([a-z0-9][a-z0-9-]{2,})/gi)) seen.add(m[1].toLowerCase())
  return [...seen]
}

const shows = async (path, slug) => slugsIn((await body(path)).text).includes(slug)

/** Poll until the surface stops showing the slug. ms, or null if it never did. */
async function untilGone(path, slug) {
  const t0 = Date.now()
  while (Date.now() - t0 < MAX_WAIT_MS) {
    if (!(await shows(path, slug))) return Date.now() - t0
    await sleep(POLL_MS)
  }
  return null
}

/** Poll until the surface DOES show the slug again. */
async function untilBack(path, slug) {
  const t0 = Date.now()
  while (Date.now() - t0 < MAX_WAIT_MS) {
    if (await shows(path, slug)) return Date.now() - t0
    await sleep(POLL_MS)
  }
  return null
}

const created = { eventId: null, orgId: null, orphanEventId: null, tierIds: [] }

/**
 * Overrides applied to every clone, so the probe lands on surfaces that EXIST.
 *
 * The first version cloned an event verbatim and it appeared on NOTHING. Three
 * reasons, all of which are only visible by driving:
 *
 *   1. the source event started 2026-06-23 and it is now August, so the clone was
 *      outside the listing window before it began;
 *   2. /categories/sports is a 404. The sitemap publishes seven category landing
 *      pages and sports is not one of them;
 *   3. /organisers/harbour-lights-collective is a 404 despite that organisation
 *      owning 68 published events, and Brisbane has no suburb landings.
 *
 * So the probe is given a future date and pointed at a city, suburb, category and
 * organiser that the sitemap actually publishes. Resolved at run time from the
 * database rather than hardcoded, so this does not rot the first time a slug
 * changes.
 */
async function resolveOverrides() {
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const end = new Date(future.getTime() + 3 * 60 * 60 * 1000)

  /*
   * A REAL category, from event_categories. Note that /categories/<slug> does
   * NOT resolve for these on TEST: every one of the 22 real category slugs
   * returns 404, and the seven /categories/ URLs the sitemap publishes are scene
   * slugs, one of which 308-redirects. That is recorded by the baseline scan as
   * CANNOT DRIVE with the HTTP status rather than papered over here.
   */
  const { rows: cat } = await db.query(
    `select id, slug from public.event_categories where slug = any($1::text[]) limit 1`,
    [['music', 'comedy', 'nightlife', 'festival']],
  )
  const { rows: org } = await db.query(
    `select id, slug from public.organisations
      where slug = any($1::text[]) and status='active' limit 1`,
    [['baseline-capture-draft-2026-07-04', 'afrobeats-melbourne', 'broadcast-gate-presents']],
  )
  if (cat.length === 0) throw new Error('no usable category found on TEST')
  if (org.length === 0) throw new Error('no organisation with a published profile found on TEST')

  /*
   * `events.suburb_primary` is an FK to suburbs.slug, and the DB slug carries the
   * city prefix (`sydney-inner-west`) while the URL segment does not
   * (`/city/sydney/inner-west`). Writing the URL form into the column violates
   * the foreign key; writing the column form into the URL gives a 404. Both are
   * derived here from the one row so they cannot disagree.
   */
  const { rows: sub } = await db.query(
    `select slug, city_slug from public.suburbs where is_active = true order by display_order limit 1`,
  )
  if (sub.length === 0) throw new Error('no active suburb found on TEST')
  const suburbSlug = sub[0].slug
  const citySlug = sub[0].city_slug
  const suburbSegment = suburbSlug.startsWith(citySlug + '-') ? suburbSlug.slice(citySlug.length + 1) : suburbSlug

  return {
    start_date: future.toISOString(),
    end_date: end.toISOString(),
    venue_city: citySlug.charAt(0).toUpperCase() + citySlug.slice(1),
    suburb_primary: suburbSlug,
    category_id: cat[0].id,
    organisation_id: org[0].id,
    // `afrobeats` is one of the tokens COMMUNITY_TO_TAGS maps to the `african`
    // community (src/lib/communities/tag-bridge.ts), so the probe lands on a
    // community page too. Without a community-bearing tag the 21 community
    // surfaces can only ever be reported n/a, which is not a pass.
    tags: JSON.stringify(['catalogue', cat[0].slug, 'afrobeats']),
    _catSlug: cat[0].slug,
    _orgSlug: org[0].slug,
    _citySlug: citySlug,
    _suburbSegment: suburbSegment,
  }
}

let OVERRIDES = null

async function cloneEvent() {
  const { rows: src } = await db.query('select * from public.events where slug=$1', [CLONE_SOURCE])
  if (src.length === 0) throw new Error(`clone source ${CLONE_SOURCE} not found on TEST`)
  const source = src[0]
  if (!OVERRIDES) OVERRIDES = await resolveOverrides()

  const { rows: cols } = await db.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='events' order by ordinal_position`,
  )
  const jsonCols = new Set(cols.filter(c => c.data_type === 'json' || c.data_type === 'jsonb').map(c => c.column_name))
  const names = cols.map(c => c.column_name).filter(n => n !== 'id' && n !== 'created_at' && n !== 'updated_at')

  const id = randomUUID()
  const stamp = Math.random().toString(36).slice(2, 8)
  const slug = `matrix-probe-${stamp}`
  const title = `Matrix Probe ${stamp}`

  const values = names.map(n => {
    if (n === 'slug') return slug
    if (n === 'title') return title
    if (Object.prototype.hasOwnProperty.call(OVERRIDES, n)) return OVERRIDES[n]
    /*
     * jsonb ROUND TRIP. node-postgres parses a jsonb column into a JS value on
     * the way out, and then serialises a JS array back as a POSTGRES ARRAY
     * literal on the way in, which jsonb rejects with "invalid input syntax for
     * type json". The value has to be handed back as a JSON string.
     */
    if (jsonCols.has(n) && source[n] !== null && typeof source[n] === 'object') return JSON.stringify(source[n])
    return source[n]
  })
  const placeholders = names.map((_, i) => `$${i + 2}`).join(', ')
  await db.query(
    `insert into public.events (id, ${names.map(n => `"${n}"`).join(', ')}) values ($1, ${placeholders})`,
    [id, ...values],
  )
  created.eventId = id

  // Clone the source's ticket tiers so the SOLD OUT scenario has something real.
  const { rows: tierCols } = await db.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='ticket_tiers' order by ordinal_position`,
  )
  const tierJson = new Set(tierCols.filter(c => c.data_type === 'json' || c.data_type === 'jsonb').map(c => c.column_name))
  const tNames = tierCols.map(c => c.column_name).filter(n => n !== 'id' && n !== 'created_at' && n !== 'updated_at')
  const { rows: tiers } = await db.query('select * from public.ticket_tiers where event_id=$1', [source.id])
  for (const t of tiers) {
    const tid = randomUUID()
    const tVals = tNames.map(n => {
      if (n === 'event_id') return id
      if (tierJson.has(n) && t[n] !== null && typeof t[n] === 'object') return JSON.stringify(t[n])
      return t[n]
    })
    await db.query(
      `insert into public.ticket_tiers (id, ${tNames.map(n => `"${n}"`).join(', ')}) values ($1, ${tNames.map((_, i) => `$${i + 2}`).join(', ')})`,
      [tid, ...tVals],
    )
    created.tierIds.push(tid)
  }

  return { id, slug, title, source }
}

async function teardown() {
  const removed = []
  try {
    if (created.orphanEventId) {
      await db.query('delete from public.events where id=$1', [created.orphanEventId])
      removed.push('orphan event')
    }
    if (created.orgId) {
      await db.query('delete from public.organisations where id=$1', [created.orgId])
      removed.push('synthetic organisation (cascades its events)')
    }
    /*
     * Remove EVERY matrix-probe row, not just the id currently held.
     *
     * The HARD DELETE scenario re-clones to continue, which overwrites
     * created.eventId, so tracking a single id leaked the earlier probe every
     * run. Sweeping by slug prefix also cleans up after a run that was killed
     * before its teardown, which is the case that matters most.
     */
    const { rows: probes } = await db.query("select id from public.events where slug like 'matrix-probe-%'")
    for (const p of probes) {
      await db.query('delete from public.ticket_tiers where event_id=$1', [p.id])
      await db.query('delete from public.events where id=$1', [p.id])
    }
    if (probes.length) removed.push(`${probes.length} probe event(s) and their tiers`)
    const { rows: probeOrgs } = await db.query("select id from public.organisations where slug like 'matrix-org-%'")
    for (const o of probeOrgs) await db.query('delete from public.organisations where id=$1', [o.id])
    if (probeOrgs.length) removed.push(`${probeOrgs.length} probe organisation(s)`)
  } catch (e) {
    console.error('TEARDOWN PROBLEM: ' + (e.message ?? e))
  }
  console.log('')
  console.log('TEARDOWN: ' + (removed.length ? removed.join('; ') : 'nothing to remove'))
  const { rows } = await db.query(
    "select count(*)::int n from public.events where slug like 'matrix-probe-%'",
  )
  console.log('TEARDOWN: matrix-probe events remaining: ' + rows[0].n)
}

const results = []
let hardError = null
const record = (scenario, surface, verdict, detail = '') => {
  results.push({ scenario, surface, verdict, detail })
  console.log('   ' + surface.padEnd(44) + verdict + (detail ? '  ' + detail : ''))
}

try {
  const probe = await cloneEvent()
  console.log('')
  console.log('='.repeat(78))
  console.log('DISCOVERY CLASS MATRIX')
  console.log('='.repeat(78))
  console.log('probe event : ' + probe.title + '  (' + probe.slug + ')')
  console.log('cloned from : ' + CLONE_SOURCE)
  console.log('tiers cloned: ' + created.tierIds.length)

  const city = OVERRIDES._citySlug
  const catSlug = OVERRIDES._catSlug
  const orgSlug = OVERRIDES._orgSlug
  const suburb = OVERRIDES._suburbSegment
  const token = probe.title.split(' ').pop()
  console.log('probe placed on: city=' + city + ' suburb=' + suburb + ' category=' + catSlug + ' organiser=' + orgSlug)

  // Community pages come from the sitemap so none is missed by guesswork.
  const sitemap = (await body('/sitemap.xml')).text
  const communityPaths = [...new Set(
    [...sitemap.matchAll(/<loc>[^<]*?(\/community\/[a-z0-9-]+)<\/loc>/g)].map(m => m[1]),
  )].slice(0, 24)
  const artistPaths = [...new Set(
    [...sitemap.matchAll(/<loc>[^<]*?(\/artists\/[a-z0-9-]+)<\/loc>/g)].map(m => m[1]),
  )].slice(0, 3)
  const venuePaths = [...new Set(
    [...sitemap.matchAll(/<loc>[^<]*?(\/venues\/[a-z0-9-]+)<\/loc>/g)].map(m => m[1]),
  )].slice(0, 3)

  const CANDIDATES = [
    ['homepage', '/'],
    ['events index', '/events'],
    ['events search', `/events?q=${encodeURIComponent(token)}`],
    ['sitemap', '/sitemap.xml'],
    ['city', `/city/${city}`],
    ['suburb', `/city/${city}/${suburb}`],
    ['browse city', `/events/browse/${city}`],
    ['category', `/categories/${catSlug}`],
    ['organiser', `/organisers/${orgSlug}`],
    ...communityPaths.map((p, i) => [`community ${i + 1}`, p]),
    ...artistPaths.map((p, i) => [`artist ${i + 1}`, p]),
    ...venuePaths.map((p, i) => [`venue ${i + 1}`, p]),
  ].filter(([, p]) => p)

  console.log('')
  console.log('BASELINE: waiting for the probe to appear, then recording which surfaces show it')
  await untilBack('/events', probe.slug)

  const baseline = []
  const notShowing = []
  for (const [name, path] of CANDIDATES) {
    const r = await body(path)
    const on = slugsIn(r.text).includes(probe.slug)
    if (on) baseline.push([name, path])
    else notShowing.push([name, path, r.status])
  }
  console.log('  shows the probe (' + baseline.length + '):')
  for (const [n, p] of baseline) console.log('     ' + n.padEnd(16) + p)
  console.log('  does NOT show it (' + notShowing.length + '), so it cannot be measured there:')
  for (const [n, p, s] of notShowing) console.log('     ' + n.padEnd(16) + p + '   HTTP ' + s)

  /*
   * FAMILIES THAT DO NOT EXIST ON THIS DATABASE are recorded as CANNOT DRIVE
   * with the reason, never omitted. The founder's rule is that a surface you did
   * not load is not a pass; a surface that does not exist is not a pass either,
   * and quietly dropping it from the matrix is how a gap becomes invisible.
   */
  if (artistPaths.length === 0) record('ALL', 'artist pages', 'CANNOT DRIVE', 'the sitemap publishes 0 /artists/ URLs on TEST')
  if (venuePaths.length === 0) record('ALL', 'venue pages', 'CANNOT DRIVE', 'the sitemap publishes 0 /venues/ URLs on TEST')
  for (const [n, p, s] of notShowing) {
    if (s === 404) record('ALL', n + '  ' + p, 'CANNOT DRIVE', 'route returns 404 on TEST')
  }

  // ---------------------------------------------------------------- PRESENCE
  const presence = [
    ['HARD DELETE', async () => { await db.query('delete from public.ticket_tiers where event_id=$1', [probe.id]); await db.query('delete from public.events where id=$1', [probe.id]) },
      async () => {
        // Re-create for the scenarios that follow.
        const again = await cloneEvent()
        probe.slug = again.slug
        probe.id = again.id
        await untilBack('/events', probe.slug)
      }],
    ['UNPUBLISHED', async () => db.query("update public.events set status='draft' where id=$1", [probe.id]),
      async () => db.query("update public.events set status='published' where id=$1", [probe.id])],
    ['CANCELLED', async () => db.query("update public.events set status='cancelled' where id=$1", [probe.id]),
      async () => db.query("update public.events set status='published' where id=$1", [probe.id])],
    ['PRIVATE', async () => db.query("update public.events set visibility='private' where id=$1", [probe.id]),
      async () => db.query("update public.events set visibility='public' where id=$1", [probe.id])],
  ]

  for (const [name, apply, restore] of presence) {
    console.log('')
    console.log('--- ' + name + ' (must disappear everywhere) ---')
    const slugAtStart = probe.slug
    await apply()
    for (const [sname, path] of baseline) {
      const ms = await untilGone(path, slugAtStart)
      record(name, sname + '  ' + path, ms === null ? 'STILL SHOWN' : ms < 1500 ? 'gone immediately' : 'gone after ' + Math.round(ms / 1000) + 's')
    }
    await restore()
    await sleep(2000)
  }

  // ---------------------------------------------------------------- POSTURE
  /*
   * WAIT FOR THE PROBE TO COME BACK before measuring the posture scenarios.
   *
   * The removal is immediate; the RETURN is not. fetchPublicEventsCached holds a
   * 60 second snapshot, and the live existence check added on 25 August 2026 can
   * only DROP rows from that snapshot, never add one back. So after a restore,
   * /events can take up to a minute to list the event again.
   *
   * That asymmetry is deliberate and is the safe direction: the platform never
   * shows something it should not, and may briefly fail to show something it
   * should. But a posture scenario measured during that window reports "it
   * vanished" and looks like a defect in sold-out handling, which is what the
   * first run of this matrix reported.
   */
  console.log('')
  console.log('--- waiting for the probe to be listed again before posture scenarios ---')
  const backMs = await untilBack('/events', probe.slug)
  console.log('   relisted after: ' + (backMs === null ? 'NEVER (within the window)' : Math.round(backMs / 1000) + 's'))

  console.log('')
  console.log('--- SOLD OUT (must remain discoverable, must stop offering a purchase) ---')
  const { rows: tierRows } = await db.query('select id, total_capacity from public.ticket_tiers where event_id=$1', [probe.id])
  if (tierRows.length === 0) {
    record('SOLD OUT', 'event page', 'CANNOT DRIVE', 'the clone source has no ticket tiers')
  } else {
    for (const t of tierRows) {
      await db.query('update public.ticket_tiers set sold_count = total_capacity where id=$1', [t.id])
    }
    await sleep(3000)
    const page = await body('/events/' + probe.slug)
    const html = page.text.toLowerCase()
    const saysSoldOut = /sold out|sold-out|no tickets|unavailable/.test(html)
    record('SOLD OUT', 'event page /events/' + probe.slug, saysSoldOut ? 'says sold out' : 'DOES NOT SAY SOLD OUT', 'HTTP ' + page.status)
    const idx = await body('/events')
    const stillListed = slugsIn(idx.text).includes(probe.slug)
    record('SOLD OUT', 'events index still lists it', stillListed ? 'yes (correct)' : 'no (it vanished)')
    for (const t of tierRows) await db.query('update public.ticket_tiers set sold_count=0 where id=$1', [t.id])
    await sleep(1500)
  }

  console.log('')
  console.log('--- ORGANISER CANNOT CHARGE (must remain discoverable, must refuse the sale) ---')
  await untilBack('/events', probe.slug)
  const orgId = OVERRIDES.organisation_id
  const { rows: orgBefore } = await db.query(
    'select stripe_charges_enabled, payout_status::text as payout_status from public.organisations where id=$1',
    [orgId],
  )
  await db.query('update public.organisations set stripe_charges_enabled=false where id=$1', [orgId])
  await sleep(3000)
  const evPage = await body('/events/' + probe.slug)
  const low = evPage.text.toLowerCase()
  const refuses = /finishing their payment setup|not on sale|unavailable|cannot be purchased|payment setup/.test(low)
  record('ORGANISER CANNOT CHARGE', 'event page /events/' + probe.slug, refuses ? 'refuses the sale' : 'DOES NOT REFUSE', 'HTTP ' + evPage.status)
  const idx2 = await body('/events')
  record('ORGANISER CANNOT CHARGE', 'events index still lists it', slugsIn(idx2.text).includes(probe.slug) ? 'yes (correct)' : 'no (it vanished)')
  await db.query('update public.organisations set stripe_charges_enabled=$2 where id=$1', [orgId, orgBefore[0].stripe_charges_enabled])
  await sleep(1500)

  // ------------------------------------------------------- ORGANISATION GONE
  console.log('')
  console.log('--- ORGANISATION DELETED (orphan check) ---')
  const { rows: ownerRow } = await db.query('select created_by from public.events where id=$1', [probe.id])
  const newOrgId = randomUUID()
  const orgStamp = Math.random().toString(36).slice(2, 8)
  await db.query(
    `insert into public.organisations (id, name, slug, owner_id, status)
     values ($1, $2, $3, $4, 'active')`,
    [newOrgId, 'Matrix Org ' + orgStamp, 'matrix-org-' + orgStamp, ownerRow[0].created_by],
  )
  created.orgId = newOrgId
  const orphan = await cloneEvent()
  created.orphanEventId = orphan.id
  await db.query('update public.events set organisation_id=$2 where id=$1', [orphan.id, newOrgId])
  await untilBack('/events', orphan.slug)
  record('ORG DELETED', 'probe under the synthetic org is live first', 'yes')

  await db.query('delete from public.organisations where id=$1', [newOrgId])
  created.orgId = null
  const { rows: survives } = await db.query('select count(*)::int n from public.events where id=$1', [orphan.id])
  record('ORG DELETED', 'event row survives the org delete', survives[0].n > 0 ? 'YES, ORPHANED' : 'no (FK cascade removed it)')
  if (survives[0].n === 0) created.orphanEventId = null
  for (const [sname, path] of baseline) {
    const ms = await untilGone(path, orphan.slug)
    record('ORG DELETED', sname + '  ' + path, ms === null ? 'STILL SHOWN' : ms < 1500 ? 'gone immediately' : 'gone after ' + Math.round(ms / 1000) + 's')
  }
} catch (e) {
  console.error('')
  console.error('MATRIX ERROR: ' + (e.stack ?? e.message ?? e))
  hardError = String(e.message ?? e)
} finally {
  await teardown()
  await db.end()
}

console.log('')
console.log('='.repeat(78))
console.log('RESULTS')
console.log('='.repeat(78))
const bad = results.filter(r => /STILL SHOWN|DOES NOT|CANNOT DRIVE|YES, ORPHANED|it vanished/.test(r.verdict))
for (const r of results) console.log(`  ${r.scenario.padEnd(26)} ${r.surface.padEnd(46)} ${r.verdict}${r.detail ? '  ' + r.detail : ''}`)
console.log('')

/*
 * A RUN THAT MEASURED NOTHING IS NOT A PASS.
 *
 * The first version of this script printed "EVERY CELL CORRECT" after crashing
 * during setup with zero cells recorded, because `bad.length === 0` is trivially
 * true of an empty list. That is precisely the vacuous green this whole night has
 * been about: a rail that showed a correct count beside a wrong list, a guard
 * whose matcher stopped matching, a forensics script keyed on a column that is
 * false everywhere. A harness that can report success without having looked is
 * the same defect wearing a lab coat.
 */
const MIN_CELLS = 8
if (hardError) {
  console.error('FAIL - the matrix did not complete: ' + hardError)
  console.error('       ' + results.length + ' cell(s) were recorded before it stopped. This is NOT a pass.')
  process.exit(1)
}
if (results.length < MIN_CELLS) {
  console.error(`FAIL - only ${results.length} cell(s) recorded, floor is ${MIN_CELLS}.`)
  console.error('       Too little was measured for a green to mean anything.')
  process.exit(1)
}
console.log(bad.length === 0 ? `EVERY CELL CORRECT (${results.length} cells driven)` : bad.length + ' cell(s) need attention:')
for (const r of bad) console.log('   ' + r.scenario + '  ' + r.surface + '  ' + r.verdict + (r.detail ? '  ' + r.detail : ''))
process.exit(bad.length === 0 ? 0 : 1)
