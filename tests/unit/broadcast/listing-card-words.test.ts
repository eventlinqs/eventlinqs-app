import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { buildCardElement, type SocialCardInput } from '@/lib/broadcast/social-cards'
import type { SocialCardFormat } from '@/lib/broadcast/social-card-spec'

/**
 * A night EventLinqs listed from public information is not ticketed here, so
 * its card never says "Scan to buy" or "Ticketing by", and a library photo on
 * it says it is not the venue (Lawal's ruling of 27 October 2026, 08:33).
 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (isValidElement(node)) {
    // The card's parts are plain function components: draw them to read their words.
    if (typeof node.type === 'function') return textOf((node.type as (p: unknown) => ReactNode)(node.props))
    return textOf((node.props as { children?: ReactNode }).children)
  }
  return ''
}

const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function input(extra: Partial<SocialCardInput> = {}): SocialCardInput {
  return {
    title: 'Lounge Bar Live Music',
    dateLabel: 'Saturday 31 October',
    timeLabel: '4:00 pm',
    placeLabel: "Sailors' Rest, Geelong",
    priceLabel: 'Free entry',
    shortUrl: 'https://www.eventlinqs.com.au/free/geelong/this-week',
    eyebrow: 'Music · Geelong',
    organiserName: "Sailors' Rest",
    qr: QR,
    ...extra,
  }
}

const FORMATS: SocialCardFormat[] = ['story', 'square', 'feed']

describe("a listing night's card", () => {
  for (const format of FORMATS) {
    it(`${format}: says details and listed, never buy or ticketing`, async () => {
      const text = textOf(await buildCardElement(format, input({ listing: true, libraryPhoto: true })))
      expect(text).toContain('Scan for details')
      expect(text).toContain('Listed on EVENTLINQS')
      expect(text).toContain('Photo from the EventLinqs library. It is not this venue.')
      expect(text).not.toContain('Scan to buy')
      expect(text).not.toContain('Ticketing by')
    })

    it(`${format}: an organiser's own card is unchanged`, async () => {
      const text = textOf(await buildCardElement(format, input()))
      expect(text).toContain('Scan to buy')
      expect(text).toContain('Ticketing by EVENTLINQS')
      expect(text).not.toContain('It is not this venue')
    })

    /*
     * The project manager's ruling of 29 October 2026, 15:56: every place that draws an archival AMCF photograph carries
     * 'past festival' in its credit. A post's card draws the night's approved register photograph, so it prints that
     * row's own credit, as the campaign's slides and captions do.
     */
    it(`${format}: a photograph from the register is credited on the card, in the row's own words`, async () => {
      const text = textOf(await buildCardElement(format, input({ photoCredit: 'AMCF, past festival' })))
      expect(text).toContain('Photo: AMCF, past festival')
      expect(textOf(await buildCardElement(format, input()))).not.toContain('Photo:')
    })
  }
})
