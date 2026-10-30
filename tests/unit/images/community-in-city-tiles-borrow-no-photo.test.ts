import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { BrowseByCommunityRail } from '@/components/features/city/browse-by-community-rail'
import { CommunitiesByCityRail } from '@/components/features/community/cities-rail'

/**
 * NO PHOTO IS EVER REUSED (Lawal, 31 October 2026 00:14; C:\dev\START-16OCT\EVENTLINQS-PHOTO-SYSTEM-31OCT.md P6).
 *
 * A tile that opens a community-in-city page (/community/<community>/<city>) used to borrow a photo: the community's
 * own photo on a city page, the city's own photo on a community page. The live crawl of 31 October
 * (C:\dev\EVIDENCE\PHOTO-SYSTEM-31OCT\baseline) found each city photo on up to 67 surfaces that way. Such a tile has
 * no photo of its own, so it draws its navy tile and its name, and the rails no longer take a photo at all.
 */
describe('community-in-city tiles borrow no photo', () => {
  it('the city page rail: every community tile links to its community-in-city page and draws no image', () => {
    const html = renderToStaticMarkup(createElement(BrowseByCommunityRail, { citySlug: 'geelong', cityName: 'Geelong' }))
    expect(html).toContain('href="/community/african/geelong"')
    expect(html).not.toMatch(/<img\b/)
  })

  it('the community page rail: every city tile links to its community-in-city page and draws no image', () => {
    const html = renderToStaticMarkup(
      createElement(CommunitiesByCityRail, { communitySlug: 'african', communityName: 'African', cities: ['Melbourne', 'Geelong'] }),
    )
    expect(html).toContain('href="/community/african/melbourne"')
    expect(html).toContain('href="/community/african/geelong"')
    expect(html).not.toMatch(/<img\b/)
  })
})
