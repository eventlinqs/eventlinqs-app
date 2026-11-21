import { describe, expect, it } from 'vitest'
import { pieceQuality, type QualityNight } from '@/lib/social/piece-quality'
import type { Slide } from '@/lib/social/campaign'

/*
 * THE GATE STOPS A FIRST DAY'S WORDS ON A LATER NIGHT (the PM's 04:40 of 22 November 2026). Colours of Asia: Garden of
 * Wonders' 22 November piece (06c7007d) opened 'Opening today.' on the sixth night of a season begun on the 13th, and our
 * provider cannot edit a published post; the publish gate now refuses those words before they go.
 */
const night = (over: Partial<QualityNight> = {}): QualityNight => ({
  eventId: 'coa-22',
  title: 'Colours of Asia: Garden of Wonders',
  summary: 'A free festival in Alexandra Gardens with Asian street food, lantern gardens, music, dance, art and artisan markets.',
  venueName: 'Alexandra Gardens',
  host: null,
  categorySlug: 'festivals',
  sourceTitle: null,
  startDate: '2026-11-22T00:00:00Z',
  endDate: '2026-11-22T11:00:00Z',
  timezone: 'Australia/Melbourne',
  ...over,
} as QualityNight)
const slides: Slide[] = [{ t: 'photo', composition: 'photo_whole', eventId: 'coa-22', photo: 'https://x/coa-22.jpg', credit: null, width: 916, height: 654, line: null } as unknown as Slide]
const judge = (caption: string, n: QualityNight) =>
  pieceQuality({ slides, caption, madeAt: '2026-11-21T14:59:00Z', nights: new Map([[n.eventId, n]]), now: new Date('2026-11-21T15:59:00Z') }).filter((r) => r.includes('never an opening'))

describe("a first day's words only on a season's first day", () => {
  it("Colours of Asia's 22 November piece, 'Opening today.' on a season begun on the 13th, is refused", () => {
    expect(judge('Opening today.\n\nColours of Asia: Garden of Wonders', night({ seasonBegan: '2026-11-13T00:00:00Z' }))).toHaveLength(1)
    expect(judge('Street food, lantern gardens and music at Alexandra Gardens, from today.', night({ seasonBegan: '2026-11-13T00:00:00Z' }))).toHaveLength(1)
  })

  it("the season's first night may open, and a later night's own words pass", () => {
    expect(judge('Opening today.', night({ seasonBegan: null }))).toEqual([])
    expect(judge('Last day today for street food, lantern gardens and music at Alexandra Gardens, and still on.', night({ seasonBegan: '2026-11-13T00:00:00Z' }))).toEqual([])
  })
})
