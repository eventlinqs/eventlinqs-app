import { describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'

/**
 * A NIGHT SOLD ON ANOTHER SITE, IN THE LAUNCH KIT (window 3, 28 October 2026).
 *
 * WI3 lists nights whose tickets are sold elsewhere (external_ticket_url, no ticket types of ours). The kit priced them
 * from our ticket types alone, so a paid Humanitix night read "Free entry" on its card and in every caption; its card
 * said "Ticketing by EVENTLINQS" and "Scan to buy"; and a music caption promised "Presale now, on the door if any are
 * left". The organiser card route, the public Launch Kit route and a claimed listing's kit all read this context.
 */

const h = vi.hoisted(() => ({ event: null as Record<string, unknown> | null }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: h.event, error: null }),
      }
      return q
    },
  }),
}))

import { broadcastPriceLabel } from '@/lib/broadcast/price-line'
import { digestPriceLabel } from '@/lib/broadcast/digest'
import { loadArtefactContext, toCaptionInput, toCardInput } from '@/lib/broadcast/kit-artefacts'
import { buildCaptions } from '@/lib/broadcast/captions'
import { buildCardElement } from '@/lib/broadcast/social-cards'

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (isValidElement(node)) {
    if (typeof node.type === 'function') return textOf((node.type as (p: unknown) => ReactNode)(node.props))
    return textOf((node.props as { children?: ReactNode }).children)
  }
  return ''
}

const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function night(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: 'bp-kit-sold-elsewhere-night',
    title: 'Late Show at the Barwon',
    start_date: '2026-11-07T09:30:00.000Z',
    timezone: 'Australia/Melbourne',
    cover_image_url: null,
    venue_name: 'The Barwon Club',
    venue_city: 'Geelong',
    summary: null,
    organisation_id: null,
    listing_source: 'curated',
    category: { name: 'Music', slug: 'music' },
    ticket_tiers: [],
    organisation: null,
    external_ticket_url: null,
    ...extra,
  }
}

async function contextOf(extra: Record<string, unknown>) {
  h.event = night(extra)
  const context = await loadArtefactContext('event-1', 'https://www.eventlinqs.com.au', null, 'The Barwon Club', false)
  if (!context) throw new Error('no context')
  return context
}

describe('the price line every broadcast shares', () => {
  it('names the site a night is sold on, or the page\'s own words, never "Free entry"', () => {
    expect(broadcastPriceLabel([], 'https://events.humanitix.com/late-show')).toBe('Tickets on Humanitix')
    expect(broadcastPriceLabel(null, 'https://www.barwonclub.com.au/gigs/late-show')).toBe('Tickets are sold elsewhere')
  })

  it('prices our own nights as before', () => {
    expect(broadcastPriceLabel([], null)).toBe('Free entry')
    expect(broadcastPriceLabel([{ price: 0, currency: 'AUD' }], '  ')).toBe('Free entry')
  })

  it('the digest and the kit say the same thing about one night', () => {
    for (const url of ['https://events.humanitix.com/late-show', 'https://www.barwonclub.com.au/gigs/late-show', null]) {
      expect(digestPriceLabel([], url)).toBe(broadcastPriceLabel([], url))
    }
  })
})

describe('the Launch Kit for a night sold on another site', () => {
  it('prices it where it sells and marks it not ticketed here', async () => {
    const context = await contextOf({ external_ticket_url: 'https://events.humanitix.com/late-show' })
    expect(context.priceLabel).toBe('Tickets on Humanitix')
    expect(context.listing).toBe(true)
    expect(toCardInput(context, 'instagram').listing).toBe(true)
  })

  it('its card says listed and details, never ticketing or buy, and never free', async () => {
    const context = await contextOf({ external_ticket_url: 'https://events.humanitix.com/late-show' })
    for (const format of ['story', 'square', 'feed'] as const) {
      const text = textOf(await buildCardElement(format, { ...toCardInput(context, 'instagram'), qr: QR }))
      expect(text).toContain('Listed on EVENTLINQS')
      expect(text).toContain('Scan for details')
      expect(text).not.toContain('Scan to buy')
      expect(text).not.toContain('Ticketing by')
      expect(text).not.toContain('Free entry')
    }
  })

  it('no caption calls it free or promises a presale or a door', async () => {
    const context = await contextOf({ external_ticket_url: 'https://events.humanitix.com/late-show' })
    for (const caption of buildCaptions(toCaptionInput(context))) {
      const words = JSON.stringify(caption)
      expect(words).not.toContain('Free entry')
      expect(words).not.toContain('Presale now')
    }
  })

  it('an organiser\'s own ticketed night is unchanged', async () => {
    const context = await contextOf({ listing_source: null, ticket_tiers: [{ price: 25, currency: 'AUD' }] })
    expect(context.priceLabel).not.toMatch(/Tickets on|sold elsewhere|Free/)
    expect(context.listing).toBe(false)
    expect('listing' in toCardInput(context, 'instagram')).toBe(false)
    const text = textOf(await buildCardElement('feed', { ...toCardInput(context, 'instagram'), qr: QR }))
    expect(text).toContain('Scan to buy')
    expect(text).toContain('Ticketing by EVENTLINQS')
  })
})
