import Link from 'next/link'

/**
 * VenueMap — static map preview for an event venue.
 *
 * Uses Google Maps Static API when GOOGLE_MAPS_API_KEY is present. Falls
 * back to a gracefully-branded placeholder with a "View on Google Maps"
 * link when the key is missing or coordinates are unavailable.
 */

interface Props {
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}

function buildStaticMapUrl(lat: number, lng: number, apiKey: string): string {
  const size = '800x400'
  const zoom = 15
  const markers = `color:0xD4A017|${lat},${lng}`
  const style = [
    'feature:poi|element:labels|visibility:off',
    'element:geometry|color:0xf5f4ef',
    'element:labels.text.fill|color:0x4a4a4a',
    'feature:water|element:geometry|color:0xcde3e6',
  ].map(s => `style=${encodeURIComponent(s)}`).join('&')
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&scale=2&markers=${encodeURIComponent(markers)}&${style}&key=${apiKey}`
}

export function VenueMap({
  venueName,
  address,
  city,
  state,
  country,
  latitude,
  longitude,
}: Props) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const hasCoords = latitude !== null && longitude !== null
  const mapsLinkQuery = [venueName, address, city, state, country].filter(Boolean).join(', ')
  const mapsLink = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsLinkQuery)}`

  const fullAddress = [address, city, state, country].filter(Boolean).join(', ')

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="relative aspect-[2/1] bg-ink-100">
        {apiKey && hasCoords ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={buildStaticMapUrl(latitude, longitude, apiKey)}
            alt={`Map of ${venueName ?? fullAddress}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background:
                'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(212,160,23,0.14), transparent 70%), linear-gradient(180deg, #f5f4ef 0%, #e8e6df 100%)',
            }}
          >
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15">
                <svg className="h-6 w-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="mt-3 font-display text-sm font-semibold text-ink-900">
                {venueName ?? 'Venue'}
              </p>
              {fullAddress && <p className="mt-1 text-xs text-ink-600">{fullAddress}</p>}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          {venueName && (
            <p className="font-display text-sm font-bold text-ink-900 line-clamp-1">{venueName}</p>
          )}
          {fullAddress && (
            <p className="text-xs text-ink-600 line-clamp-2">{fullAddress}</p>
          )}
        </div>
        <Link
          href={mapsLink}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-gold-400 hover:text-gold-600"
        >
          Open in Maps
        </Link>
      </div>
    </div>
  )
}
