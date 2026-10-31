import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reportWords } from '@/lib/listings/report-words'

/*
 * THE REPORT LINE SAYS WHAT THE PAGE IS (Lawal's 17:44 directive, section 10; looked at on live, 31 October 2026). The
 * Afro-Fusion Music Showcase, which its organiser runs and sells on EventLinqs, said 'Report or remove this listing',
 * and its form offered 'I run this event or venue and want it taken down': words for a listing EventLinqs wrote,
 * shown to the organiser of their own event. A listing keeps its words; an organiser's own event is reported as an
 * event, and its organiser is pointed at the dashboard, where Edit, Pause and Cancel already are.
 */
describe('the report words', () => {
  it('a listing EventLinqs wrote keeps its words and its takedown reason', () => {
    const w = reportWords('eventlinqs')
    expect(w.link).toBe('Report or remove this listing')
    expect(w.reasons.map((r) => r.key)).toContain('mine')
    expect(w.organiserLine).toBeNull()
  })

  it("an organiser's own event is reported as an event, and its organiser goes to the dashboard", () => {
    const w = reportWords('organiser')
    expect(w.link).toBe('Report this event')
    expect(`${w.link} ${w.eyebrow} ${w.subtitle} ${w.back}`).not.toMatch(/listing/i)
    expect(w.reasons.map((r) => r.key)).not.toContain('mine')
    expect(w.organiserLine).toEqual({ words: 'Running this event? Edit, pause or cancel it from your dashboard.', href: '/dashboard/events' })
  })

  it('the dashboard really offers what the line promises', () => {
    const table = readFileSync('src/app/(dashboard)/dashboard/events/events-table.tsx', 'utf8')
    for (const action of ['Pause', 'Cancel']) expect(table).toMatch(new RegExp(`>\\s*${action}\\s*<`))
    expect(table).toMatch(/Edit/)
  })

  it('both event pages pass the listing source to the link, and the report page words come from here', () => {
    for (const file of ['src/app/events/[slug]/page.tsx', 'src/components/events/walk-in/walk-in-event-page.tsx']) {
      expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toMatch(/<ReportListingLink[^>]*listingSource=\{event\.listing_source\}/)
    }
    expect(readFileSync('src/app/events/[slug]/report/page.tsx', 'utf8')).toMatch(/reportWords\(/)
  })
})
