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

  it('prints "Photo: <credit>", and nothing for no credit', () => {
    expect(creditLine('AMCF, past festival')).toBe('Photo: AMCF, past festival')
    expect(creditLine(undefined)).toBeNull()
    expect(creditLine(' ')).toBeNull()
  })
})
