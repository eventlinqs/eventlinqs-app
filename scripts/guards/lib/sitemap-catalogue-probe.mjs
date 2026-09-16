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
 *   PUBLISHED   the three readers in src/lib/seo/sitemap-catalogue.ts, which are
 *               the exact functions src/app/sitemap.ts calls. @supabase/supabase-js,
 *               builder chains, `.match()`, `.not()`, `.order()`, `.limit()`.
 *   EXPECTED    the same three questions asked again over PostgREST directly,
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
import { readEventCatalogue, readOrganiserCatalogue, readVenueCatalogue } from '@/lib/seo/sitemap-catalogue'
import { isOrganiserProfileIndexable } from '@/lib/seo/indexing-policy'
import { resolveDiscoveryThreshold } from '@/lib/seo/discovery-threshold'
import { venueSlugify } from '@/lib/venues/resolver'
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
      truncated: Boolean(rawEvents.truncated || rawOrganisations.truncated || rawVenues.truncated),
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
      },
    }),
  )
}

await main()
