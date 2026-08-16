import { describe, expect, it } from 'vitest'
import {
  eventIsPaid,
  isExternallyTicketed,
  isOrganiserSellable,
  ticketsOnSale,
} from '@/lib/payments/sale-status'
import {
  assertCanCreateDestinationCharge,
  ChargePreconditionError,
} from '@/lib/payments/application-fee'
import {
  MAX_DESTINATION_LENGTH,
  isOwnHost,
  validateExternalTicketUrl,
} from '@/lib/broadcast/external-destination'
import { buildDraftContext } from '@/lib/launch/draft-artefacts'
import type { KitDraftPayload } from '@/lib/launch/draft-store'

/**
 * EXTERNAL TICKETING: the five non-negotiables, pinned.
 *
 * Founder ruling 15 August 2026. Each describe block below is one of the five,
 * named, so a failure says which promise broke rather than which function did.
 */

const SELLABLE_ORG = {
  stripe_account_id: 'acct_123',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_account_country: 'AU',
  payout_status: 'active' as const,
}

const FEES = {
  subtotal_cents: 2000,
  platform_fee_cents: 169,
  payment_processing_fee_cents: 0,
  processing_fee_cents: 0,
  discount_cents: 0,
  tax_cents: 0,
  total_cents: 2169,
  currency: 'aud',
} as never

function draftPayload(over: Partial<KitDraftPayload> = {}): KitDraftPayload {
  return {
    externalTicketUrl: null,
    title: 'Basement 45',
    summary: 'A night.',
    description: 'A night.',
    startDate: '2026-09-20T21:00',
    endDate: '2026-09-21T01:00',
    venueName: 'The Barwon Club',
    venueSuburb: 'South Geelong',
    venueCity: 'Geelong',
    categoryName: 'Music',
    isFree: false,
    price: 25,
    capacity: null,
    billNames: [],
    visibility: 'public',
    visibilityReason: '',
    addressHeldBack: false,
    coverUrl: null,
    sourceText: '',
    unresolved: [],
    ...over,
  }
}

// ─── 1. The tracked link is ours and it redirects out ────────────────────────

describe('NON-NEGOTIABLE 1: the printed link is ours, never the external URL', () => {
  const EXTERNAL = 'https://tickets.melbournefringe.com.au/event/9931'

  it('prints an EventLinqs short link on every artefact channel', () => {
    const ctx = buildDraftContext({
      payload: draftPayload({ externalTicketUrl: EXTERNAL }),
      code: 'abcd1234efgh',
      origin: 'https://www.eventlinqs.com.au',
      organiserName: '',
      externalCodes: {
        fallback: 'basement-45-el',
        qr: 'basement-45-qr',
        instagram: 'basement-45-ig',
      },
    })

    expect(ctx.links.qr).toBe('https://www.eventlinqs.com.au/e/basement-45-qr')
    expect(ctx.links.instagram).toBe('https://www.eventlinqs.com.au/e/basement-45-ig')
    expect(ctx.links.fallback).toBe('https://www.eventlinqs.com.au/e/basement-45-el')
  })

  it('NEVER puts the external URL on an artefact', () => {
    const ctx = buildDraftContext({
      payload: draftPayload({ externalTicketUrl: EXTERNAL }),
      code: 'abcd1234efgh',
      origin: 'https://www.eventlinqs.com.au',
      organiserName: '',
      externalCodes: { fallback: 'basement-45-el', qr: 'basement-45-qr' },
    })
    const everyLink = JSON.stringify(ctx.links)
    expect(everyLink).not.toContain('melbournefringe')
    expect(everyLink).not.toContain(EXTERNAL)
  })

  it('falls back to the kit URL, never to the external URL, when a code is missing', () => {
    // A channel with no minted link must degrade to something real and OURS.
    const ctx = buildDraftContext({
      payload: draftPayload({ externalTicketUrl: EXTERNAL }),
      code: 'abcd1234efgh',
      origin: 'https://www.eventlinqs.com.au',
      organiserName: '',
      externalCodes: {},
    })
    expect(ctx.links.qr).toBe('https://www.eventlinqs.com.au/launch/k/abcd1234efgh')
    expect(JSON.stringify(ctx.links)).not.toContain('melbournefringe')
  })

  it('the PRINTED line on a poster is our canonical host, and dissolves the ticketBarText hazard', async () => {
    const { ticketBarText } = await import('@/lib/broadcast/social-card-layout')

    // Exactly what the poster draws: ticketBarText(priceLabel, links.qr,
    // printableHost()). The third argument is why this is safe.
    const printed = ticketBarText(
      'From $28',
      'https://eventlinqs-app-git-integration-launch.vercel.app/e/the-basement-tapes-qr',
      'www.eventlinqs.com.au',
    )

    expect(printed).toBe('From $28 · eventlinqs.com.au/e/the-basement-tapes-qr')

    /*
     * THE HAZARD, AND WHY IT IS GONE. ticketBarText SWAPS the host in the
     * printed line for the canonical one, so what a promoter reads on paper is
     * not literally the URL the QR encodes. For an INTERNAL event that was
     * always a canonicalisation of our own address, which is honest.
     *
     * The risk external ticketing raised was printing OUR host on a line whose
     * link belonged to somebody else. It does not arise, because the link the
     * poster carries genuinely IS ours: `/e/<code>` on the canonical host, which
     * we serve and which redirects. The host on the paper is the host that
     * answers. Nothing is swapped for something it is not.
     */
    expect(printed).not.toContain('melbournefringe')
    expect(printed.startsWith('From $28 · eventlinqs.com.au/e/')).toBe(true)
  })

  it('leaves an INTERNAL draft on the kit URL exactly as before', () => {
    const ctx = buildDraftContext({
      payload: draftPayload(),
      code: 'abcd1234efgh',
      origin: 'https://www.eventlinqs.com.au',
      organiserName: '',
    })
    expect(ctx.links.qr).toBe('https://www.eventlinqs.com.au/launch/k/abcd1234efgh')
  })
})

