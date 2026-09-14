import 'server-only'
import { revalidatePath, updateTag, revalidateTag } from 'next/cache'
import { EVENT_DATA_CACHE_TAGS } from './cache-tags'
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
 * WHERE THE CALL IS COMING FROM, BECAUSE NEXT ALLOWS DIFFERENT THINGS IN EACH.
 *
 * `updateTag` "immediately expires cached data for read-your-own-writes
 * scenarios ... Unlike `revalidateTag`, it can only be used in Server Actions"
 * (node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md
 * line 121, shipped with next@16.3.0, read 14 September 2026).
 *
 * Every caller of this function was a Server Action until 14 September 2026,
 * when close-out SEO3 step 3 found that the scheduled-publish CRON published an
 * event without clearing a single data cache tag, so an event that went live at
 * the time its organiser set was absent from every count and from the sitemap
 * until a timer expired. A cron route is a Route Handler, and calling this from
 * one without saying so would reach `updateTag` outside a Server Action.
 *
 * So the caller states which it is, and it is NOT inferred: there is no reliable
 * way to ask at runtime, and a wrong guess fails in the direction that breaks a
 * working cron rather than in the direction that leaves a page stale.
 *
 * WHAT THE ROUTE HANDLER GIVES UP, said plainly. `revalidateTag` is
 * stale-while-revalidate, so the very next reader may be served the old value
 * once more before the fresh one lands. For a mutation an organiser is watching
 * that would be wrong, which is why the Server Action path keeps `updateTag`.
 * For a cron publishing on a schedule nobody is staring at, one more stale read
 * inside a five minute window is the correct trade against a 500.
 */
