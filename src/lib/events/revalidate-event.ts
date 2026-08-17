import 'server-only'
import { revalidatePath, updateTag } from 'next/cache'
import { getAllCities } from '@/lib/cities/data'
import { communitiesFromTags } from '@/lib/communities/tag-bridge'

/**
 * EVERY SURFACE AN EVENT APPEARS ON, INVALIDATED IN ONE PLACE.
 *
 * THE DEFECT THIS CLOSES, 18 August 2026. An organiser changed a field, reloaded
 * the public page, and saw the old value. They concluded, reasonably, that the
 * platform was broken.
 *
 * IT WAS NOT A CACHE THAT WAS TOO AGGRESSIVE. It was a revalidation that was
 * gated on the wrong thing. `updateEvent` called
 *
 *     if (input.has_reserved_seating && event.slug) {
 *       revalidatePath(`/events/${event.slug}`)
 *     }
 *
 * so the public event page was invalidated ONLY for events with reserved
 * seating. Every ordinary event, which is nearly all of them, was left to expire
 * on its own 300 second ISR window. `publishEvent` called no `revalidatePath` at
 * all, so publishing an event did not refresh the listing, the homepage or any
 * discovery surface.
 *
 * AND THE WINDOW IS NOT THE WHOLE WAIT. Next.js time-based revalidation is
 * stale-while-revalidate: "The cached content is served immediately, and a
 * background regeneration is triggered when the content's age exceeds the
 * cacheLife or revalidate duration. The stale content continues to be served
 * until the fresh content is ready."
 * (node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md,
 * shipped with next@16.3.0, read 18 August 2026.) So the FIRST reload after the
 * window expires still returns the old page, and the new one appears on a later
 * request. An organiser refreshing once and seeing no change is the designed
 * behaviour of a cache nobody told about the write.
 *
 * WHY PATHS AND NOT TAGS. The public surfaces here declare `export const
 * revalidate`, not `use cache` with `cacheTag`, so the tag they carry is the
 * automatic soft tag Next derives from the route (`_N_T_/...`), and
 * `revalidatePath` is the documented way to reach it: "Soft tags enable
 * revalidatePath() to work through the same tag-based system" (same document).
 * Moving these routes onto `use cache` + `cacheTag` is a larger change and is
 * NOT bundled into an outage fix.
 *
 * WHY NOT `revalidatePath('/', 'layout')`. It is one line and it would work, by
 * invalidating the root layout and every route beneath it. It would also throw
 * away the entire site cache on every single event save, on a platform carrying a
 * Lighthouse 95 law. The surfaces an event actually appears on are knowable from
 * the event row, so they are named.
 */

export interface RevalidatableEvent {
  slug?: string | null
  venue_city?: string | null
  tags?: string[] | null
  category_slug?: string | null
  organiser_handle?: string | null
}

/**
 * The same thing, but it reads what it needs instead of trusting a caller to
 * assemble it.
 *
 * WHY THIS EXISTS BESIDE THE SYNCHRONOUS ONE. A caller passing the fields by
 * hand is a caller who can pass the WRONG fields, or forget one, and the failure
 * is silent: a stale community page nobody notices for weeks. The mutation
 * already knows the event id, and one read on a save is cheap, so the id is all
 * this asks for. Callers that genuinely have the row already can use the
 * synchronous form.
 *
 * A read failure does NOT throw. Refusing to save an organiser's event because a
 * cache hint could not be composed would turn a stale page into a lost edit. It
 * falls back to the surfaces that need no lookup, and says so in the log.
 */
/**
 * The narrowest shape this needs from a Supabase client.
 *
 * Deliberately structural rather than `SupabaseClient<Database>`: the generated
 * Database type makes this call site instantiate deeply enough that TypeScript
 * gives up with TS2589, and this function only ever performs one read. It is
 * `PromiseLike`, not `Promise`, because a PostgREST builder is a thenable and
 * not a real promise.
 */
export interface EventReadClient {
  from(table: string): unknown
}

