import { describe, expect, test } from 'vitest'
import { GUIDE_PUBLIC_VISIBILITIES, guideIsPublic } from '@/lib/walk-in/guide-visibility'

/**
 * WHO READS A WALK-IN GUIDE ON ITS PAGE (the project manager's ruling of
 * 24 October 13:24): the same two cases the events table admits to the public,
 * published and public, or published and unlisted, and nothing else.
 */

const walkIn = (status: string, visibility: string) => ({ status, visibility, entry_mode: 'walk_in' })

describe('the guide the public reads', () => {
  test('an unlisted walk-in event shows its guide to whoever has the link, as a public one does', () => {
    expect(guideIsPublic(walkIn('published', 'unlisted'))).toBe(true)
    expect(guideIsPublic(walkIn('published', 'public'))).toBe(true)
  })

  test('a draft, a cancelled, a postponed and a private event show none', () => {
    expect(guideIsPublic(walkIn('draft', 'unlisted'))).toBe(false)
    expect(guideIsPublic(walkIn('cancelled', 'unlisted'))).toBe(false)
    expect(guideIsPublic(walkIn('postponed', 'public'))).toBe(false)
    expect(guideIsPublic(walkIn('published', 'private'))).toBe(false)
  })

  test('an allow-list: a visibility nobody has named shows nothing, and a ticketed event has no guide to show', () => {
    expect(GUIDE_PUBLIC_VISIBILITIES).toEqual(['public', 'unlisted'])
    expect(guideIsPublic(walkIn('published', 'members'))).toBe(false)
    expect(guideIsPublic({ status: 'published', visibility: 'unlisted', entry_mode: 'tickets' })).toBe(false)
    expect(guideIsPublic({ status: 'published', visibility: null, entry_mode: 'walk_in' })).toBe(false)
  })

  test('the page reads the guide through this rule, never with the public client', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/components/events/walk-in/walk-in-event-page.tsx', 'utf8')
    expect(page).toMatch(/readPublicGuide\(event\)/)
    expect(page).not.toMatch(/from\('event_guides'\)/)
  })
})
