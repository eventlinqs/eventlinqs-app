import { describe, expect, it } from 'vitest'
import { creditLine, creditsFrom, withCredits, type PhotoRightsRow } from '@/lib/media/photo-credits'

/*
 * AN ORGANISER'S PHOTOGRAPH CARRIES ITS CREDIT, AND ONLY A PERMITTED ONE DOES (window 6's gap 3 of 30 October 2026;
 * the supreme specification s10). The credit is the register's own words, printed only where the image's rights are
 * on record and current; an image whose source is not on record is never credited as if it were permitted.
 */
const now = new Date('2026-10-30T03:00:00Z')
const asset = { attribution_text: 'AMCF, past festival', approval_status: 'approved', withdrawal_status: 'current' }
const row = (over: Partial<PhotoRightsRow> = {}): PhotoRightsRow => ({ image_url: 'https://x/amcf-1.jpg', rights_state: 'organiser_authorised', rights_expire_at: null, social_assets: asset, ...over })

describe('creditsFrom', () => {
  it('an organiser-authorised, approved, current image carries the register\'s own words', () => {
    expect(creditsFrom([row()], now).get('https://x/amcf-1.jpg')).toBe('AMCF, past festival')
  })

  it('a separately licensed image carries its credit too', () => {
    expect(creditsFrom([row({ rights_state: 'separately_licensed' })], now).size).toBe(1)
  })

  it.each([
    ['unrecorded', row({ rights_state: 'unrecorded', social_assets: null })],
    ['our typographic cover', row({ rights_state: 'original_design', social_assets: null })],
    ['a library photograph', row({ rights_state: 'platform_library', social_assets: null })],
    ['a register row still pending', row({ social_assets: { ...asset, approval_status: 'pending' } })],
    ['a register row refused', row({ social_assets: { ...asset, approval_status: 'refused' } })],
    ['a withdrawn register row', row({ social_assets: { ...asset, withdrawal_status: 'withdrawn' } })],
    ['rights that have expired', row({ rights_expire_at: '2026-10-29T00:00:00Z' })],
    ['an approval with no words', row({ social_assets: { ...asset, attribution_text: '  ' } })],
  ])('carries no credit for %s', (_, r) => {
    expect(creditsFrom([r], now).size).toBe(0)
  })
})

describe('withCredits and creditLine', () => {
  it('attaches each credit to its own image and leaves the rest untouched', () => {
    const out = withCredits([{ url: 'https://x/amcf-1.jpg', alt: '' }, { url: 'https://x/other.jpg', alt: '' }], new Map([['https://x/amcf-1.jpg', 'AMCF, past festival']]))
    expect(out[0].credit).toBe('AMCF, past festival')
    expect(out[1].credit).toBeUndefined()
  })

  it("marks an illustrative photograph as illustrative, once, and never a night's own (Lawal's D2, 16 November 2026)", () => {
    expect(creditLine('Sebastian Ervi / Pexels', { illustrative: true })).toBe('Illustrative photo: Sebastian Ervi / Pexels')
    expect(creditLine('Photo: Sebastian Ervi / Pexels', { illustrative: true })).toBe('Illustrative photo: Sebastian Ervi / Pexels')
    expect(creditLine('Pexels', { illustrative: true, plural: true })).toBe('Illustrative photos: Pexels')
    expect(creditLine(null, { illustrative: true })).toBeNull()
    expect(creditLine('AMCF, past festival')).not.toMatch(/Illustrative/)
  })

  it('prints "Photo: <credit>", and nothing for no credit', () => {
    expect(creditLine('AMCF, past festival')).toBe('Photo: AMCF, past festival')
    expect(creditLine(undefined)).toBeNull()
    // A credit recorded with its own 'Photo:' is printed once (the guide read 'Photo: Photo: AMCF' on 12 November 2026).
    expect(creditLine('Photo: AMCF, past festival (2024)')).toBe('Photo: AMCF, past festival (2024)')
    expect(creditLine('Photo: Photo: AMCF')).toBe('Photo: AMCF')
    expect(creditLine('photo by: Jane Citizen')).toBe('Photo: Jane Citizen')
    expect(creditLine('Photographer Jane')).toBe('Photo: Photographer Jane')
    expect(creditLine('Photos: AMCF, past festivals', { plural: true })).toBe('Photos: AMCF, past festivals')
    expect(creditLine('Photo: AMCF, past festivals', { plural: true })).toBe('Photos: AMCF, past festivals')
    expect(creditLine('Photo:   ')).toBeNull()
    expect(creditLine(' ')).toBeNull()
  })

  it("a credit that names no one reads 'the organiser', never 'Its organiser' (the PM's 21:00 of 17 November 2026, item 2)", () => {
    // The PM, on d3/after-feature-feed.png: "'Photo: Its organiser'. That is wrong English. It must name the organiser
    // ('Photo: African Music and Cultural Festival') or read 'Photo: the organiser'."
    expect(creditLine('Its organiser')).toBe('Photo: the organiser')
    expect(creditLine('its organiser')).toBe('Photo: the organiser')
    expect(creditLine('Their organisers')).toBe('Photo: the organisers')
    expect(creditLine('Photo: Its venue')).toBe('Photo: the venue')
    expect(creditLine('His promoter')).toBe('Photo: the promoter')
    // A name is printed as recorded, even one that begins with the same letters.
    expect(creditLine('African Music and Cultural Festival')).toBe('Photo: African Music and Cultural Festival')
    expect(creditLine('Itsy Bitsy Band')).toBe('Photo: Itsy Bitsy Band')
    expect(creditLine('Their Majesties Brass, past show')).toBe('Photo: Their Majesties Brass, past show')
  })
})
