/**
 * THE TWO SIDES OF THE SITEMAP QUESTION, READ IN ONE PROCESS (close-out SEO2).
 *
 * This is the half of `scripts/guards/sitemap-covers-the-catalogue.mjs` that has
 * to run under `scripts/lib/src-alias-loader.mjs`, because one of its two sides
 * is the shipped TypeScript module `src/lib/seo/sitemap-catalogue.ts`. It prints
 * one JSON object on stdout and decides nothing: the guard's `decide()` is pure
 * over what this prints, so the verdict table is testable with no database.
 *
 * THE TWO SIDES, AND WHY THEY ARE DELIBERATELY DIFFERENT CODE:
 *
 *   PUBLISHED   the four readers in src/lib/seo/sitemap-catalogue.ts, which are
 *               the exact functions src/app/sitemap.ts calls. @supabase/supabase-js,
 *               builder chains, `.match()`, `.not()`, `.order()`, `.limit()`.
 *   EXPECTED    the same four questions asked again over PostgREST directly,
 *               paged, through the shared read door (scripts/guards/lib/db-read.mjs),
 *               with the predicate written into the query string. No shared
 *               query code with the published side at all.
 *
 * If the two disagree, one of them is wrong, and the guard says which URLs and
 * in which direction. The defects on record are all in this shape: a 42703 that
 * a bare catch threw away so the venue block published nothing for its whole
 * life; a missing `status` predicate that advertised eight 404s; a `.limit()`
 * quietly truncating a growing catalogue.
 *
 * THE SLUG RULES ARE NOT DUPLICATED, and that is on purpose. A venue handle is
 * `venueSlugify(events.venue_name)` because that is what `/venues/[handle]`
 * resolves; an organiser profile is a page when `isOrganiserProfileIndexable`
 * says so. Both sides import those from the route's own modules. The invariant
 * this guard holds is about COVERAGE, never about re-deriving a rule the product
 * already owns: a second copy of the slug rule would be a new way to be wrong.
 */
import { readEventCatalogue, readOrganiserCatalogue, readVenueCatalogue, readArtistCatalogue } from '@/lib/seo/sitemap-catalogue'
import { isOrganiserProfileIndexable } from '@/lib/seo/indexing-policy'
import { resolveDiscoveryThreshold } from '@/lib/seo/discovery-threshold'
import { venueSlugify } from '@/lib/venues/resolver'
import { isStillListed } from '@/lib/events/listing-window'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { selectRest, couldNotLook } from './db-read.mjs'

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/**
 * The page size for the raw read.
 *
 * PostgREST caps a response at the project's `db-max-rows`, and a caller that
 * asks for everything in one request and gets a capped answer cannot tell that
 * from a small table. So the raw side pages explicitly and stops only when a
 * page comes back short, and it reports `truncated` if it ever reaches the
 * catalogue cap: a silent truncation is exactly the failure mode that would make
 * this guard report a false MISSING list on a platform that had simply grown.
 */
const PAGE = 1000

/**
 * One paged, read-only PostgREST select. Returns { rows } or { error }.
 *
 * THROUGH THE SHARED DOOR, not a hand-rolled fetch. `selectRest` retries a
 * transport failure and classifies what came back, so a dropped packet is
 * reported as a dropped packet rather than as a database that holds no events.
 * That distinction is the whole reason the door exists, and it matters more here
 * than almost anywhere: a transport failure read as an empty catalogue would
 * make this guard report every published page as MISSING and fail the build with
 * a completely false finding.
 */
