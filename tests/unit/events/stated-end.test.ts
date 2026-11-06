import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { statedEnd } from '@/lib/events/stated-end'

/*
 * AN END IS SHOWN ONLY WHEN SOMEONE STATED IT (6 November 2026). Every hunted night's series holds no end (ends_at null),
 * and the occurrence run fills the night's end_date with the next midnight so the night leaves every list at its end (law
 * 16). That filled in midnight was printed on the event page ('Ends Friday 13 November 2026 at 12:00 am AEDT', Benson
 * Boone on www) and sent to Google as endDate, on all 143 hunted one-off nights: a time no source stated (LAW 19, law 13).
 * Google: "Don't indicate the time if you don't know the time" (developers.google.com/search/docs/appearance/structured-data/event).
 */
describe('statedEnd', () => {
  it("an organiser's own event shows the end the organiser entered", () => {
    expect(statedEnd({ end_date: '2026-11-13T03:00:00Z', listing_series_id: null })).toBe('2026-11-13T03:00:00Z')
  })

  it('a listing night whose series states no end shows none, whatever end_date the occurrence run filled in', () => {
    expect(statedEnd({ end_date: '2026-11-12T13:00:00Z', listing_series_id: 's1', listing_series: { ends_at: null } })).toBeNull()
  })

  it('a listing night whose series states an end shows it', () => {
    expect(statedEnd({ end_date: '2026-11-12T11:30:00Z', listing_series_id: 's1', listing_series: { ends_at: '22:30:00' } })).toBe('2026-11-12T11:30:00Z')
  })

  it("a listing night whose series cannot be read shows none: an end never shown is never false", () => {
    expect(statedEnd({ end_date: '2026-11-12T13:00:00Z', listing_series_id: 's1', listing_series: null })).toBeNull()
    expect(statedEnd({ end_date: '2026-11-12T13:00:00Z', listing_series_id: 's1' })).toBeNull()
  })
})

/* The guard: no visitor-facing page or the schema prints or sends an event's raw end_date; each goes through statedEnd. */
describe('no page shows an end nobody stated', () => {
  const root = join(__dirname, '..', '..', '..')
  const files = ['src/app/events/[slug]/page.tsx', 'src/components/events/walk-in/walk-in-event-page.tsx', 'src/lib/seo/event-schema.ts']
  for (const f of files) {
    it(`${f} reads the end through statedEnd`, () => {
      const source = readFileSync(join(root, f), 'utf8')
      expect(source).not.toMatch(/formatDateTime\(\s*event\.end_date/)
      expect(source).not.toMatch(/endDate:\s*(zoned\()?event\.end_date/)
      expect(source).toMatch(/statedEnd\(/)
    })
  }
})
