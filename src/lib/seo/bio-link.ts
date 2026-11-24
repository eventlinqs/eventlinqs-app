/**
 * THE INSTAGRAM BIO'S LINK GOES TO /ig (the PM's 00:50 of 25 November 2026; Lawal's yes to the bio link, 24 November
 * 20:35). The bio reads https://www.eventlinqs.com.au/state/victoria?utm_source=instagram&utm_medium=organic_social&
 * utm_campaign=bio&utm_content=bio (read by the PM at 00:48, the profile's public view) and nobody holds the Instagram
 * login to change it, so the site does the work: that path carrying utm_source=instagram and utm_campaign=bio, exactly
 * as the bio writes them, is sent to /ig with every tag kept, where the events our posts named wait. Every other visit
 * to /state/victoria, and every other path, stays where it is (null).
 *
 * Decided in src/proxy.ts before the cache, never in next.config.ts: Vercel's edge matches a query value in any case
 * (src/lib/seo/query-redirects.ts, the fault of 21 November 2026), and the state page stays static. No import, so the
 * proxy's bundle carries nothing more. Pure.
 */

/** The bio's own path. */
export const INSTAGRAM_BIO_PATH = '/state/victoria'

export function igForBioLink(pathname: string, query: URLSearchParams): string | null {
  if (pathname.replace(/\/$/, '') !== INSTAGRAM_BIO_PATH) return null
  if (query.get('utm_source') !== 'instagram' || query.get('utm_campaign') !== 'bio') return null
  return `/ig?${query.toString()}`
}
