import { EVENTS_PARAM_KEYS } from '../events/events-param-keys'
import { resolveCitySlug } from '../events/url-filters'

/**
 * /events?city=<city> GOES TO THE CITY'S GUIDE, ONLY WHEN NOTHING ELSE /events READS IS ASKED (round 3, item 7; the PM's
 * 20:41 of 21 November 2026). The guide does not honour a search's words, the map, a sort, a type or a date, so any of
 * those keeps the visitor on /events, which does (EVENTS_PARAM_KEYS, one list held equal to the page's type). The city
 * may be its slug or its name in any case ('melbourne', 'Melbourne', 'Gold Coast'): resolveCitySlug reads both.
 *
 * WHY IN THE PAGE, NOT IN next.config.ts (21 November 2026). The rule was a config redirect with a 'has' on city and a
 * 'missing' on every other key. Two faults, both read on Vercel only: its edge matched the city in any case and forwarded
 * 'Melbourne' to /city/Melbourne, a 404 on every page (production, 20:58), while next start matched exact case; and with
 * 26 'missing' conditions Vercel refused the preview, quoted: 'Builder returned invalid routes: should NOT have more than
 * 16 items'. Decided here, in one pure function called by src/app/events/page.tsx, the rule is the same under next start,
 * on every preview and on production, and holds any number of keys. Words /events does not read (a utm tag) go with the
 * visitor to the guide.
 */
export function guideForEventsQuery(query: Readonly<Record<string, string | readonly string[] | undefined>>): string | null {
  const last = (v: string | readonly string[] | undefined): string => (typeof v === 'string' ? v : (v?.[v.length - 1] ?? ''))
  const city = last(query.city).trim()
  if (!city) return null
  for (const key of EVENTS_PARAM_KEYS) {
    if (key !== 'city' && last(query[key]).trim() !== '') return null
  }
  const slug = resolveCitySlug(city)
  if (!slug) return null
  const rest = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if ((EVENTS_PARAM_KEYS as readonly string[]).includes(key)) continue
    for (const v of typeof value === 'string' ? [value] : (value ?? [])) rest.append(key, v)
  }
  const tail = rest.toString()
  return `/city/${slug}${tail ? `?${tail}` : ''}`
}
