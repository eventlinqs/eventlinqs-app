import { describe, expect, it } from 'vitest'
import { SHOWN_LABELS, SHOWN_PROFILES, SOCIAL_PROFILES, sameAsProfiles } from '@/lib/brand/social-profiles'

/*
 * ONLY ACCOUNTS THAT ARE OURS (the PM's 17:42 of 19 November 2026, finding 3, agreed at 17:58). Read that day: our posts
 * publish to the Facebook Page behind profile id 61590528656810, while facebook.com/eventlinqs answers 400; Lawal's own
 * setup steps name the Instagram account @eventlinqs; nothing names a TikTok, X or LinkedIn account of ours. The footer
 * and the contact page show only what is ours, and sameAs asserts only that.
 */
describe('the footer links only our own accounts', () => {
  it('shows Instagram and our Facebook Page, and nothing not proved ours', () => {
    expect([...SHOWN_LABELS].sort()).toEqual(['Facebook', 'Instagram'])
    expect(SHOWN_PROFILES.find((p) => p.label === 'Facebook')?.href).toBe('https://www.facebook.com/profile.php?id=61590528656810')
    expect(SHOWN_PROFILES.find((p) => p.label === 'Instagram')?.href).toBe('https://www.instagram.com/eventlinqs')
  })

  it('the drill: the old Facebook address, which answered 400, is never shown', () => {
    expect(SHOWN_PROFILES.some((p) => p.href === 'https://facebook.com/eventlinqs')).toBe(false)
  })

  it('a hidden profile is kept, never deleted (law 13), and never asserted', () => {
    for (const label of ['TikTok', 'X', 'LinkedIn'] as const) {
      const p = SOCIAL_PROFILES.find((x) => x.label === label)
      expect(p, label).toBeDefined()
      expect(p?.shown).toBe(false)
      expect(sameAsProfiles()).not.toContain(p?.href)
    }
  })
})
