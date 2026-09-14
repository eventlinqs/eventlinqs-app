import { describe, it, expect } from 'vitest'
import {
  SOCIAL_PROFILES,
  SOCIAL_HREF,
  sameAsProfiles,
  type SocialLabel,
} from '@/lib/brand/social-profiles'

/**
 * ONE LIST OF THE PLATFORM'S OWN PROFILES, AND IT HAS TO STAY ONE.
 *
 * There were two hard-coded lists that disagreed (the footer published five
 * profiles, the contact page three) and a third claim in the structured data
 * that said nothing at all: `sameAs: []`, on every page of the platform.
 *
 * These tests hold the three properties that make the single source real: it is
 * TOTAL (every label the union declares resolves, so a rename cannot leave a
 * page with an empty href), it is HONEST (`sameAs` asserts only what was shown
 * to exist), and it is WELL FORMED (absolute https URLs, no duplicates).
 */

const EVERY_LABEL: SocialLabel[] = ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook']

describe('the platform social profile configuration', () => {
  it('resolves every label in the union, so no surface can render an empty href', () => {
    for (const label of EVERY_LABEL) {
      expect(SOCIAL_HREF[label], `no href configured for ${label}`).toBeTruthy()
      expect(SOCIAL_HREF[label]).toMatch(/^https:\/\//)
    }
    // And the lookup holds nothing the union does not declare, so a profile
    // cannot be added to the array and quietly missed by every consumer.
    expect(Object.keys(SOCIAL_HREF).sort()).toEqual([...EVERY_LABEL].sort())
  })

  it('lists each profile once, with an absolute https URL', () => {
    const hrefs = SOCIAL_PROFILES.map(p => p.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(new Set(SOCIAL_PROFILES.map(p => p.label)).size).toBe(SOCIAL_PROFILES.length)
    expect(hrefs.every(h => /^https:\/\//.test(h))).toBe(true)
  })

  it('sameAs asserts only the profiles that were shown to exist', () => {
    /*
     * `sameAs` tells a search engine "this URL is another identity of this
     * organisation". Asserting it about a profile that does not exist is worse
     * than asserting nothing, so the list carries a `confirmed` flag and only
     * confirmed entries are emitted.
     *
     * Probed 14 September 2026 against a nonsense-handle control: a nonsense
     * LinkedIn company returns 404 while ours returns 200, which proves it. A
     * nonsense Instagram handle and a nonsense Facebook page BOTH return 200,
     * so those status codes prove nothing and those profiles stay UNSOURCED.
     */
    const emitted = sameAsProfiles()
    expect(emitted.length).toBeGreaterThan(0)
    for (const href of emitted) {
      const profile = SOCIAL_PROFILES.find(p => p.href === href)
      expect(profile?.confirmed, `${href} is emitted but not confirmed`).toBe(true)
    }
    // Negative control: an unconfirmed profile is genuinely held back, or the
    // assertion above would pass on a function that returned everything.
    const unconfirmed = SOCIAL_PROFILES.filter(p => !p.confirmed)
    expect(unconfirmed.length).toBeGreaterThan(0)
    for (const p of unconfirmed) expect(emitted).not.toContain(p.href)
  })
})
