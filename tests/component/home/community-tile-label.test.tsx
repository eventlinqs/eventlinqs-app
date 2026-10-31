import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CommunityTile, CityTile, CategoryTile } from '@/components/features/home/cards'

/*
 * NO TILE LABEL IS CUT, AND A TILE WITH NO EVENTS SAYS NOTHING INVITATIONAL (the CONTROLLER's 21:00 of 31 October 2026,
 * seen at 390 on live: 'Aboriginal & Torres Strait Islander' wrapped to four lines beside its count and 'Be the first'
 * ran off the card's edge). The count sits UNDER the name, never beside it, so no name can push it out; a tile with no
 * count draws no second line. Lawal's 17:44 section 11: an empty community is never dressed up as holding events.
 */

afterEach(() => cleanup())

const LONG = 'Aboriginal & Torres Strait Islander'

function labelBlock(container: HTMLElement): HTMLElement {
  const name = [...container.querySelectorAll('span')].find((s) => s.textContent === LONG || s.textContent === 'Ballarat' || s.textContent === 'Comedy')
  if (!name?.parentElement) throw new Error('the tile drew no name')
  return name.parentElement
}

describe('CommunityTile', () => {
  const tile = (metaLabel: string) =>
    render(<CommunityTile layout="rail-community-tile" community={{ href: '/community/aboriginal-torres-strait-islander', imageSrc: null, alt: LONG, name: LONG, metaLabel }} />)

  it('stacks the count under a long name, never beside it', () => {
    const block = labelBlock(tile('3 events').container)
    expect(block.className).toMatch(/\bflex-col\b/)
    expect(block.className).not.toMatch(/justify-between/)
    expect([...block.children].map((c) => c.textContent)).toEqual([LONG, '3 events'])
  })

  it('a community with no events draws no count and no invitation', () => {
    const { container } = tile('')
    expect([...labelBlock(container).children].map((c) => c.textContent)).toEqual([LONG])
    expect(container.textContent).not.toMatch(/Be the first|first organiser|List your event/i)
  })
})

describe('CityTile and CategoryTile', () => {
  it('stack the count under the name as well', () => {
    const city = labelBlock(render(<CityTile city={{ href: '/city/ballarat', imageSrc: '', alt: 'Ballarat', name: 'Ballarat', metaLabel: '' }} />).container)
    expect(city.className).toMatch(/\bflex-col\b/)
    expect(city.children).toHaveLength(1)
    cleanup()
    const category = labelBlock(render(<CategoryTile category={{ href: '/categories/comedy', imageSrc: '', alt: 'Comedy', name: 'Comedy', metaLabel: '35 events' }} />).container)
    expect(category.className).toMatch(/\bflex-col\b/)
  })
})

describe('no community or city tile source says an invitation', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it.each([
    'src/components/features/home/community-rail.tsx',
    'src/components/features/home/community-value-band.tsx',
    'src/app/cities/page.tsx',
    'src/app/communities/page.tsx',
    'src/components/features/events/city-rail-tile.tsx',
  ])('%s', (p) => {
    const code = read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/Be the first/)
  })
})
