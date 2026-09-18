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
 * CACHING: SHARED, AND THE REASON IT IS SAFE TO SHARE
 * ============================================================================
 *
 * Unlike the seat chart, this response is the same for every visitor by
 * construction: no cookie is read, no session is resolved, and there is one
 * catalogue rather than one per viewer. That is exactly the property
 * `edge-cache-is-viewer-independent` asks a shared cache entry to have.
 *
 * An hour is not a new staleness. `getPickerCities` is already wrapped in
 * `unstable_cache` with `revalidate: 3600` and the `picker-cities` tag, so the
 * origin itself can be an hour behind; a shared copy of the same age cannot be
 * staler than the thing it copied.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { australia, internationalByCountry } = await getPickerCities()
    return NextResponse.json(
      { australia, internationalByCountry },
      {
        headers: {
          'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
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
