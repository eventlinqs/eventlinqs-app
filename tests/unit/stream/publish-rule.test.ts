import { describe, expect, test } from 'vitest'
import { livestreamNeedsLink, coerceAccessMode, STREAM_LINK_REQUIRED_MESSAGE } from '@/lib/stream/publish-rule'

/**
 * ONE PUBLISH RULE, TWO READERS (Scope v5 3.11). The form disables Publish and
 * the server action refuses with the same predicate, so there is never a live
 * button beside a refusal and never a refusal the button did not warn about.
 */
describe('livestreamNeedsLink', () => {
  const link = 'https://www.youtube.com/live/dQw4w9WgXcQ'

  test('an in-person event never needs a link', () => {
    expect(livestreamNeedsLink({ eventType: 'in_person', tierAccessModes: ['in_person'], streamUrl: null })).toBe(false)
    expect(livestreamNeedsLink({ eventType: 'in_person', tierAccessModes: ['virtual'], streamUrl: '' })).toBe(false)
  })

  test('a virtual event needs a link whatever its tiers say', () => {
    expect(livestreamNeedsLink({ eventType: 'virtual', tierAccessModes: [], streamUrl: null })).toBe(true)
    expect(livestreamNeedsLink({ eventType: 'virtual', tierAccessModes: ['in_person'], streamUrl: '   ' })).toBe(true)
    expect(livestreamNeedsLink({ eventType: 'virtual', tierAccessModes: [], streamUrl: link })).toBe(false)
  })

  test('a hybrid event needs a link only once a livestream tier exists', () => {
    expect(livestreamNeedsLink({ eventType: 'hybrid', tierAccessModes: ['in_person', 'in_person'], streamUrl: null })).toBe(false)
    expect(livestreamNeedsLink({ eventType: 'hybrid', tierAccessModes: ['in_person', 'virtual'], streamUrl: null })).toBe(true)
    expect(livestreamNeedsLink({ eventType: 'hybrid', tierAccessModes: ['in_person', 'virtual'], streamUrl: link })).toBe(false)
  })

  test('a link that viewers cannot open counts as missing', () => {
    expect(livestreamNeedsLink({ eventType: 'virtual', tierAccessModes: [], streamUrl: 'not a link' })).toBe(true)
    expect(livestreamNeedsLink({ eventType: 'virtual', tierAccessModes: [], streamUrl: '<iframe src="x">' })).toBe(true)
    expect(livestreamNeedsLink({ eventType: 'virtual', tierAccessModes: [], streamUrl: 'rtmp://live.example.com/app/key' })).toBe(false)
  })

  test('the sentence names the reveal rule', () => {
    expect(STREAM_LINK_REQUIRED_MESSAGE).toMatch(/revealed only to ticket holders/)
    expect(STREAM_LINK_REQUIRED_MESSAGE).not.toMatch(/[!]/)
  })
})

describe('coerceAccessMode mirrors the database trigger', () => {
  test('a virtual event makes every tier a livestream tier', () => {
    expect(coerceAccessMode('virtual', 'in_person')).toBe('virtual')
    expect(coerceAccessMode('virtual', null)).toBe('virtual')
  })
  test('an in-person event makes every tier a door tier', () => {
    expect(coerceAccessMode('in_person', 'virtual')).toBe('in_person')
    expect(coerceAccessMode('in_person', undefined)).toBe('in_person')
  })
  test('a hybrid event keeps what the organiser chose, defaulting to the door', () => {
    expect(coerceAccessMode('hybrid', 'virtual')).toBe('virtual')
    expect(coerceAccessMode('hybrid', 'in_person')).toBe('in_person')
    expect(coerceAccessMode('hybrid', undefined)).toBe('in_person')
  })
})
