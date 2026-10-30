import { describe, expect, test } from 'vitest'
import { campaignReadyFigure, venuePhotoFigure } from '@/lib/admin/control-centre-complete'
import type { CampaignLevel } from '@/lib/campaigns/eligibility'

/**
 * THE FOUNDER CONTROL CENTRE'S LAST TWO ROWS (Lawal's DemandOS directive of 30 October 2026, section 11: "campaign-ready
 * events" and "media approvals"). The venue photographs waiting for Lawal in /admin/venues/photos, and the nights the
 * eligibility rules (src/lib/campaigns/eligibility.ts, D1) find ready for a Featured or Performance campaign. What could
 * not be read is not counted, never 0.
 */

describe('venue photographs waiting for a decision', () => {
  test('ask for a person daily, linked to the approval screen', () => {
    expect(venuePhotoFigure({ value: 29 })).toMatchObject({
      label: 'Venue photos waiting for a decision',
      value: 29,
      asksForAPerson: true,
      href: '/admin/venues/photos',
      kind: 'approve',
      cadence: 'daily',
    })
  })
  test('a count that could not be read is not counted, with its reason', () => {
    const f = venuePhotoFigure({ value: null, note: 'could not be read: timeout' })
    expect(f.value).toBeNull()
    expect(f.note).toBe('could not be read: timeout')
  })
})

const judged = (levels: (CampaignLevel | null)[]) => ({ events: levels.map((level) => ({ level })), venuePhotosUnread: false })

describe('nights ready for a campaign', () => {
  test('counts Featured and Performance, never Discovery, and says how many of each', () => {
    const f = campaignReadyFigure({ ok: true, value: judged(['performance', 'featured', 'featured', 'discovery', null]) })
    expect(f).toMatchObject({ label: 'Nights ready for a campaign', value: 3, asksForAPerson: false, href: '/admin/eligibility', kind: 'measure', cadence: 'weekly' })
    expect(f.note).toBe('Performance 1, Featured 2, of 5 upcoming public nights; nothing is spent without Lawal')
  })
  test('says so when the venue photographs could not be read', () => {
    const f = campaignReadyFigure({ ok: true, value: { ...judged(['discovery']), venuePhotosUnread: true } })
    expect(f.value).toBe(0)
    expect(f.note).toContain('venue photographs could not be read, so none counted')
  })
  test('a reading that failed is not counted, never 0', () => {
    const f = campaignReadyFigure({ ok: false, note: 'could not be read: fetch failed' })
    expect(f.value).toBeNull()
    expect(f.note).toBe('could not be read: fetch failed')
  })
})
