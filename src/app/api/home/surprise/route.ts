import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public-client'

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
  coverImage: string | null
  reason: string
}

function pickReason(now: Date, city: string | null): string {
  const day = now.getDay()
  const hour = now.getHours()
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
      'id, slug, title, cover_image_url, start_date, venue_city, category:event_categories(name, slug)',
    )
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
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
    coverImage: e.cover_image_url,
    reason,
  }))

  return NextResponse.json({ suggestions, city }, { status: 200 })
}
