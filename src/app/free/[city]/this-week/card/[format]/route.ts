import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { captureException } from '@/lib/observability/sentry'
import { getSiteUrl } from '@/lib/site-url'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { CITY_WEEK_CARD_ROWS, renderCityWeekCard, type CityWeekCardFormat } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_EXTENSION, SOCIAL_CARD_MIME } from '@/lib/broadcast/social-card-spec'
import { describeFreeWeek, freeEntryLabel, freeWeekPath } from '@/lib/listings/free-week'
import { loadFreeWeek, readGuideCity } from '@/lib/listings/free-week-surface'
import { cityWeekPhotoFor } from '@/lib/listings/listing-photo'
import { SOCIAL_CARD_FORMATS } from '@/lib/broadcast/social-card-spec'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * THE CITY GUIDE'S WEEK AS AN INSTAGRAM CARD (WI2-ITEM.md section 6: "Each page
 * has its own share card for Instagram"). A story or a square, at the sizes
 * src/lib/broadcast/social-card-spec.ts publishes with their sources, drawn from
 * the page's own events through the Launch Kit's renderer (Law 6: composed,
 * never generated), with a QR to the page.
 *
 * PUBLIC, like the page it shares: it reads only what the page shows, the same
 * guide city and the same cached week (src/lib/listings/free-week-surface.ts).
 * A city with no guide, or a format other than story or square, answers 404.
 * Cached five minutes, the page's own regeneration window. Its cost is CPU on
 * the one card raster path, so it takes the same limit as every other
 * anonymous render on that path (launch-artefact, per IP per hour).
 */

/**
 * The card's photograph (Lawal's ruling of 27 October 2026, 08:33), fetched from
 * the platform's own licensed library and cut to the card's exact size. A store
 * that does not answer leaves the card on its ground rather than failing it.
 */
async function backdropFor(url: string | null, format: CityWeekCardFormat): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const { default: sharp } = await import('sharp')
    const spec = SOCIAL_CARD_FORMATS[format]
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize(spec.width, spec.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 72 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch (error) {
    captureException(error, { where: 'app/free/[city]/this-week/card/[format]/route:backdrop', url })
    return null
  }
}

function isCardFormat(value: string): value is CityWeekCardFormat {
  return value === 'story' || value === 'square'
}

/** "Today" for an event already on, otherwise "Tue 27" in the event's own zone. */
function dayLabel(startIso: string, zone: string, todayKey: string): string {
  const start = new Date(startIso)
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(start)
  if (key <= todayKey) return 'Today'
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric' }).format(start)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ city: string; format: string }> }) {
  const { city: slug, format } = await params
  if (!isCardFormat(format)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Render CPU only, no model spend: fails open by the policy's own ruling, as
  // the Launch Kit's cards do. A Redis blip must not blank a city's card.
  const limited = await applyRateLimit('launch-artefact', request)
  if (limited) return limited

  const city = await readGuideCity(slug)
  if (!city) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { from, to, events, total } = await loadFreeWeek(city)
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: city.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const path = freeWeekPath(city.slug)
  const qr = await QRCode.toDataURL(`${getSiteUrl()}${path}`, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 480,
    color: { dark: '#0A1628', light: '#FFFFFF' },
  })

  const backdrop = await backdropFor(
    cityWeekPhotoFor(
      city.slug,
      events.map((e) => (e as { category?: { slug?: string | null } | null }).category?.slug ?? null),
    ),
    format,
  )

  let bytes: Uint8Array
  try {
    bytes = await renderCityWeekCard(format, {
      cityName: city.name,
      week: describeFreeWeek(from, to, city.timezone),
      total,
      items: events.slice(0, CITY_WEEK_CARD_ROWS[format]).map((e) => ({
        day: dayLabel(e.start_date, e.timezone?.trim() || city.timezone, todayKey),
        title: e.title,
        label: freeEntryLabel(e.entry_mode),
      })),
      path,
      qr,
      backdrop,
    })
  } catch (error) {
    // Never a zero-byte 500: the error is captured with the card it was for.
    captureException(error, { where: 'app/free/[city]/this-week/card/[format]/route:render', city: city.slug, format })
    return NextResponse.json({ error: 'The card could not be drawn' }, { status: 500 })
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': SOCIAL_CARD_MIME,
      'Content-Disposition': `inline; filename="free-in-${city.slug}-this-week-${format}.${SOCIAL_CARD_EXTENSION}"`,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