export type RevalidationCaller = 'server-action' | 'route-handler'

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
  caller: RevalidationCaller = 'server-action',
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
    return revalidateEventSurfaces({}, caller)
  }

  const category = data.category as { slug?: string } | null
  const organisation = data.organisation as { slug?: string } | null

  return revalidateEventSurfaces({
    slug: typeof data.slug === 'string' ? data.slug : null,
    venue_city: typeof data.venue_city === 'string' ? data.venue_city : null,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    category_slug: category?.slug ?? null,
    organiser_handle: organisation?.slug ?? null,
  }, caller)
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
export function revalidateEventSurfaces(
  event: RevalidatableEvent,
  caller: RevalidationCaller = 'server-action',
): string[] {
  const invalidated: string[] = []
  const mark = (path: string) => {
    revalidatePath(path)
    invalidated.push(path)
  }
  /*
   * See RevalidationCaller: `updateTag` is Server-Action only in next@16.3.0.
   *
   * `{ expire: 0 }` IS REQUIRED AND IS NOT A DEFAULT. The shipped type is
   * `revalidateTag(tag: string, profile: string | CacheLifeConfig)`
   * (node_modules/next/dist/server/web/spec-extension/revalidate.d.ts line 13),
   * where the second argument "specifies a cacheLife profile (e.g. "max"), or a
   * `{ expire }` object". Zero is the shortest life there is, so the entry is
   * expired on the spot rather than being given a new lease; it is the closest
   * `revalidateTag` gets to what `updateTag` does, which is the whole reason the
   * Server Action path does not use it.
   */
  const expireTag =
    caller === 'route-handler' ? (tag: string) => revalidateTag(tag, { expire: 0 }) : updateTag

  /*
   * TWO CACHE LAYERS, AND THIS USED TO CLEAR ONLY ONE. Added 25 August 2026.
   *
   * `revalidatePath` invalidates the ROUTE cache. It does NOT invalidate an
   * `unstable_cache` entry that carries an explicit tag: those are a separate,
   * server-side DATA cache and they need `revalidateTag`. Every mutation on this
   * platform therefore cleared the pages and left the data underneath them
   * untouched, and the data is what the rails read.
   *
   * The visible consequence, on production, on 25 August 2026: after the demo
   * catalogue was purged, /events rendered a correct header count of 2 beside a
   * "Popular this week" rail listing EIGHT deleted events, because the rail read
   * through a tagged data cache with a thirty minute window that nothing had ever
   * invalidated. A visitor clicking any of them got a 404.
   *
   * Measured, on TEST, with a production build, before this change: an event set
   * to draft was still served by /events for 63 seconds and by /sitemap.xml for
   * longer than the 150 second measuring window.
   *
   * EVERY TAG IS LISTED, not a curated subset. Deciding which tags an edit could
   * have affected is the same reasoning that produced `if (has_reserved_seating)`
   * and it is wrong in the direction that leaves stale rows on a public page. The
   * cost of over-invalidating is one cold read; the cost of under-invalidating is
   * selling a ticket to an event that does not exist.
   */
  /*
   * `updateTag`, NOT `revalidateTag`, and the difference is the whole point.
   *
   * From the guide shipped with next@16.3.0
   * (node_modules/next/dist/docs/.../09-revalidating.md):
   *
   *   revalidateTag  "invalidates cache entries by tag using
   *                   stale-while-revalidate semantics - stale content is served
   *                   immediately while fresh content loads in the background"
   *   updateTag      "immediately expires cached data for read-your-own-writes
   *                   scenarios - the user sees their change right away instead
   *                   of stale content"
   *
   * Stale-while-revalidate is exactly the failure being fixed: the next visitor
   * after a delete would still be served the deleted event, which is how eight
   * purged events survived on production. For a row that must no longer be
   * visible, serving it once more is not an acceptable trade.
   *
   * `updateTag` is Server-Action only. Every caller of this function is a server
   * action (dashboard/events/actions.ts, actions/dynamic-pricing.ts), and this
   * file already calls updateTag('picker-cities') a few lines below, so the
   * constraint is already met and already proven in this exact context.
   */
  /*
   * TAGS ARE NOT PATHS, and the returned list is only paths.
   *
   * tests/unit/events/revalidate-event.test.ts asserts "the returned list is
   * evidence, not decoration: every entry was a real call" to revalidatePath.
   * Pushing `tag:...` entries into the same array broke that invariant
   * immediately (13 reported, 8 actually called) and the test caught it, which is
   * the test doing exactly its job.
   */
  for (const tag of EVENT_DATA_CACHE_TAGS) {
    expireTag(tag)
  }

  // The event's own page, and the two surfaces every event is on.
  if (event.slug) mark(`/events/${event.slug}`)
  mark('/events')
  mark('/')

  const citySlug = citySlugForVenueCity(event.venue_city)
  if (citySlug) mark(`/city/${citySlug}`)

  /*
   * THE CATEGORY MARK IS BACK, BECAUSE THE REASON IT WENT HAS BEEN REVERSED.
   *
   * It was removed on 25 August 2026 on a premise that was true that day:
   * `event.category_slug` is one of the twenty-two slugs in `event_categories`,
   * `/categories/[slug]` was bound to the seven hero-category editorial slugs,
   * and all twenty-two answered 404 when driven against production. The line
   * was invalidating a path that did not exist, so it was deleted, and the note
   * added that `/categories/<real slug>` 308s to `/events?category=<slug>`.
   *
   * Close-out SEO3 step 4 (14 September 2026) made every one of those twenty-two
   * a REAL page with its own canonical, title, h1 and editorial, and removed the
   * redirect. So the premise is gone, and leaving the line out would now leave
   * the page an event belongs to stale for its whole ISR window on every publish,
   * which is precisely what SEO3 step 3 forbids for the city pages.
   *
   * The mark is unconditional on the slug being a live category rather than
   * checked against the taxonomy, because `revalidatePath` on a path that does
   * not resolve costs nothing and reading the database here would make an
   * invalidation depend on a query that can fail.
   */
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
  expireTag('picker-cities')

  // The organiser's own views, so the dashboard is never behind the public page.
  mark('/dashboard/events')
  mark('/dashboard')

  return invalidated
}
