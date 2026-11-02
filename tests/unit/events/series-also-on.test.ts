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

  it('the photo card and the directory row each carry it as one meta line, with every date in the title', () => {
    // EventCard needs a mounted app router to render, so its source is read. Since the CONTROLLER's 16:41 of
    // 1 November 2026 the day and time are one line above the title on both, so the later nights' words are their own
    // line, every date in the title: once on the photo card, once on the row.
    const source = readFileSync(join(process.cwd(), 'src/components/features/events/event-card.tsx'), 'utf8')
    expect(source).toContain('const alsoOn = seriesAlsoOn(also_on, timezone)')
    expect(source).toContain('const meta = alsoOn ? alsoOn.words : null')
    expect(source.match(/title=\{alsoOn\?\.every\}/g)).toHaveLength(2)
  })
})
