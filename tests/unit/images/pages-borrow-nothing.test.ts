// ONE PHOTO, ONE SUBJECT (Lawal's standing directive of 31 October 2026, C:\dev\CLAUDE.md, and the photo system's A1):
// a photo appears wherever it genuinely shows its own subject and never on a different one, and real photography is
// never swapped for a placeholder to dodge a repeat. Car 20 drew these pages navy under the earlier 05:05 rule, and the
// live crawl of 31 October counted 420 community-in-city heroes and their sub-community tiles, every browse-by-city and
// every free-this-week hero, without a photo. So, read from the sources:
//   a community-in-city page shows its COMMUNITY's own hero and each sub-community's own photo, never its city's photo
//   (the page's subject is the community; the city is where);
//   a browse-by-city and a free-this-week page show their own CITY's photo;
//   a faith page and a community page's organiser panel still borrow nothing: no faith photo of its own exists yet, and
//   a community or city photo there would show a different subject.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (page: string) => readFileSync(resolve(process.cwd(), page), 'utf8')
const COMMUNITY_IN_CITY = 'src/app/community/[community]/[city]/page.tsx'

describe('every page shows the photo of its own subject, and only that', () => {
  test("a community-in-city page shows its community's own hero and sub-community photos, never its city's", () => {
    const source = read(COMMUNITY_IN_CITY)
    expect(source).toMatch(/\bgetCommunityHeroPhoto\b/)
    expect(source).toMatch(/\bgetSubCommunityPhoto\b/)
    expect(source).not.toMatch(/\bgetCityHeroPhoto\b/)
    expect(source).not.toMatch(/heroImage=\{null\}/)
    expect(source).not.toMatch(/subCommunityImages=\{\{\}\}/)
  })

  test.each(['src/app/events/browse/[city]/page.tsx', 'src/app/free/[city]/this-week/page.tsx'])(
    "%s shows its own city's photo",
    (page) => {
      const source = read(page)
      expect(source).toMatch(/\bgetCityHeroPhoto\(city\.slug\)/)
      expect(source).not.toMatch(/const heroImage = null/)
    },
  )

  test('a faith page borrows no community photo', () => {
    expect(read('src/app/faith/[faith]/page.tsx')).not.toMatch(/\b(getCityHeroPhoto|getCommunityHeroPhoto|getSubCommunityPhoto)\b/)
  })

  test("a city page's by-type tiles (they open /events filtered by city and type) ask for no category photo", () => {
    expect(read('src/app/city/[slug]/page.tsx')).not.toMatch(/\bgetCategoryPhoto\b/)
  })

  // The crawl found Sydney's harbour photo as the organiser panel's backdrop on 22 community pages (the first city's
  // hero); the community page is not Sydney's, so the panel draws its own navy treatment.
  test("a community page's organiser panel asks for no city photo", () => {
    const source = read('src/app/community/[community]/page.tsx')
    expect(source).not.toMatch(/\bgetCityHeroPhoto\b/)
    expect(source).toMatch(/cityCtaImage=\{null\}/)
  })
})
