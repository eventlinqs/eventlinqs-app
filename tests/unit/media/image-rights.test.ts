import { describe, expect, test } from 'vitest'
import { IMAGE_RIGHTS_STATES, imageRightsLine, needsAttention } from '@/lib/media/image-rights'

/*
 * THE FOUNDER READS EVERY PUBLIC NIGHT'S IMAGE RIGHTS IN ONE LINE (Lawal's master mandate of 29 October 2026,
 * section 5: a media-provenance and rights-status field for each image). The rows are derived by the database
 * (event_image_rights); this is what the founder's screen says about them.
 */
describe('the image rights line', () => {
  test('names every state with its count, the ones needing attention first', () => {
    const line = imageRightsLine({ organiser_authorised: 2, separately_licensed: 0, original_design: 358, platform_library: 1, unrecorded: 3 })
    expect(line).toBe(
      '364 images on public nights: 3 with rights not on record and 1 library photograph need attention; 358 our typographic covers, 2 the organiser\'s own.',
    )
  })

  test('says plainly when nothing needs attention', () => {
    expect(imageRightsLine({ organiser_authorised: 1, separately_licensed: 1, original_design: 10, platform_library: 0, unrecorded: 0 })).toBe(
      '12 images on public nights, none needing attention: 10 our typographic covers, 1 the organiser\'s own, 1 separately licensed.',
    )
  })

  test('an empty register says so rather than a zero that reads like a fact', () => {
    expect(imageRightsLine({ organiser_authorised: 0, separately_licensed: 0, original_design: 0, platform_library: 0, unrecorded: 0 })).toBe(
      'No image on a public night is on record yet.',
    )
  })

  test('only unrecorded and library images need attention, and every state is known', () => {
    expect(IMAGE_RIGHTS_STATES.filter(needsAttention)).toEqual(['platform_library', 'unrecorded'])
    expect(IMAGE_RIGHTS_STATES).toEqual(['organiser_authorised', 'separately_licensed', 'original_design', 'platform_library', 'unrecorded'])
  })
})
