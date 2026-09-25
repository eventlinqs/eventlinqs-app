import { NextResponse } from 'next/server'
import { getPickerCities } from '@/lib/locations/picker-cities'

/**
 * GET /api/location/cities - the city catalogue the location dialog picks from.
 *
 * ============================================================================
 * WHY THIS EXISTS: THE CATALOGUE WAS IN THE DOCUMENT OF EVERY PAGE
 * ============================================================================
 *
 * The site header passed the whole merged picker catalogue to `LocationPicker`
 * as a prop. The DIALOG has been behind a dynamic import since 17 September
 * 2026 (`interaction-only-chrome-is-split`), so its CODE is not first-load
 * JavaScript. Its DATA was, and a deferral that moves the code and leaves the
 * data behind saves less than it appears to: a prop crossing the server/client
 * boundary is serialised into the RSC payload of the document whether the
 * component that reads it ever mounts or not.
 *
 * This is the same defect, and the same fix, as `/api/events/[id]/seats`. It
 * was found again on 19 September 2026 by close-out C8B.1's origin cost table,
 * on a page with no events on it at all:
 *
 *   /login   document 95,832 B, flight payload 83,282 B (86.9 percent of it)
 *            the city catalogue inside that payload: 6,152 B, 6.4 percent of
 *            the whole document, serialised TWICE, with coordinates
 *
 * Twice, because `SiteHeaderClient` renders the picker for the desktop bar and
 * again for the mobile sheet, and each JSX element carries its own copy of the
 * props. The homepage adds a third through `LocationFilterBanner`, and the root
 * not-found boundary Next puts in every page's payload carries its own header
 * on top of that.
 *
 * Nobody reads a byte of it until a visitor presses "Change location".
 *
 * ============================================================================
 * AUTH POSTURE: PUBLIC BY DESIGN, AND IT EXPOSES NOTHING PRIVATE
 * ============================================================================
 *
 * A city list is what an anonymous visitor picks from before they have an
 * account, so requiring a caller identity would defeat the surface. What it
 * returns is the same catalogue the picker has always rendered into the public
 * HTML of every page: curated launch cities, the `cities` taxonomy table, and
 * the distinct venue cities of PUBLISHED events, which are the cities the
 * sitemap already lists. It reads nothing about the caller and writes nothing.
 *
 * `validSlugs` is deliberately NOT returned. The dialog does not read it; it
 * exists for `/events/browse/[city]` validation and for the sitemap, both of
 * which run on the server. Sending it would put the defect back in a smaller
 * font.
 *
 * ============================================================================
 * CACHING: PRIVATE AND SHORT, AND THE FIRST ANSWER HERE WAS WRONG
 * ============================================================================
 *
 * The obvious header is `public, max-age=3600`: the response is the same for
 * every visitor by construction, no cookie is read and no session is resolved,
 * and `getPickerCities` is already wrapped in `unstable_cache` with
 * `revalidate: 3600`, so a shared copy of the same age looked like it could not
 * be staler than the thing it copied.
 *
 * THAT REASONING IS FALSE, and the premise it missed is in
 * `src/lib/events/revalidate-event.ts:364`:
 *
 *     revalidateTag('picker-cities', { expire: 0 })
 *
 * The origin cache is not an hour behind. It is invalidated the moment an event
 * is published, which is exactly when a city can become new. An hour in a shared
 * cache would therefore add a staleness that did not exist before this route
 * did, and it would add it to the one case that matters: an organiser publishes
 * the first event in a town and a visitor is told that town is not on the list.
 * That is the Geelong report, which this repository's own code comments call a
 * launch blocker.
 *
 * So: `private`, which keeps it out of shared caches entirely, and 60 seconds,
 * which is short enough that an invalidation is effectively immediate. The cost
 * of doing so is close to nothing, because `picker-cities-client.ts` already
 * holds the catalogue for the life of the tab: HTTP caching only ever saves the
 * second FULL page load, not the second open of the dialog.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { australia, internationalByCountry } = await getPickerCities()
    return NextResponse.json(
      { australia, internationalByCountry },
      {
        headers: {
          'cache-control': 'private, max-age=60',
        },
      },
    )
  } catch (error) {
    // NOT SWALLOWED INTO AN EMPTY LIST. An empty catalogue rendered in the
    // dialog reads as "this platform has no cities", which is the shape of the
    // Geelong report: a visitor types a city that exists and is told it does
    // not. A 503 reaches the dialog's own failure state, which says the list
    // did not load and offers to try again.
    console.error('[api/location/cities] could not build the picker catalogue:', error)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
