import { describe, expect, it } from 'vitest'
import { isPlaceholderSummary, shownSummary } from '@/lib/listings/placeholder-summary'

/* The PM's 03:14 of 21 November 2026 (Law 1 and the Definition of Done: zero placeholders). Every line below was read on
   production at 03:15 that day, on live nights: 350 of 721 carried one of the two composed shapes. */
describe('a composed line that says nothing about the night', () => {
  it.each([
    'An event on a Saturday evening, tickets through Ticketek.',
    'An event on a Thursday evening, tickets through AXS.',
    'A live concert on a Friday evening, tickets through Ticketek.',
    'A community event on a Saturday morning, free entry.',
    'Live stand-up comedy on a Saturday afternoon.',
    'A performance at The Story House, Geelong Arts Centre.',
    'A performance at Costa Hall, Geelong Arts Centre.',
    'A performance at The Play House, Geelong Arts Centre.',
    'A dance performance at Ulumbarra Theatre, Bendigo.',
  ])('is a placeholder: %s', (line) => {
    expect(isPlaceholderSummary(line)).toBe(true)
    expect(shownSummary(line)).toBeNull()
  })

  it.each([
    // Real descriptions on the same nights' neighbours, kept whole.
    'Free live music on the front steps of The Capital, the November edition of a monthly series of touring and local acts.',
    "Agatha Christie's courtroom drama staged in the Old Eaglehawk Court House, not recommended for children under 14.",
    'Street food and live music under the lights all evening.',
    // Begins like one, then says something about the night.
    'A performance at The Play House by the Geelong Rep, with live music.',
    'An event on a Saturday evening with three local bands and a food truck.',
  ])('is a description: %s', (line) => {
    expect(isPlaceholderSummary(line)).toBe(false)
    expect(shownSummary(line)).toBe(line)
  })

  it('none is none', () => {
    expect(isPlaceholderSummary(null)).toBe(false)
    expect(isPlaceholderSummary('')).toBe(false)
    expect(shownSummary('')).toBeNull()
    expect(shownSummary(null)).toBeNull()
  })
})
