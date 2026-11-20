import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guideSearchWords, matchesGuideSearch, titleInitials, type GuideSearchRow } from '@/lib/events/guide-search'

/**
 * WHAT A VISITOR'S WORDS FIND ON A CITY GUIDE (WINDOW 5C, 21 November 2026). The production journey typed 'AMCF' and
 * 'free' into Melbourne's guide at 390 and found nothing for either, and a phone's Go did nothing at all. The rows below
 * are production's own (AMCF read at 09:55 that day: /events/amcf-2026, 'African Music and Cultural Festival 2026').
 */
const amcf: GuideSearchRow = {
  title: 'African Music and Cultural Festival 2026',
  venue: 'Federation Square',
  category: 'Festival',
  suburb: 'Melbourne',
  href: '/events/amcf-2026',
  free: true,
}
const jazz: GuideSearchRow = {
  title: 'Late Night Jazz at Bird’s Basement',
  venue: "Bird's Basement",
  category: 'Music',
  suburb: 'Melbourne',
  href: '/events/late-night-jazz-birds-basement-2026-11-22',
  free: false,
}
const market: GuideSearchRow = {
  title: 'Geelong Waterfront Twilight Market',
  venue: 'Steampacket Gardens',
  category: 'Markets',
  suburb: 'Geelong',
  href: '/events/geelong-waterfront-twilight-market',
  free: true,
}
const find = (q: string) => [amcf, jazz, market].filter((r) => matchesGuideSearch(r, guideSearchWords(q))).map((r) => r.href)

describe('the city guide search', () => {
  it("finds AMCF by the name people call it, from the title's initials", () => {
    expect(titleInitials(amcf.title)).toBe('amcf')
    expect(find('AMCF')).toEqual(['/events/amcf-2026'])
    expect(find('amcf 2026')).toEqual(['/events/amcf-2026'])
  })

  it('finds every free night for the word free, and only free ones', () => {
    expect(find('free')).toEqual(['/events/amcf-2026', '/events/geelong-waterfront-twilight-market'])
    expect(find('free geelong')).toEqual(['/events/geelong-waterfront-twilight-market'])
  })

  it('still finds by title, venue, category and suburb', () => {
    expect(find('jazz')).toEqual(['/events/late-night-jazz-birds-basement-2026-11-22'])
    expect(find('federation')).toEqual(['/events/amcf-2026'])
    expect(find('markets')).toEqual(['/events/geelong-waterfront-twilight-market'])
  })

  it('finds nothing for a word no night carries, and everything for no words', () => {
    expect(find('opera')).toEqual([])
    expect(find('   ')).toHaveLength(3)
  })

  it('matches initials from three letters, never two', () => {
    // 'gw' and 'gwt' appear in no title, venue, category, suburb or address; only in the market's initials ('gwtm').
    expect(find('gw')).toEqual([])
    expect(find('gwt')).toEqual(['/events/geelong-waterfront-twilight-market'])
  })
})

describe('the guide search box is a search form whose Go brings the list into view', () => {
  const src = readFileSync('src/components/features/city-guide/city-guide.tsx', 'utf8')
  it('sits inside a form role="search" that prevents the page reload and calls toList', () => {
    const form = src.slice(src.indexOf('role="search"'), src.indexOf('</form>'))
    expect(form).toContain('e.preventDefault()')
    expect(form).toContain('toList()')
    expect(form).toContain('type="search"')
  })
  it('matches through the shared guide search, never an inline title-only filter', () => {
    expect(src).toContain('matchesGuideSearch(r, words)')
    expect(src).not.toMatch(/words\.every\(\(w\) => `\$\{r\.title\}/)
  })
})
