import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OG_THEME as T } from '@/lib/broadcast/og-theme'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The per-event OG share card. SPEC section 2.1 (and the per-artist variant
 * of section 4.3 via ?artist=[slug]).
 *
 * Renders the event image treated with the navy scrim, the title, date,
 * venue locality, and the EventLinqs mark. Events with no image get the
 * branded fallback design, so no shared link ever looks broken. Unknown
 * slugs and unpublished events render the brand fallback card rather than
 * an error: a link preview must never show a broken image, and the card
 * leaks nothing that the event page itself would not show.
 *
 * Caching: CDN-cached for an hour per URL with a day of
 * stale-while-revalidate, so preview crawlers hit the edge, not the
 * database. The visual template reads every token from
 * src/lib/broadcast/og-theme.ts (the Tab 4 swap point).
 */

const CACHE_HEADERS = {
  'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}

function formatCardDate(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timezone || 'Australia/Sydney',
    })
  } catch {
    return ''
  }
}

function brandFallbackCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '88px 96px',
          background: T.navy,
          backgroundImage: `radial-gradient(ellipse 70% 55% at 100% 0%, ${T.goldBright}33 10%, transparent 55%)`,
          fontFamily: T.fontFamily,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: T.gold,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Discover · Host · Gather
        </div>
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'baseline',
            color: T.text,
            fontSize: 140,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          EVENTLINQS
          <span style={{ color: T.gold, marginLeft: '0.05em' }}>.</span>
        </div>
        <div
          style={{
            marginTop: 32,
            display: 'flex',
            color: T.textMuted,
            fontSize: 40,
            fontWeight: 500,
          }}
        >
          Every community. Every event. One platform.
        </div>
      </div>
    ),
    { width: T.width, height: T.height, headers: CACHE_HEADERS },
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<ImageResponse> {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,200}$/i.test(slug)) return brandFallbackCard()

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('title, start_date, timezone, venue_name, venue_city, cover_image_url, status')
    .eq('slug', slug)
    .maybeSingle()

  if (!event || event.status !== 'published') return brandFallbackCard()

  // Stage 3 artist variant: "[Artist] live at [Event]".
  const artistSlug = request.nextUrl.searchParams.get('artist')
  let artistName: string | null = null
  if (artistSlug && /^[a-z0-9-]{1,200}$/i.test(artistSlug)) {
    const { data: artist } = await admin
      .from('artists')
      .select('name')
      .eq('slug', artistSlug)
      .maybeSingle()
    artistName = artist?.name ?? null
  }

  const dateLabel = formatCardDate(event.start_date, event.timezone)
  const locality = [event.venue_name, event.venue_city].filter(Boolean).join(', ')
  const headline = artistName ? `${artistName} live at ${event.title}` : event.title
  const eyebrow = artistName ? 'Live on stage' : 'You are invited'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: T.navy,
          fontFamily: T.fontFamily,
          position: 'relative',
        }}
      >
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            width={T.width}
            height={T.height}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              background: T.navy,
              backgroundImage: `radial-gradient(ellipse 70% 55% at 100% 0%, ${T.goldBright}33 10%, transparent 55%)`,
            }}
          />
        )}

        {/* The hero treatment: bottom-up navy scrim so the facts stay legible
            on any photograph, matching the platform hero law. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `linear-gradient(to top, ${T.navy}F2 0%, ${T.navy}B3 38%, ${T.navy}26 70%, transparent 100%)`,
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
              color: T.gold,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              color: T.text,
              fontSize: headline.length > 55 ? 52 : 64,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.08,
              maxWidth: 1000,
            }}
          >
            {headline.length > 90 ? `${headline.slice(0, 87)}...` : headline}
          </div>
          <div
            style={{
              marginTop: 20,
              display: 'flex',
              alignItems: 'center',
              color: T.textMuted,
              fontSize: 30,
              fontWeight: 500,
            }}
          >
            {[dateLabel, locality].filter(Boolean).join('  ·  ')}
          </div>
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
                color: T.text,
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}
            >
              EVENTLINQS
              <span style={{ color: T.gold }}>.</span>
            </div>
            <div style={{ display: 'flex', color: T.textFaint, fontSize: 22, fontWeight: 500 }}>
              eventlinqs.com
            </div>
          </div>
        </div>
      </div>
    ),
    { width: T.width, height: T.height, headers: CACHE_HEADERS },
  )
}
