import 'server-only'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/site-url'

/**
 * The origin of the deployment actually serving this request, falling back to
 * the canonical site URL when no request store exists (unit tests, static
 * generation).
 *
 * Use this for links the platform HANDS OUT that must point back at the same
 * deployment: the Launch Kit's live URL, QR and tracked share links, and
 * email links. On production the request origin IS the canonical domain, so
 * behaviour there is identical; on staging and previews the links become
 * self-referential instead of pointing at production (which would 404 on
 * surfaces production does not carry yet). On Vercel, x-forwarded-host is
 * platform-set and trustworthy.
 */
export async function getRequestOrigin(): Promise<string> {
  try {
    const hdrs = await headers()
    const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host')
    if (host) {
      const proto = hdrs.get('x-forwarded-proto') ?? 'https'
      return `${proto}://${host}`
    }
  } catch {
    // No request store: fall through to the canonical URL.
  }
  return getSiteUrl()
}
