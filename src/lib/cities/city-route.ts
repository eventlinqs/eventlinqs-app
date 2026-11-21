import { isCitySlug } from './data'
import { resolveCitySlug } from '../events/url-filters'

/**
 * WHAT /city/<slug> ANSWERS (21 November 2026, the PM's 20:41, law 4: one defect is a class). The header search sent
 * the city's display name, Vercel's edge matched it in any case and forwarded /events?city=Melbourne to /city/Melbourne,
 * and that answered 404 on every page. A city's guide is now reached from its slug in any case and from its name:
 * the canonical slug renders; another case of it, or its name ('Melbourne', 'Gold Coast'), answers 308 to the slug;
 * anything else is a 404. Pure; used by src/app/city/[slug]/page.tsx and its suburb page.
 */
export type CityRouteAnswer =
  | { readonly kind: 'page'; readonly slug: string }
  | { readonly kind: 'redirect'; readonly slug: string }
  | { readonly kind: 'not-found' }

export function cityRouteAnswer(raw: string): CityRouteAnswer {
  if (isCitySlug(raw)) return { kind: 'page', slug: raw }
  let words = raw
  try {
    words = decodeURIComponent(raw)
  } catch {
    // A malformed escape stays as written; it is matched as words.
  }
  const slug = resolveCitySlug(words)
  return slug ? { kind: 'redirect', slug } : { kind: 'not-found' }
}
