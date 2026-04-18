/**
 * Geo-detection utility.
 *
 * Precedence: el_city cookie → Vercel IP headers → Melbourne fallback.
 *
 * IMPORTANT: next/headers is imported dynamically so this module can live in
 * the import graph of a client-component boundary (e.g. /dev/shell-preview)
 * without Turbopack tripping its "next/headers in client bundle" guard.
 * The dynamic import is only resolved at call time on the server.
 */

export type DetectedLocation = {
  city: string
  country: string
  countryCode: string
  latitude: number | null
  longitude: number | null
  source: 'cookie' | 'vercel' | 'fallback'
}

export const MELBOURNE_FALLBACK: DetectedLocation = {
  city: 'Melbourne',
  country: 'Australia',
  countryCode: 'AU',
  latitude: -37.8136,
  longitude: 144.9631,
  source: 'fallback',
}

export async function detectLocation(): Promise<DetectedLocation> {
  const { cookies, headers } = await import('next/headers')

  const cookieStore = await cookies()
  const elCity = cookieStore.get('el_city')?.value
  if (elCity) {
    try {
      const parsed = JSON.parse(elCity)
      return { ...parsed, source: 'cookie' }
    } catch {
      /* fall through to header detection */
    }
  }

  const headerStore = await headers()
  const city = headerStore.get('x-vercel-ip-city')
  const country = headerStore.get('x-vercel-ip-country')
  const lat = headerStore.get('x-vercel-ip-latitude')
  const lng = headerStore.get('x-vercel-ip-longitude')

  if (city && country) {
    return {
      city: decodeURIComponent(city),
      country: countryName(country),
      countryCode: country,
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
      source: 'vercel',
    }
  }

  return MELBOURNE_FALLBACK
}

function countryName(code: string): string {
  const m: Record<string, string> = {
    AU: 'Australia',
    GB: 'United Kingdom',
    CA: 'Canada',
    US: 'United States',
    NG: 'Nigeria',
    ZA: 'South Africa',
    GH: 'Ghana',
    KE: 'Kenya',
    DE: 'Germany',
    FR: 'France',
    IE: 'Ireland',
    NZ: 'New Zealand',
  }
  return m[code] ?? code
}
