import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public-client'
import { listingWindowOrPredicate, localDayOfWeek, localHourOfDay } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'

/**
 * GET /api/home/surprise - server-side curated event picks for the
 * homepage Surprise Me modal (Batch 9).
 *
 * Algorithm:
 *   1. Geo-detect via Vercel-injected headers (x-vercel-ip-city) or
 *      fall back to Sydney.
 *   2. Read time of day + day of week from Date now.
 *   3. Pick categories that fit the slot:
 *      - Friday/Saturday evening -> nightlife, club nights, comedy
 *      - Saturday/Sunday daytime  -> family, festival, community
 *      - Weekday evening          -> comedy, wellness, workshop
 *      - Anytime fallback         -> popular this week
 *   4. Shuffle a small candidate pool, return 3.
 *
 * Each suggestion carries a "why this" string the modal renders so
 * users see the picking logic and trust grows.
 *
 * Cache: no-store - the user expects fresh suggestions each tap.
 * The query is cheap (limit 30, anonymous public-client read) so the
 * cost is acceptable.
 */

interface Suggestion {
  id: string
  slug: string
  title: string
  city: string | null
  startDate: string
  /** The EVENT's IANA zone, so the modal shows the event's day not the reader's. */
  timezone: string | null
  coverImage: string | null
  reason: string
}

/**
 * THE LABEL IS DECIDED IN THE PLATFORM'S ZONE, NEVER THE SERVER'S.
 *
 * `now.getDay()` and `now.getHours()` read the zone of the process, which on
 * Vercel is UTC, and every reader of this label is in Australia. The two are
 * eight to eleven hours apart, which is more than enough to invert both of the
 * questions this function asks:
 *
 *   Saturday 20:00 in Melbourne is Saturday 10:00 UTC, so `isEvening` was FALSE
 *   and a Saturday night pick was labelled "Saturday daytime pick".
 *   Monday 09:00 in Melbourne is Sunday 22:00 UTC, so `day` was 0, `hour` was
 *   22, and a Monday morning pick was labelled "Weekend energy".
 *
 * The file was already careful about this in one direction and not the other:
 * the `timezone` field above carries the EVENT's zone "so the modal shows the
 * event's day not the reader's", and then the label read the server's.
 *
 * PLATFORM_TIME_ZONE is the right reference rather than the event's own, because
 * this sentence describes WHEN THE READER IS, not when the event is, and it is
 * the same choice `presetWindow` makes for "today" and "tonight". FRIDAY STAYS
 * IN THE WEEKEND: that is a deliberate product decision about nightlife and it
 * is untouched here. This fixes the zone and nothing else.
 */
function pickReason(now: Date, city: string | null): string {
  const day = localDayOfWeek(now, PLATFORM_TIME_ZONE)
  const hour = localHourOfDay(now, PLATFORM_TIME_ZONE)
  const isWeekend = day === 5 || day === 6 || day === 0
  const isEvening = hour >= 17

  if (isWeekend && isEvening) return city ? `${city} weekend energy` : 'Weekend energy'
  if (isWeekend && !isEvening) return city ? `${city} weekend daytime` : 'Saturday daytime pick'
  if (!isWeekend && isEvening) return city ? `Tonight in ${city}` : 'Tonight'
  return city ? `On in ${city} this week` : 'On this week'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function GET(request: Request) {
  const supabase = createPublicClient()
  const headerCity = request.headers.get('x-vercel-ip-city')
  const city = headerCity ? decodeURIComponent(headerCity) : 'Sydney'
  const now = new Date()
  const nowIso = now.toISOString()

  const { data, error } = await supabase
    .from('events')
    .select(
      // `timezone` travels with start_date so the modal formats in the EVENT's
      // zone rather than the reader's, which showed the wrong day for an event
      // in another state.
      'id, slug, title, cover_image_url, start_date, timezone, venue_city, category:event_categories(name, slug)',
    )
    .match(PUBLIC_EVENT_MATCH)
    .or(listingWindowOrPredicate(new Date(nowIso)))
    .order('start_date', { ascending: true })
    .limit(30)

  if (error || !data) {
    return NextResponse.json({ suggestions: [], city }, { status: 200 })
  }

  // Prefer events in the detected city, fall back to any event.
  const byCity = data.filter(e => (e.venue_city ?? '').toLowerCase().includes(city.toLowerCase()))
  const pool = byCity.length >= 3 ? byCity : data
  const picks = shuffle(pool).slice(0, 3)

  const reason = pickReason(now, city)
  const suggestions: Suggestion[] = picks.map(e => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    city: e.venue_city,
    startDate: e.start_date,
    timezone: e.timezone,
    coverImage: e.cover_image_url,
    reason,
  }))

  return NextResponse.json({ suggestions, city }, { status: 200 })
}