// ─── 2. Never claim a sale we cannot see ─────────────────────────────────────

describe('NON-NEGOTIABLE 2: no sold-ticket claim for an external event', () => {
  it('is covered against the real resolver in sales-attribution.test.ts', async () => {
    // The behaviour is asserted there, where the Supabase stub lives: an
    // external event returns externallyTicketed true, every bucket empty, and
    // reconciles true. Pinned here only so the one non-negotiable without a
    // block in this file is not mistaken for one nobody tested.
    const mod = await import('@/lib/broadcast/sales-attribution')
    expect(mod.SOLD_STATUSES).toEqual(['confirmed', 'partially_refunded', 'refunded'])
  })
})

// ─── 3. No fake inventory ────────────────────────────────────────────────────

describe('NON-NEGOTIABLE 3: an external event can never reach a checkout', () => {
  const EXTERNAL_EVENT = { external_ticket_url: 'https://tickets.example.org/x' }

  it('recognises an external event, and does not mistake blank for external', () => {
    expect(isExternallyTicketed(EXTERNAL_EVENT)).toBe(true)
    expect(isExternallyTicketed({ external_ticket_url: null })).toBe(false)
    expect(isExternallyTicketed({ external_ticket_url: '   ' })).toBe(false)
    expect(isExternallyTicketed(null)).toBe(false)
    expect(isExternallyTicketed(undefined)).toBe(false)
  })

  it('refuses a PAID external event even with a perfect organiser', () => {
    expect(isOrganiserSellable(SELLABLE_ORG)).toBe(true)
    expect(
      ticketsOnSale({ isPaidEvent: true, org: SELLABLE_ORG, event: EXTERNAL_EVENT }),
    ).toBe(false)
  })

  it('refuses a FREE external event, which the paid-only gate would have missed', () => {
    // The most likely external shape and the one an ordering mistake lets
    // through: a free event needs no Stripe, so every organiser check passes.
    expect(ticketsOnSale({ isPaidEvent: false, org: null, event: EXTERNAL_EVENT })).toBe(false)
  })

  it('refuses the CHARGE even if something bypassed the gate', () => {
    expect(() =>
      assertCanCreateDestinationCharge(SELLABLE_ORG, FEES, EXTERNAL_EVENT),
    ).toThrow(ChargePreconditionError)

    try {
      assertCanCreateDestinationCharge(SELLABLE_ORG, FEES, EXTERNAL_EVENT)
    } catch (err) {
      expect((err as ChargePreconditionError).reason).toBe('event_externally_ticketed')
    }
  })
})

