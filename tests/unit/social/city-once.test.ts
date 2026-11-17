import { describe, expect, it } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { pickLine, type CampaignNight } from '@/lib/social/campaign'

/*
 * THE CITY NEVER TWICE IN A CAPTION (the PM's 23:45 of 17 November 2026, fix (d)): 'Her Majesty's Theatre Ballarat,
 * Ballarat' and 'Melbourne Recital Centre, Melbourne' named the city twice; a venue whose own name holds the city is
 * named alone, and any other venue keeps its city.
 */
const night = (venueName: string, cityName: string): CampaignNight =>
  ({
    eventId: '00000000-0000-4000-9000-000000000001',
    slug: 'a-night',
    title: 'Kate Ceberano',
    startDate: '2026-11-19T08:00:00Z',
    timezone: 'Australia/Melbourne',
    citySlug: cityName.toLowerCase(),
    cityName,
    venueName,
    host: venueName,
    categorySlug: 'music',
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: ctaFor({ tiers: [{ price: 4500 }] }),
    priceLine: null,
  }) as unknown as CampaignNight

describe('the city never twice', () => {
  it("a venue whose name holds its city is named alone", () => {
    expect(pickLine(night("Her Majesty's Theatre Ballarat", 'Ballarat'))).toContain("Her Majesty's Theatre Ballarat.")
    expect(pickLine(night("Her Majesty's Theatre Ballarat", 'Ballarat'))).not.toContain('Ballarat, Ballarat')
    expect(pickLine(night('Melbourne Recital Centre', 'Melbourne'))).not.toContain('Melbourne Recital Centre, Melbourne')
  })

  it('any other venue keeps its city', () => {
    expect(pickLine(night('Costa Hall', 'Geelong'))).toContain('Costa Hall, Geelong.')
  })
})
