// NO PHOTO IS EVER REUSED, the project manager's ruling of 31 October 2026 (05:05 (3), taken by window 6 at 05:00): a
// brand photo belongs to ONE subject, its tile and its own page only. A page that is not that subject's own page
// borrows NOTHING and draws the branded navy treatment (each hero's own no-image band, each tile's navy gradient).
// The crawl of live on 31 October found the borrowers: every community-in-city page took its city's photo (else its
// community's) and the community's sub-community photos; every browse-by-city page and every free-this-week page took
// the city's photo; every faith page took a community's photo. Pinned by reading the sources: none of these pages may
// ask for a city, community or sub-community photo. The crawl on the preview is the proof on pages.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const BORROWERS = /\b(getCityHeroPhoto|getCommunityHeroPhoto|getSubCommunityPhoto|getSuburbHeroPhoto)\b/

const PAGES = [
  'src/app/community/[community]/[city]/page.tsx',
  'src/app/events/browse/[city]/page.tsx',
  'src/app/free/[city]/this-week/page.tsx',
  'src/app/faith/[faith]/page.tsx',
]

describe('a page that is not the subject itself borrows no photo', () => {
  test.each(PAGES)('%s asks for no city, community or sub-community photo', (page) => {
    const source = readFileSync(resolve(process.cwd(), page), 'utf8')
    expect(source).not.toMatch(BORROWERS)
  })

  test("a city page's by-type tiles (they open /events filtered by city and type) ask for no category photo", () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/city/[slug]/page.tsx'), 'utf8')
    expect(source).not.toMatch(/getCategoryPhoto/)
  })

  test('the community-in-city page draws its hero and sub-community tiles without a photo', () => {
    const source = readFileSync(resolve(process.cwd(), PAGES[0]), 'utf8')
    expect(source).toMatch(/heroImage=\{null\}/)
    expect(source).toMatch(/subCommunityImages=\{\{\}\}/)
  })
})