// ─── 4 and 5. Internal behaviour is untouched ────────────────────────────────

describe('NON-NEGOTIABLE 5: nothing internal regresses', () => {
  it('a paid internal event with a good organiser still sells', () => {
    expect(ticketsOnSale({ isPaidEvent: true, org: SELLABLE_ORG })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: true, org: SELLABLE_ORG, event: null })).toBe(true)
    expect(
      ticketsOnSale({ isPaidEvent: true, org: SELLABLE_ORG, event: { external_ticket_url: null } }),
    ).toBe(true)
  })

  it('a free internal event still sells with no organiser at all', () => {
    expect(ticketsOnSale({ isPaidEvent: false, org: null })).toBe(true)
  })

  it('a paid internal event with an unready organiser is still blocked', () => {
    expect(
      ticketsOnSale({ isPaidEvent: true, org: { ...SELLABLE_ORG, payout_status: 'pending' } }),
    ).toBe(false)
  })

  it('an internal charge with no event argument still passes, as every existing caller does', () => {
    expect(() => assertCanCreateDestinationCharge(SELLABLE_ORG, FEES)).not.toThrow()
  })

  it('eventIsPaid is unchanged', () => {
    expect(eventIsPaid([{ price: 0 }, { price: 2500 }])).toBe(true)
    expect(eventIsPaid([{ price: 0 }])).toBe(false)
  })
})

// ─── The destination validator ───────────────────────────────────────────────

describe('the external URL validator', () => {
  it('accepts a real https ticketing URL and normalises it', () => {
    const r = validateExternalTicketUrl('https://tickets.example.org/event/9931?utm=poster')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe('https://tickets.example.org/event/9931?utm=poster')
  })

  it('refuses javascript: and data: payloads', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      // eslint-disable-next-line no-script-url
      'JavaScript:alert(1)',
    ]) {
      const r = validateExternalTicketUrl(bad)
      expect(r.ok, `${bad} was accepted`).toBe(false)
    }
  })

  it('refuses plain http, so a printed QR never downgrades the connection', () => {
    const r = validateExternalTicketUrl('http://tickets.example.org/x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not-https')
  })

  it('refuses OUR OWN host, which would be an open redirect', () => {
    for (const own of [
      'https://www.eventlinqs.com.au/anything',
      'https://eventlinqs.com.au/x',
      'https://eventlinqs.com/x',
      'https://preview.eventlinqs.com.au/x',
    ]) {
      const r = validateExternalTicketUrl(own)
      expect(r.ok, `${own} was accepted as a destination`).toBe(false)
      if (!r.ok) expect(r.reason).toBe('own-host')
    }
    expect(isOwnHost('www.eventlinqs.com.au')).toBe(true)
    expect(isOwnHost('tickets.example.org')).toBe(false)
  })

  it('refuses credentials in the URL', () => {
    const r = validateExternalTicketUrl('https://user:pass@tickets.example.org/x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('has-credentials')
  })

  it('refuses hosts that cannot be a real box office', () => {
    for (const bad of ['https://localhost/x', 'https://127.0.0.1/x', 'https://box.local/x']) {
      const r = validateExternalTicketUrl(bad)
      expect(r.ok, `${bad} was accepted`).toBe(false)
      if (!r.ok) expect(r.reason).toBe('not-public-host')
    }
  })

  it('refuses rubbish with a message a human can act on', () => {
    const r = validateExternalTicketUrl('where you buy tickets')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('unparseable')
      expect(r.message).toMatch(/https:\/\//)
    }
  })

  it('refuses an empty value and an over-long one', () => {
    expect(validateExternalTicketUrl('').ok).toBe(false)
    expect(validateExternalTicketUrl('   ').ok).toBe(false)
    const long = `https://tickets.example.org/${'a'.repeat(MAX_DESTINATION_LENGTH)}`
    const r = validateExternalTicketUrl(long)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too-long')
  })

  it('every rejection carries a message, never a bare code', () => {
    for (const bad of ['', 'http://x.org', 'javascript:1', 'https://localhost']) {
      const r = validateExternalTicketUrl(bad)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message.length).toBeGreaterThan(10)
    }
  })
})
