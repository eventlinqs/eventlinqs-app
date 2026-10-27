import { describe, it, expect } from 'vitest'
import { whatsappEdition, whatsappShareUrl } from '@/lib/broadcast/whatsapp-edition'
import type { DigestEvent } from '@/lib/broadcast/digest'

/*
 * The weekly roundup's WhatsApp edition (src/lib/broadcast/whatsapp-edition.ts): the email's own listings, in its
 * order and with its links, as plain text for the channel, and nothing at all for a week with no listings.
 */

const events: DigestEvent[] = [
  { id: 'a', slug: 'jazz-at-the-pier', title: 'Jazz at the Pier', dateLabel: 'Fri 30 Oct, 8:00 pm', venueLabel: 'The Pier, Geelong', priceLabel: 'From $25', url: 'https://eventlinqs.test/s/abc' },
  { id: 'b', slug: 'open-mic', title: 'Open mic night', dateLabel: 'Sat 31 Oct, 7:00 pm', venueLabel: 'Barwon Club', priceLabel: 'Free entry', url: 'https://eventlinqs.test/e/open-mic' },
]

describe('the WhatsApp edition', () => {
  it('lists each listing in the email order, a fact a line, with its own link, and ends with the city page', () => {
    expect(whatsappEdition({ cityName: 'Geelong', events, cityUrl: 'https://eventlinqs.test/city/geelong' })).toBe(
      [
        "What's on in Geelong this week",
        '',
        '1. Jazz at the Pier',
        'Fri 30 Oct, 8:00 pm, The Pier, Geelong. From $25.',
        'https://eventlinqs.test/s/abc',
        '',
        '2. Open mic night',
        'Sat 31 Oct, 7:00 pm, Barwon Club. Free entry.',
        'https://eventlinqs.test/e/open-mic',
        '',
        'Everything on in Geelong: https://eventlinqs.test/city/geelong',
      ].join('\n'),
    )
  })

  it('drafts nothing for a week with no listings, so nothing empty is ever approved', () => {
    expect(whatsappEdition({ cityName: 'Bendigo', events: [], cityUrl: 'https://eventlinqs.test/city/bendigo' })).toBe('')
  })

  it('carries the edition in the share link as its text, encoded whole', () => {
    expect(whatsappShareUrl('a & b\nc')).toBe('https://wa.me/?text=a%20%26%20b%0Ac')
  })
})