/**
 * The chain shape, applied by cast INSIDE rather than declared on the parameter.
 *
 * Declaring the full chain on the parameter made TypeScript compare it against
 * `SupabaseClient<Database>` at every call site, and the generated Database type
 * is deep enough that it gave up with TS2589 rather than compiling. The read
 * itself is one line and its shape is checked here, once.
 */
interface EventReadChain {
  select(cols: string): {
    eq(col: string, value: string): {
      maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>
    }
  }
}

export async function revalidateEventSurfacesById(
  db: EventReadClient,
  eventId: string,
): Promise<string[]> {
  const { data: row, error } = await (db.from('events') as EventReadChain)
    .select('slug, venue_city, tags, category:event_categories(slug), organisation:organisations(slug)')
    .eq('id', eventId)
    .maybeSingle()

  const data = row as Record<string, unknown> | null

  if (error || !data) {
    console.error(
      '[revalidate] could not read event %s to compose its surfaces; invalidating the shared ones only:',
      eventId,
      error,
    )
    return revalidateEventSurfaces({})
  }

  const category = data.category as { slug?: string } | null
  const organisation = data.organisation as { slug?: string } | null

  return revalidateEventSurfaces({
    slug: typeof data.slug === 'string' ? data.slug : null,
    venue_city: typeof data.venue_city === 'string' ? data.venue_city : null,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    category_slug: category?.slug ?? null,
    organiser_handle: organisation?.slug ?? null,
  })
}

/**
 * The city landing slug for a venue city, or null.
 *
 * The city pages match events with `ilike '%<city name>%'` against `venue_city`,
 * so the reverse direction is a name match against the known city list rather
 * than a slugify: "Geelong" resolves to the geelong landing, and a venue city
 * that has no landing page resolves to nothing rather than to a 404 path.
 */
function citySlugForVenueCity(venueCity: string | null | undefined): string | null {
  if (!venueCity) return null
  const needle = venueCity.trim().toLowerCase()
  if (!needle) return null
  for (const city of getAllCities()) {
    const name = city.name.toLowerCase()
    if (needle === name || needle.includes(name) || name.includes(needle)) return city.slug
  }
  return null
}

/**
 * Invalidate every cached surface this event appears on.
 *
 * Called by EVERY mutation that changes what a buyer would see: create, update,
 * publish, unpublish, cancel, pause, tier and price changes, cover changes. The
 * guard `mutation-revalidates.mjs` fails the build if a mutation is added that
 * does not call it.
 *
 * It is deliberately UNCONDITIONAL on the fields that changed. Working out which
 * surfaces a particular edit could have affected is exactly the reasoning that
 * produced `if (input.has_reserved_seating)`, and it was wrong in the direction
 * that leaves an organiser staring at a stale page.
 */
export function revalidateEventSurfaces(event: RevalidatableEvent): string[] {
  const invalidated: string[] = []
  const mark = (path: string) => {
    revalidatePath(path)
    invalidated.push(path)
  }

  // The event's own page, and the two surfaces every event is on.
  if (event.slug) mark(`/events/${event.slug}`)
  mark('/events')
  mark('/')

  const citySlug = citySlugForVenueCity(event.venue_city)
  if (citySlug) mark(`/city/${citySlug}`)

  if (event.category_slug) mark(`/categories/${event.category_slug}`)

  for (const community of communitiesFromTags(event.tags ?? [])) {
    mark(`/community/${community}`)
    if (citySlug) mark(`/community/${community}/${citySlug}`)
  }

  if (event.organiser_handle) mark(`/organisers/${event.organiser_handle}`)

  // The sitemap advertises this event to Google; a cancelled or unpublished
  // event still listed there is a crawl into a dead link.
  mark('/sitemap.xml')

  // The city picker merges its options from live event cities.
  updateTag('picker-cities')

  // The organiser's own views, so the dashboard is never behind the public page.
  mark('/dashboard/events')
  mark('/dashboard')

  return invalidated
}
