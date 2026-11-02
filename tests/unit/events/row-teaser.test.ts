import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowTeaser } from '@/lib/events/whats-on-directory'

/*
 * ROUND 3 (4), A ONE-LINE TEASER ON EVERY ROW (Lawal, 2 November 2026, 15:33: 'I shouldn't have to click on every event';
 * the CONTROLLER's 15:34 (4)). The row shows the event's own summary, the one line the event page already shows (written
 * by EventLinqs from the facts, or the organiser's own words: WINDOW 6's 15:37, 0 copied from a source), ONLY where it
 * says something the row does not already say. A thin line, '<kind> at <venue>', repeats the venue under the venue and
 * sells nothing (WINDOW 6: 199 of 828 nights), so it is not shown until a real line is written.
 */
describe('rowTeaser', () => {
  it('shows a line that says what happens', () => {
    expect(rowTeaser('Stories, songs and rhymes for toddlers and their carers, ages 1 to 3.', 'Geelong Library and Heritage Centre', 'Geelong', 'Toddler time'))
      .toBe('Stories, songs and rhymes for toddlers and their carers, ages 1 to 3.')
  })
  it("hides '<kind> at <venue>': the venue under the venue sells nothing", () => {
    expect(rowTeaser('Live music at Costa Hall, Geelong Arts Centre.', 'Costa Hall, Geelong Arts Centre', 'Geelong', 'Katie Noonan')).toBeNull()
    expect(rowTeaser('Comedy at Comedy Republic, Bourke Street, Melbourne.', 'Comedy Republic', 'Melbourne', 'Late Show')).toBeNull()
  })
  it('hides a line that only repeats the title', () => {
    expect(rowTeaser('Open Mic Comedy', 'The Barwon Club', 'Geelong', 'Open Mic Comedy')).toBeNull()
  })
  it('hides an empty or missing line, and trims what it shows', () => {
    expect(rowTeaser(null, 'X', 'Geelong', 'T')).toBeNull()
    expect(rowTeaser('   ', 'X', 'Geelong', 'T')).toBeNull()
    expect(rowTeaser('  A three day festival of African music, food and dance by the river.  ', null, 'Melbourne', 'AMCF'))
      .toBe('A three day festival of African music, food and dance by the river.')
  })
})

describe('the row draws it under the title, at most two lines', () => {
  it('city-guide.tsx renders r.teaser with line-clamp-2 between the title and the venue line', () => {
    const file = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide.tsx'), 'utf8').replace(/\r\n/g, '\n')
    // The directory row itself (the Big nights card has its own three-line teaser).
    const g = file.slice(file.indexOf('function Row('))
    const title = g.indexOf('{r.title}')
    const teaser = g.indexOf('{r.teaser}')
    const venue = g.indexOf('{[r.venue,')
    expect(title).toBeGreaterThan(0)
    expect(teaser).toBeGreaterThan(title)
    expect(venue).toBeGreaterThan(teaser)
    expect(g.slice(g.lastIndexOf('<span', teaser), teaser)).toMatch(/line-clamp-2/)
  })
})
