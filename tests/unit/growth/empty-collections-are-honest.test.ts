// AN EMPTY COLLECTION SAYS SO, PLAINLY (Lawal's directive of 31 October 2026, 17:44, section 11, verbatim in
// C:\dev\START-16OCT\EVENTLINQS-DISCOVERY-DIRECTIVE-31OCT-1744.md): "Do not present empty community collections as if
// they contain live events ... Where an event collection is empty, avoid large repeated promotional cards. Preserve
// accessible navigation to all supported communities." Every discovery template drew the same large card into an empty
// grid ('The first X event on EventLinqs could be yours', an organiser pitch and three trust pillars), on 420
// community-in-city pages alone, and the city, suburb and community-in-city pages kept their date chips, a 'Browse all X
// events' hero button and a sticky bar all pointing at that empty grid. Now an empty collection is one short honest line
// and a link to real inventory; a grid left empty only because the rails above showed every event is not drawn at all.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n')

const DISCOVERY_TEMPLATES = [
  'src/components/templates/CommunityCityLandingPage.tsx',
  'src/components/features/community/events-by-community-grid.tsx',
  'src/components/templates/CityLandingPage.tsx',
  'src/components/templates/SuburbLandingPage.tsx',
  'src/components/templates/CategoryLandingPage.tsx',
  'src/components/templates/CategoryEventsLandingPage.tsx',
  'src/components/templates/FreeWeekLandingPage.tsx',
  'src/components/templates/WeekendLandingPage.tsx',
]

const PLACE_PAGES = [
  'src/components/templates/CommunityCityLandingPage.tsx',
  'src/components/templates/CityLandingPage.tsx',
  'src/components/templates/SuburbLandingPage.tsx',
]

describe('an empty discovery collection is honest, never a promotional card', () => {
  test.each(DISCOVERY_TEMPLATES)('%s draws the short honest note, never the large promo card', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/\bCategoryHeroEmpty\b/)
    expect(source).not.toMatch(/could be yours/)
    expect(source).toMatch(/<EmptyCollectionNote\b/)
  })

  test.each(PLACE_PAGES)('%s points nothing at an empty grid when the page holds no event', (file) => {
    const source = read(file)
    // The page knows when it holds no event at all, and the chips, the sticky bar and the grid section obey it.
    expect(source).toMatch(/const pageIsEmpty = /)
    expect(source).toMatch(/\{pageIsEmpty \? null : \(\s*<Suspense fallback=\{null\}>\s*<DateFilterChips/)
    expect(source).toMatch(/\{pageIsEmpty \? null : \(\s*<MobileStickyBar/)
    // The hero's button leads to real inventory when there is none here, never to an empty anchor.
    expect(source).toMatch(/primaryCtaHref=\{pageIsEmpty \? '\/events' : undefined\}/)
  })

  test('the hero button can lead somewhere other than the in-page grid', () => {
    const hero = read('src/components/features/city/city-hero.tsx')
    expect(hero).toMatch(/primaryCtaHref\?: string/)
    expect(hero).toMatch(/href=\{primaryCtaHref \?\? `#\$\{eventsAnchorId\}`\}/)
  })

  test('the note is one line of fact and one link to real events, with no pitch', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { EmptyCollectionNote } = await import('@/components/ui/empty-collection-note')
    const html = renderToStaticMarkup(
      createElement(EmptyCollectionNote, { message: 'No African events are listed in Adelaide yet.' }),
    )
    expect(html).toContain('No African events are listed in Adelaide yet.')
    expect(html).toContain('href="/events"')
    expect(html).toContain('See what is on across Australia')
    expect(html).not.toMatch(/could be yours|Set up in 5 minutes|Payouts|Talk to us/)
  })
})
