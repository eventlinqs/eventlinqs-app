import { describe, expect, it } from 'vitest'

import { GENERATED_COPY_TELLS, findCopyTells } from '@/lib/ai/copy-tells'
import { enforceCopyLaws } from '@/lib/ai/sanitise'

/**
 * C3: every banned pattern in the lexicon is proven caught, one test row per
 * pattern, with a realistic offending sentence. A pattern with no sample here
 * fails the completeness test at the bottom, so the lexicon can never grow
 * an untested entry.
 */

/** One realistic offending sample per lexicon entry, keyed by tell name. */
const SAMPLES: Record<string, string> = {
  unforgettable: 'An unforgettable night of live music awaits.',
  'look-no-further': 'Look no further for your Saturday plans.',
  'stands-as-a-testament': 'This festival stands as a testament to local talent.',
  nestled: 'Nestled in a Geelong laneway, the venue seats eighty.',
  'in-the-heart-of': 'Live jazz in the heart of Melbourne.',
  delve: 'Delve into three hours of improvised comedy.',
  tapestry: 'A rich tapestry of sound and movement.',
  'navigate-the-landscape': 'We help you navigate the festival landscape.',
  'plays-a-pivotal-role': 'The venue plays a pivotal role in the night.',
  'not-just-x-its-y': 'This is not just a gig, it is a homecoming.',
  'get-ready-to': 'Get ready to dance until late.',
  'whether-youre-x-or-y':
    'Whether you are a first-timer or a lifelong fan, the door opens at seven.',
  elevate: 'Elevate your weekend with two headline sets.',
  unlock: 'Unlock the full festival experience.',
  vibrant: 'A vibrant celebration of sound.',
  seamless: 'Seamless entry with your phone ticket.',
  robust: 'A robust lineup across two stages.',
  leverage: 'Leverage the early-bird price before Friday.',
  'em-or-en-dash': 'Doors at seven — music at eight.',
  'exclamation-mark': 'Tickets on sale now!',
  'banned-word-community-law': 'A night of arts and culture in the west.',
  'competitor-name': 'Previously listed on Eventbrite.',
}

describe('findCopyTells catches every banned pattern', () => {
  for (const tell of GENERATED_COPY_TELLS) {
    it(`catches ${tell.name}`, () => {
      const sample = SAMPLES[tell.name]
      expect(sample, `no sample sentence for lexicon entry "${tell.name}"`).toBeDefined()
      expect(findCopyTells(sample)).toContain(tell.name)
    })
  }

  it('every lexicon entry has a sample (completeness)', () => {
    const names = GENERATED_COPY_TELLS.map(t => t.name)
    for (const name of names) expect(Object.keys(SAMPLES)).toContain(name)
  })

  it('clean expert copy passes with zero hits', () => {
    const clean =
      'Doors open at 7pm at The Wool Store, Little Malop Street. Two sets from ' +
      'the Geelong Youth Jazz Orchestra, an interval with the bar open, and a ' +
      'closing group number with all thirty players on stage. Seated show, ' +
      'eighty seats, wheelchair spaces beside rows A and F.'
    expect(findCopyTells(clean)).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(findCopyTells('AN UNFORGETTABLE EVENING')).toContain('unforgettable')
  })

  it('word boundaries hold: africultures and horticulturalist do not trip the banned word', () => {
    expect(findCopyTells('the africultures tag')).toEqual([])
    expect(findCopyTells('a horticulturalist presents')).toEqual([])
  })
})

describe('enforceCopyLaws layer-1 hard strips', () => {
  it('strips em and en dashes to hyphens', () => {
    expect(enforceCopyLaws('Doors — 7pm – late')).toBe('Doors - 7pm - late')
  })

  it('turns exclamation marks into full stops', () => {
    expect(enforceCopyLaws('Tickets on sale now!')).toBe('Tickets on sale now.')
    expect(enforceCopyLaws('Wow!! What a night')).toBe('Wow. What a night')
  })

  it('drops a bang after a question mark', () => {
    expect(enforceCopyLaws('Ready?!')).toBe('Ready?')
  })

  it('leaves clean copy untouched', () => {
    const clean = 'Doors open 7pm. Two sets, one interval.'
    expect(enforceCopyLaws(clean)).toBe(clean)
  })
})
