import { words } from './basis-find'

/**
 * WHERE AN ORGANISER IS, FROM ITS OWN PAGES (the PM's 10:30 of 22 November 2026, item (a); Lawal's outreach engine
 * rebuild of 10:31, section 3: "Record location sources and confidence. Do not infer locations from unsupported
 * assumptions."). The basis pool reads an organiser's own site; this finds the city that site PRINTS about itself, in one
 * of two plain forms, and returns it with the page and the words quoted:
 *   - a 'based in', 'located in' or 'operating out of' line naming the city;
 *   - its own address written with the city and the state ('Geelong VIC 3220', 'Melbourne, Victoria').
 * A 'based in' line outranks an address; two different cities in the same strongest form is no answer, never a guess.
 * Only the cities given are looked for (the guide cities), each by its own name, never a suburb mapped to a city. Pure.
 */

export type OwnCity = { readonly city: string; readonly pageUrl: string; readonly quote: string; readonly form: 'based in' | 'address' }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function quoteAt(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 60)
  const to = Math.min(text.length, index + length + 60)
  return text.slice(from, to).trim()
}

export function cityFromOwnPages(pages: readonly { url: string; html: string }[], cities: readonly string[]): OwnCity | null {
  if (cities.length === 0) return null
  const names = cities.map((c) => esc(c.replace(/-/g, ' ')))
  const alt = names.join('|')
  const BASED = new RegExp(`\\b(?:based|located|headquartered)\\s+in\\s+(?:the\\s+)?(${alt})\\b|\\boperating\\s+(?:out\\s+of|from)\\s+(${alt})\\b`, 'gi')
  const ADDRESS = new RegExp(`\\b(${alt})\\s*,?\\s+(?:vic|victoria)\\b(?:\\s+3\\d{3})?`, 'gi')
  const found: Record<'based in' | 'address', Map<string, OwnCity>> = { 'based in': new Map(), address: new Map() }
  for (const page of pages) {
    if (!/^https:\/\//i.test(page.url)) continue
    const text = words(page.html)
    for (const [form, re] of [['based in', BASED], ['address', ADDRESS]] as const) {
      for (const m of text.matchAll(re)) {
        const name = (m[1] ?? m[2] ?? '').toLowerCase().replace(/\s+/g, '-')
        const city = cities.find((c) => c === name)
        if (!city || found[form].has(city)) continue
        found[form].set(city, { city, pageUrl: page.url, quote: quoteAt(text, m.index ?? 0, m[0].length), form })
      }
    }
  }
  for (const form of ['based in', 'address'] as const) {
    const hits = [...found[form].values()]
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) return null
  }
  return null
}
