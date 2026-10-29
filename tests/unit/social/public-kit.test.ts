import { describe, expect, it } from 'vitest'
import { publicKitServes } from '@/lib/social/store'

/*
 * A PARTNER KIT'S SLIDES AT A PUBLIC ADDRESS (window 6's 29 October 16:58: message 7 names the kit's images, which
 * rendered only behind /admin, so it was held every time). Only a partner kit whose NEWEST version Lawal approved, and
 * did not reject, is drawn there; a kit already sent stays drawn, so the message's link keeps working.
 */
describe('which partner kit is drawn at /kit/<piece>/<n>', () => {
  const kit = { kind: 'partner_kit' as const, newestVersion: 2, approvedVersions: [2], rejectedVersions: [] as number[] }

  it('a partner kit whose newest version is approved', () => {
    expect(publicKitServes(kit)).toBe(true)
  })

  it('never an older approval once a newer version exists', () => {
    expect(publicKitServes({ ...kit, approvedVersions: [1] })).toBe(false)
  })

  it('never a version that was not approved, or approved and then rejected', () => {
    expect(publicKitServes({ ...kit, approvedVersions: [] })).toBe(false)
    expect(publicKitServes({ ...kit, rejectedVersions: [2] })).toBe(false)
  })

  it('an approved daily poster too, by the same rule (its square previews the first invitation)', () => {
    expect(publicKitServes({ ...kit, kind: 'daily_poster' })).toBe(true)
    expect(publicKitServes({ ...kit, kind: 'daily_poster', approvedVersions: [] })).toBe(false)
    expect(publicKitServes({ ...kit, kind: 'daily_poster', rejectedVersions: [2] })).toBe(false)
  })

  it('never any other piece of the campaign, approved or not', () => {
    for (const kind of ['week_ahead', 'weekend_carousel', 'discovery_reel', 'venue_spotlight', 'organiser_campaign', 'brand_campaign'] as const) {
      expect(publicKitServes({ ...kit, kind })).toBe(false)
    }
  })
})
