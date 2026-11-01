import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seriesAlsoOn } from '@/lib/events/series-also-on'

/*
 * A RECURRING SERIES IS ONE EVENT (the photo system's P4): one card on a page, "its later dates named on that card". On
 * the date line, so a card in a rail keeps the height of every other; every date in the line's title.
 */

const TZ = 'Australia/Melbourne'
const LATER = ['2026-11-07T22:00:00Z', '2026-11-14T22:00:00Z', '2026-11-21T22:00:00Z']

describe('the later nights of a series, on its card', () => {
  it('names the next one and counts the rest', () => {
    expect(seriesAlsoOn(LATER, TZ)).toEqual({ words: 'also Sun, 8 Nov and 2 more', every: 'Also on Sun, 8 Nov; Sun, 15 Nov; Sun, 22 Nov' })
    expect(seriesAlsoOn(LATER.slice(0, 1), TZ)?.words).toBe('also Sun, 8 Nov')
  })

  it('says nothing for a night that is not part of a series on the page', () => {
    expect(seriesAlsoOn(undefined, TZ)).toBeNull()
    expect(seriesAlsoOn([], TZ)).toBeNull()
  })

  it('the Ledger card carries it as its one meta line, with every date in the title', () => {
    // EventCard needs a mounted app router to render, so its source is read. The Ledger card (1 November 2026) has one
    // date column and one meta line: the later nights' words stand where the time would, every date in the title.
    const source = readFileSync(join(process.cwd(), 'src/components/features/events/event-card.tsx'), 'utf8')
    expect(source).toContain('const alsoOn = seriesAlsoOn(also_on, timezone)')
    expect(source).toContain('const meta = alsoOn ? alsoOn.words : timeOf(start_date, timezone)')
    expect(source.match(/title=\{alsoOn\?\.every\}/g)).toHaveLength(1)
  })
})
