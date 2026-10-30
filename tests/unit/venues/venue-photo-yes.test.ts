// The venue's yes for its own photographs (the project manager's 16:42 of 30 October 2026: venues add, replace or
// withdraw photos of their venue, with their yes). Pinned: the yes is only ever the constant's words, never the form's;
// it needs the box ticked and the person to say they can give it; and each photograph's state reads plainly.

import { describe, expect, test } from 'vitest'
import { VENUE_PHOTO_YES_WORDS, venuePhotoStateWords, venuePhotoYes } from '@/lib/venues/venue-photo-words'

describe('the yes a venue gives for its photographs', () => {
  test('is the constant line, never anything the form sends', () => {
    expect(venuePhotoYes({ ticked: true, authority: true })).toEqual({ state: 'given', words: VENUE_PHOTO_YES_WORDS })
    expect(VENUE_PHOTO_YES_WORDS).toBe('Yes, EventLinqs may show these photographs of our venue on its listings and posts for nights at our venue.')
  })

  test('needs the box ticked', () => {
    expect(venuePhotoYes({ ticked: false, authority: true })).toEqual({ state: 'refused', reason: 'Tick the box to say EventLinqs may show these photographs.' })
  })

  test('needs the person to say they can give it', () => {
    expect(venuePhotoYes({ ticked: true, authority: false })).toEqual({
      state: 'refused',
      reason: 'Confirm you can give this permission for the venue.',
    })
  })
})

describe('each photograph says where it stands', () => {
  test.each([
    ['pending', 'Waiting for our team to check it'],
    ['candidate', 'Waiting for our team to check it'],
    ['approved', 'Showing on your nights'],
    ['refused', 'Not used'],
    ['challenged', 'Taken down while we look at a concern'],
    ['withdrawn', 'Withdrawn'],
  ])('%s', (state, words) => {
    expect(venuePhotoStateWords(state)).toBe(words)
  })
})
