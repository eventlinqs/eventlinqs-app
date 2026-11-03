/**
 * THE STATE PAGES (the CONTROLLER's 14:10 of 3 November 2026 on Lawal's 14:08, his phone on live: 'I click on Victoria.
 * It rolls down to the bottom of the page'; round 3's item 0 names 'the Victoria page'). The state chip on a city guide
 * OPENS its state's page, /state/<slug>: the same guide, every night in that state's listed cities, never a scroll on
 * the city page. Each state is anchored on its capital, whose photograph and point the page uses.
 */
export type StatePage = { readonly slug: string; readonly code: string; readonly name: string; readonly anchor: string }

export const STATE_PAGES: readonly StatePage[] = [
  { slug: 'victoria', code: 'VIC', name: 'Victoria', anchor: 'melbourne' },
  { slug: 'new-south-wales', code: 'NSW', name: 'New South Wales', anchor: 'sydney' },
  { slug: 'queensland', code: 'QLD', name: 'Queensland', anchor: 'brisbane' },
  { slug: 'western-australia', code: 'WA', name: 'Western Australia', anchor: 'perth' },
  { slug: 'south-australia', code: 'SA', name: 'South Australia', anchor: 'adelaide' },
  { slug: 'tasmania', code: 'TAS', name: 'Tasmania', anchor: 'hobart' },
  { slug: 'australian-capital-territory', code: 'ACT', name: 'Australian Capital Territory', anchor: 'canberra' },
  { slug: 'northern-territory', code: 'NT', name: 'Northern Territory', anchor: 'darwin' },
]

export function statePageOf(slug: string): StatePage | null {
  return STATE_PAGES.find((s) => s.slug === slug) ?? null
}

/** The page of the state a city sits in ('VIC' is /state/victoria). */
export function statePageHref(code: string): string | null {
  const s = STATE_PAGES.find((p) => p.code === code)
  return s ? `/state/${s.slug}` : null
}