async function readAll(path, { cap, what }) {
  const rows = []
  for (let offset = 0; offset < cap; offset += PAGE) {
    const outcome = await selectRest({ url: URL_BASE, key: KEY, query: `${path}&limit=${PAGE}&offset=${offset}` })
    if (!outcome.ok) {
      return { error: outcome.kind === 'transport' ? couldNotLook(what, outcome) : outcome.detail }
    }
    const page = outcome.value
    if (!Array.isArray(page)) return { error: `expected an array reading ${what}, got ${typeof page}` }
    rows.push(...page)
    if (page.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

const PUBLIC_EVENT_QUERY = 'status=eq.published&visibility=eq.public'

async function main() {
  if (!URL_BASE || !KEY) {
    process.stdout.write(JSON.stringify({ looked: false, reason: 'no project URL or no service key' }))
    return
  }

  const threshold = await resolveDiscoveryThreshold()

  /* ------------------------------------------------------- the published side */

  const events = await readEventCatalogue()
  const venues = await readVenueCatalogue()

  /*
   * THE ARTIST FAMILY IS GATED ON A FLAG, AND THE FLAG IS ASKED ONCE, HERE.
   *
   * `/artists/[slug]`'s first act is
   * `if (!(await isFeatureEnabled('broadcast_artists'))) notFound()`, and the
   * artist block in src/app/sitemap.ts asks the same question before it
   * publishes anything. The flag is TRUE on TEST and FALSE on production, so a
   * probe that ignored it would report every artist as MISSING on production
   * while the sitemap was behaving perfectly.
   *
   * IT IS ASKED ONCE AND APPLIED TO BOTH SIDES, deliberately, for the reason
   * this header already gives about slug rules: the flag is a rule the product
   * owns, and a second copy of it read a second way is a new way for the two
   * sides to disagree about something neither of them is judging. What this
   * guard judges is COVERAGE within the flag's answer.
   *
   * THE MODEL IS NOT SELF-HOLDING, and that is worth stating rather than
   * leaving for somebody to discover. This probe MODELS the sitemap's gate; it
   * does not execute sitemap.ts, which cannot run outside Next. If somebody
   * deleted the gate from sitemap.ts, the model here would go on agreeing while
   * production published a 404 for every artist. That drift is held statically,
   * on the file itself, by clause F of scripts/guards/sitemap-resolves.mjs.
   */
  const artistsFlag = await isFeatureEnabled('broadcast_artists')

  /*
   * THE READER RUNS EVEN WHEN THE FLAG IS OFF, and only its RESULT is gated.
   *
   * The obvious shape is `artistsFlag ? await readArtistCatalogue() : empty`,
   * and it is wrong in the one direction that has already cost this repository a
   * sitemap block. The flag is FALSE on production and the owner can flip it
   * from an admin row with no deploy. A `42703` inside this reader would then be
   * invisible on every production build, right up until the moment he flipped
   * it, at which point the sitemap would publish no artist at all and say
   * nothing about it: the venue block's failure, restaged.
   *
   * So the query is exercised on every build and `publishedError` is always
   * real. The flag decides only what is COMPARED, in the payload below.
   */
  const artists = await readArtistCatalogue()

  /*
   * The organiser count the sitemap uses comes from the cached discovery rows,
   * which reach `next/cache` and cannot be imported here. It is rebuilt from one
   * read instead, and the SAME map feeds both sides, because the number is not
   * what this guard is judging: the predicate and the coverage are.
   */
  const countRead = await readAll(`events?select=organisation_id&${PUBLIC_EVENT_QUERY}&order=id.asc`, { cap: 20000, what: 'the organiser event counts' })
  if (countRead.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the organiser event counts could not be read: ${countRead.error}` }))
    return
  }
  const countByOrganisation = new Map()
  for (const row of countRead.rows) {
    const id = row.organisation_id == null ? '' : String(row.organisation_id)
    if (!id) continue
    countByOrganisation.set(id, (countByOrganisation.get(id) ?? 0) + 1)
  }
  const organisers = await readOrganiserCatalogue({
    eventCountFor: id => countByOrganisation.get(String(id)) ?? 0,
    threshold,
  })

  /* -------------------------------------------------------- the expected side */

  const rawEvents = await readAll(`events?select=slug&${PUBLIC_EVENT_QUERY}&slug=not.is.null&order=slug.asc`, { cap: 5000, what: 'the published events' })
  if (rawEvents.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the raw event read failed: ${rawEvents.error}` }))
    return
  }
  const rawOrganisations = await readAll(
    'organisations?select=id,slug,description&status=eq.active&slug=not.is.null&order=slug.asc',
    { cap: 5000, what: 'the active organisations' },
  )
  if (rawOrganisations.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the raw organisation read failed: ${rawOrganisations.error}` }))
    return
  }
  const rawVenues = await readAll(
    `events?select=venue_name&${PUBLIC_EVENT_QUERY}&venue_name=not.is.null&order=venue_name.asc`,
    { cap: 5000, what: 'the venue names on published events' },
  )
  if (rawVenues.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the raw venue read failed: ${rawVenues.error}` }))
    return
  }

  /*
   * THE ARTIST QUESTION, ASKED AGAIN AND ASKED DIFFERENTLY.
   *
   * readArtistCatalogue narrows from the lineup outwards: confirmed rows
   * first, then only the events those rows name, then only the artists those
   * events keep. This side reads all three tables whole and intersects them in
   * JavaScript. Same answer, no shared query, which is the entire point of
   * having two sides.
   *
   * THE LISTING WINDOW IS NOT REWRITTEN AS A PREDICATE. `isStillListed` is the
   * platform's own rule and both sides call it, for the same reason both sides
   * call `venueSlugify`: a second dialect of the window written as PostgREST
   * `end_date=gte.now()` would be a new way to be wrong about a timezone, and a
   * timezone is exactly what that rule is careful about.
   *
   * THE READ IS UNCONDITIONAL even when the flag is off, so the raw side can
   * still report a truncation and still surface a broken query on production.
   * The flag is applied to the RESULT, below, where a reader can see it happen.
   */
  const rawLineup = await readAll('event_artists?select=artist_id,event_id&status=eq.confirmed&order=event_id.asc', {
    cap: 5000,
    what: 'the confirmed lineup rows',
  })
  if (rawLineup.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the raw lineup read failed: ${rawLineup.error}` }))
    return
  }
  const rawLineupEvents = await readAll(
    `events?select=id,start_date,end_date,timezone&${PUBLIC_EVENT_QUERY}&order=id.asc`,
    { cap: 20000, what: 'the public events a lineup could name' },
  )
  if (rawLineupEvents.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the raw lineup event read failed: ${rawLineupEvents.error}` }))
    return
  }
  const rawArtists = await readAll('artists?select=id,slug&slug=not.is.null&order=slug.asc', {
    cap: 5000,
    what: 'the artists',
  })
  if (rawArtists.error) {
    process.stdout.write(JSON.stringify({ looked: false, reason: `the raw artist read failed: ${rawArtists.error}` }))
    return
  }

  const expectedEvents = []
  for (const row of rawEvents.rows) {
    const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
    if (slug) expectedEvents.push(`/events/${slug}`)
  }

  const expectedOrganisers = []
  for (const row of rawOrganisations.rows) {
    const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
    if (!slug) continue
    const hasBiography = typeof row.description === 'string' && row.description.trim().length > 0
    const count = countByOrganisation.get(String(row.id)) ?? 0
    if (!isOrganiserProfileIndexable(count, hasBiography, threshold)) continue
    expectedOrganisers.push(`/organisers/${slug}`)
  }

  const now = new Date()
  const liveLineupEventIds = new Set()
  for (const row of rawLineupEvents.rows) {
    if (typeof row.start_date !== 'string') continue
    if (isStillListed(row, now)) liveLineupEventIds.add(String(row.id))
  }
  const liveArtistIds = new Set()
  for (const row of rawLineup.rows) {
    if (liveLineupEventIds.has(String(row.event_id))) liveArtistIds.add(String(row.artist_id))
  }
  const expectedArtists = new Set()
  if (artistsFlag) {
    for (const row of rawArtists.rows) {
      const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
      if (!slug) continue
      if (!liveArtistIds.has(String(row.id))) continue
      expectedArtists.add(`/artists/${slug}`)
    }
  }

  const expectedVenues = new Set()
  for (const row of rawVenues.rows) {
    const name = typeof row.venue_name === 'string' ? row.venue_name.trim() : ''
    if (!name) continue
    const handle = venueSlugify(name)
    if (handle) expectedVenues.add(`/venues/${handle}`)
  }

  process.stdout.write(
    JSON.stringify({
      looked: true,
      threshold,
      truncated: Boolean(
        rawEvents.truncated ||
          rawOrganisations.truncated ||
          rawVenues.truncated ||
          rawLineup.truncated ||
          rawLineupEvents.truncated ||
          rawArtists.truncated,
      ),
      artistsFlag,
      families: {
        events: {
          publishedError: events.error,
          published: events.rows.map(r => r.path),
          expected: expectedEvents,
        },
        organisers: {
          publishedError: organisers.error,
          published: organisers.rows.map(r => r.path),
          expected: expectedOrganisers,
        },
        venues: {
          publishedError: venues.error,
          published: venues.rows.map(r => r.path),
          expected: [...expectedVenues].sort(),
        },
        artists: {
          publishedError: artists.error,
          // GATED HERE, not at the read. `sitemap.ts` publishes this family only
          // inside `if (await isFeatureEnabled('broadcast_artists'))`, so with
          // the flag off the sitemap publishes none of these rows however many
          // the reader found, and the expected side above is empty to match.
          published: artistsFlag ? artists.rows.map(r => r.path) : [],
          expected: [...expectedArtists].sort(),
        },
      },
    }),
  )
}

await main()
