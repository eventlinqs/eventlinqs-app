import { ImageResponse } from 'next/og'
import { createPublicClient } from '@/lib/supabase/public-client'

/**
 * Per-event social share card. Every shared event link renders as a designed,
 * branded invitation: the event cover photograph under the platform's own
 * bottom-up navy scrim, a gold eyebrow, the title at display weight, and the
 * date and venue line, with the EventLinqs wordmark holding the corner. When
 * an event has no cover image the card falls back to the navy and gold brand
 * treatment, so a shared link never renders broken or bare.
 *
 * Colours are literal hexes pinned to the globals.css tokens (satori cannot
 * read CSS custom properties): navy ink-900 #0A1628, gold-400 #E8B738,
 * gold-500 #D4A017.
 */

export const alt = 'Event on EventLinqs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const NAVY = '#0A1628'
const GOLD = '#D4A017'
const GOLD_BRIGHT = '#E8B738'

interface OgEvent {
  title: string
  cover_image_url: string | null
  start_date: string | null
  timezone: string | null
  venue_name: string | null
  venue_city: string | null
}

async function fetchOgEvent(slug: string): Promise<OgEvent | null> {
  try {
    const client = createPublicClient()
    const { data } = await client
      .from('events')
      .select('title, cover_image_url, start_date, timezone, venue_name, venue_city, status')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    return (data as (OgEvent & { status: string }) | null) ?? null
  } catch {
    return null
  }
}

function formatCardDate(iso: string | null, timezone: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone ?? 'Australia/Sydney',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await fetchOgEvent(slug)

  const title = event?.title ?? 'Discover events on EventLinqs'
  const dateLabel = event ? formatCardDate(event.start_date, event.timezone) : ''
  const placeLabel = event
    ? [event.venue_name, event.venue_city].filter(Boolean).join(', ')
    : ''
  const metaLabel = [dateLabel, placeLabel].filter(Boolean).join('  ·  ')
  const cover = event?.cover_image_url ?? null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: NAVY,
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            width={1200}
            height={630}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              background: NAVY,
              backgroundImage: `radial-gradient(ellipse 70% 55% at 100% 0%, ${GOLD_BRIGHT}33 10%, transparent 55%)`,
            }}
          />
        )}

        {/* The platform hero treatment: bottom-up navy scrim for legibility on any photograph. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(to top, rgba(10,22,40,0.92) 0%, rgba(10,22,40,0.72) 30%, rgba(10,22,40,0.25) 62%, rgba(10,22,40,0.10) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 72,
            right: 72,
            bottom: 64,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              color: GOLD_BRIGHT,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {event ? 'You are invited' : 'Every community. Every event.'}
          </div>

          <div
            style={{
              marginTop: 18,
              display: 'flex',
              color: 'white',
              fontSize: title.length > 60 ? 52 : 64,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.08,
              maxWidth: 1000,
            }}
          >
            {title.length > 100 ? `${title.slice(0, 97)}...` : title}
          </div>

          {metaLabel ? (
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                color: 'rgba(255,255,255,0.88)',
                fontSize: 28,
                fontWeight: 500,
              }}
            >
              {metaLabel}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                color: 'white',
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: '-0.01em',
              }}
            >
              EVENTLINQS
              <span style={{ color: GOLD, marginLeft: 2 }}>.</span>
            </div>
            <div
              style={{
                display: 'flex',
                color: 'rgba(255,255,255,0.62)',
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              Tickets at eventlinqs.com
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
