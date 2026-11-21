import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllCities } from '@/lib/cities/data'
import { cityRouteAnswer } from '@/lib/cities/city-route'
import { EVENTS_PARAM_KEYS, type EventsParamKey } from '@/lib/events/events-param-keys'
import type { EventsSearchParams } from '@/lib/events/search-params'
import { resolveCityName } from '@/lib/events/url-filters'
import { guideForEventsQuery } from '@/lib/seo/query-redirects'
import { cityControlTargets } from '../../../scripts/verify/lib/city-control-targets.mjs'

/*
 * EVERY CITY CONTROL ENDS ON A PAGE THAT DOES WHAT WAS PRESSED (21 November 2026; the PM's 20:41 and 20:45; law 4).
 * The desktop header search sent the city's display name; Vercel's edge matched /events?city=Melbourne against the
 * guide redirect in any case and forwarded it to /city/Melbourne, a 404, on every page, read on production at 20:58:
 * '/events?q=jazz&city=Melbourne -> 404 /city/Melbourne?q=jazz&city=Melbourne'. The same redirect sent the home's Map
 * and Sort links, and the city page's type rail, to a guide that drops view, sort and event_type.
 *
 * The rule now lives in the /events page itself (src/lib/seo/query-redirects.ts guideForEventsQuery), one behaviour under
 * next start and on Vercel; a config redirect with 26 'missing' keys was refused by Vercel, quoted: 'Builder returned
 * invalid routes: should NOT have more than 16 items'. For every guide city, every control that sends a city to /events
 * is walked through that rule, then through the city route. It must end on a page, and on the page that honours what
 * was asked: the guide only when nothing else /events reads was asked, else /events, whose filter names the city. The
 * live read of the same targets is scripts/verify/city-controls-live.mjs.
 */

// The key list and the type agree both ways; tsc fails on this line otherwise.
type KeysAgree = [Exclude<keyof EventsSearchParams, EventsParamKey>, Exclude<EventsParamKey, keyof EventsSearchParams>] extends [never, never]
  ? true
  : false
const KEYS_AGREE: KeysAgree = true

type End = { readonly page: 'events' } | { readonly page: 'guide'; readonly slug: string } | { readonly page: 'not found'; readonly path: string }

/** Where a control's address ends: the /events page's own rule (guideForEventsQuery), then the city route. */
function endOf(path: string): End {
  const url = new URL(path, 'https://eventlinqs.test')
  const query: Record<string, string> = {}
  for (const [k, v] of url.searchParams) query[k] = v
  const forward = url.pathname.startsWith('/city/') ? url.pathname : url.pathname === '/events' ? guideForEventsQuery(query) : null
  if (!forward) return { page: 'events' }
  const answer = cityRouteAnswer(new URL(forward, 'https://eventlinqs.test').pathname.slice('/city/'.length))
  return answer.kind === 'not-found' ? { page: 'not found', path: forward } : { page: 'guide', slug: answer.slug }
}

const enc = encodeURIComponent
const CITIES = getAllCities()

describe('every city control ends on a page that does what was pressed', () => {
  it('the key list and EventsSearchParams agree, and there are guide cities to walk', () => {
    expect(KEYS_AGREE).toBe(true)
    expect(new Set(EVENTS_PARAM_KEYS).size).toBe(EVENTS_PARAM_KEYS.length)
    expect(CITIES.length).toBeGreaterThan(0)
  })

  {
    for (const c of CITIES) {
      it(c.name, () => {
        for (const [control, path] of cityControlTargets(c)) {
          const end = endOf(path)
          const asked = [...new URL(path, 'https://eventlinqs.test').searchParams].filter(([, v]) => v !== '')
          expect(end, `${control}: ${path}`).not.toMatchObject({ page: 'not found' })
          if (end.page === 'guide') {
            expect(end.slug, `${control}: ${path}`).toBe(c.slug)
            // Nothing /events would have honoured is dropped on the way to the guide.
            const dropped = asked.filter(([k]) => k !== 'city' && (EVENTS_PARAM_KEYS as readonly string[]).includes(k))
            expect(dropped, `${control}: ${path}`).toEqual([])
          } else {
            // /events reads every key the control sends, and its filter names the city.
            for (const [k] of asked) expect(EVENTS_PARAM_KEYS as readonly string[], `${control}: ${path}`).toContain(k)
            const city = new URL(path, 'https://eventlinqs.test').searchParams.get('city') ?? ''
            expect(resolveCityName(city).toLowerCase(), `${control}: ${path}`).toBe(c.name.toLowerCase())
          }
        }
      })
    }
  }

  it('/city/<slug> renders; its name or another case answers 308 to the slug; anything else is a 404', () => {
    for (const c of CITIES) {
      expect(cityRouteAnswer(c.slug)).toEqual({ kind: 'page', slug: c.slug })
      expect(cityRouteAnswer(c.name)).toEqual(c.name === c.slug ? { kind: 'page', slug: c.slug } : { kind: 'redirect', slug: c.slug })
      expect(cityRouteAnswer(c.slug.toUpperCase())).toEqual({ kind: 'redirect', slug: c.slug })
      expect(cityRouteAnswer(enc(c.name))).toMatchObject({ slug: c.slug })
    }
    expect(cityRouteAnswer('nowhere-at-all')).toEqual({ kind: 'not-found' })
    expect(cityRouteAnswer('%E0%A4%A')).toEqual({ kind: 'not-found' })
  })

  it("the header's search form sends the city's name, the case walked above", () => {
    const header = readFileSync(join(process.cwd(), 'src/components/layout/site-header-white.tsx'), 'utf8')
    expect(header).toContain('<input type="hidden" name="city" value={city.city} />')
  })

  it('every /events?city= link written in src sends a slug', () => {
    const root = join(process.cwd(), 'src')
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f))
    const found: string[] = []
    for (const f of files) {
      const text = readFileSync(join(root, f), 'utf8')
      for (const m of text.matchAll(/\/events\?city=\$\{([^}]+)\}/g)) {
        found.push(f)
        expect(m[1], `${f}: /events?city=\${${m[1]}}`).toMatch(/slug/i)
      }
    }
    expect(found.length).toBeGreaterThan(0)
  })
})
