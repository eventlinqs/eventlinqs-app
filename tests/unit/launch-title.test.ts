import { describe, expect, it } from 'vitest'
import { tightenTitle } from '@/lib/launch/compose'

/**
 * The title defect the LIVE WALK found and the unit tests did not.
 *
 * The deterministic extractor splits the title on full stops, which is correct
 * for prose and wrong for the way people actually type an event: one line of
 * comma-separated details with no full stop anywhere. Every one of the six
 * arrivals below arrived with its ENTIRE input as the event title.
 *
 * The expected values here are the titles a promoter would actually write.
 */

describe('the six arrivals get a real title, not their whole sentence', () => {
  const CASES: [string, string][] = [
    [
      'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale',
      'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita',
    ],
    [
      'Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door',
      'Comedy night at the Prince',
    ],
    [
      'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm at Johnstone Park',
      'Geelong makers market',
    ],
    [
      'Pottery workshop, 6 places, $85, Saturday 27th September 10am, my studio in Newtown',
      'Pottery workshop',
    ],
    [
      'Trivia night for Geelong Animal Rescue, Sat 12th September, $30 a head, tables of 8, at the RSL',
      'Trivia night for Geelong Animal Rescue',
    ],
    [
      "Ruby's 16th, Saturday 20th September, 6pm at our place in Belmont, about 40 kids, no charge",
      "Ruby's 16th",
    ],
  ]

  it.each(CASES)('%s', (input, expected) => {
    expect(tightenTitle(input)).toBe(expected)
  })

  it('never returns the whole sentence for any arrival', () => {
    for (const [input] of CASES) {
      expect(tightenTitle(input).length).toBeLessThan(input.length)
    }
  })
})

describe('it does not damage a title that is already right', () => {
  it('leaves a comma-free title alone', () => {
    expect(tightenTitle('Winter Solstice Festival')).toBe('Winter Solstice Festival')
  })

  it('keeps a comma that continues the name rather than starting details', () => {
    expect(tightenTitle('Basement 45, Geelong')).toBe('Basement 45, Geelong')
    expect(tightenTitle('The Espy, St Kilda')).toBe('The Espy, St Kilda')
  })

  it('handles an empty or tiny title without producing junk', () => {
    expect(tightenTitle('')).toBe('')
    expect(tightenTitle(', 6pm')).toBe(', 6pm')
  })

  it('trims trailing punctuation left by the cut', () => {
    expect(tightenTitle('Jazz night ,  Sat 3rd')).toBe('Jazz night')
  })
})
