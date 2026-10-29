import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidElement, type ReactNode } from 'react'

/**
 * THE FIVE EVENT STATES ON EVERY SURFACE, RELEASE BLOCKING (the release checklist of 28 October 2026, section E, E1 to
 * E8; C:\dev\START-16OCT\EVENTLINQS-RELEASE-CHECKLIST-28OCT.md). Run by the registered guard cta-five-states.
 *
 *   E1 free, no registration   "View event details", "Free entry" only when free is checked
 *   E2 free, registration      "Register", says registration is required
 *   E3 paid, EventLinqs        "Get tickets", ticketing through EventLinqs
 *   E4 paid, outside           "View tickets at <provider>", never EventLinqs ticketing
 *   E5 price unknown           "View event details", no price at all
 *   E6 never free because no price is stored; E7 never EventLinqs ticketing for an outside event.
 *
 * Surfaces: the Launch Kit's card and captions, the social planner's card (/admin/social), the event page's ticket
 * panel and hero, and the share link (/e/<code> draws the event page itself).
 */

const h = vi.hoisted(() => ({
  event: null as Record<string, unknown> | null,
  links: [] as unknown[],
}))

function fakeDb() {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gt', 'lte']) q[m] = () => q
      q.maybeSingle = async () => ({ data: table === 'events' ? h.event : null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => {
        const tiers = ((h.event?.ticket_tiers as { is_active?: boolean }[] | undefined) ?? []).filter((t) => t.is_active !== false)
        return resolve({ data: table === 'ticket_tiers' ? tiers.map((_, i) => ({ id: `t${i}` })) : [], error: null })
      }
      return q
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb() }))
vi.mock('@/lib/events/booking-links-read', () => ({ readBookingLinks: async () => h.links }))

import { ctaFor } from '@/lib/events/cta'
import { loadArtefactContext, toCaptionInput, toCardInput } from '@/lib/broadcast/kit-artefacts'
import { buildCaptions } from '@/lib/broadcast/captions'
import { buildCardElement } from '@/lib/broadcast/social-cards'
import { contextFor } from '@/lib/social/store'
import { heroSaleWords, ticketPanelOf } from '@/lib/listings/ticket-panel'
import type { BookingLink } from '@/lib/events/booking-links'

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
const NOW = new Date('2026-10-28T03:00:00Z')
const HUMANITIX = 'https://events.humanitix.com/bp-five-states'

const link = (over: Partial<BookingLink>): BookingLink => ({
  id: 'l1', provider: 'humanitix', url: HUMANITIX, kind: 'tickets', availability: 'on_sale', priceFromCents: null,
  priceCheckedAt: null, isPrimary: true, setBy: 'curated', pointedToByOrganiser: false, position: 0, createdAt: '2026-10-27T00:00:00Z', ...over,
})

type State = {
  id: string
  event: Record<string, unknown>
  links: BookingLink[]
  /** Words every card, caption and hero of this state must carry, and words none may. */
  must: string[]
  never: string[]
  hero: { cta: string; price: string | null }
}

const base = {
  slug: 'bp-five-states-night', title: 'Bp Five States Night', start_date: '2026-11-07T09:30:00.000Z', timezone: 'Australia/Melbourne',
  cover_image_url: null, venue_name: 'The Barwon Club', venue_city: 'Geelong', summary: null, organisation_id: null,
  category: { name: 'Music', slug: 'music' }, organisation: null,
}

const STATES: State[] = [
  {
    id: 'E1 free, no registration',
    event: { ...base, listing_source: 'curated', entry_mode: 'walk_in', is_free: true, ticket_tiers: [], external_ticket_url: null },
    links: [],
    must: ['Free entry'],
    never: ['Ticketing by', 'Scan to buy', '$', 'Presale'],
    hero: { cta: 'View event details', price: 'Free entry' },
  },
  {
    id: 'E2 free, registration required',
    event: { ...base, listing_source: null, entry_mode: 'tickets', is_free: true, ticket_tiers: [{ price: 0, currency: 'AUD', is_active: true }], external_ticket_url: null },
    links: [],
    must: ['registration required'],
    never: ['Free entry', 'Scan to buy', '$', 'Presale'],
    hero: { cta: 'Register', price: 'Free, registration required' },
  },
  {
    id: 'E3 paid, EventLinqs ticketing',
    event: { ...base, listing_source: null, entry_mode: 'tickets', is_free: false, ticket_tiers: [{ price: 2500, currency: 'AUD', is_active: true }], external_ticket_url: null },
    links: [],
    must: ['$'],
    never: ['Free', 'Listed on'],
    hero: { cta: 'Get tickets', price: 'From $25' },
  },
  {
    id: 'E4 paid, outside ticketing',
    event: { ...base, listing_source: 'curated', entry_mode: 'tickets', is_free: false, ticket_tiers: [], external_ticket_url: HUMANITIX },
    links: [link({})],
    must: ['Humanitix'],
    never: ['Free', 'Ticketing by', 'Scan to buy', 'Presale'],
    hero: { cta: 'View tickets at Humanitix', price: null },
  },
  {
    id: 'E5 price unknown',
    event: { ...base, listing_source: 'curated', entry_mode: 'tickets', is_free: false, ticket_tiers: [], external_ticket_url: null },
    links: [],
    must: [],
    never: ['Free', '$', 'Ticketing by', 'Scan to buy', 'Presale'],
    hero: { cta: 'View event details', price: null },
  },
]

function holds(words: string, s: State, surface: string) {
  for (const m of s.must) expect(words, `${s.id}, ${surface}, must say "${m}"`).toContain(m)
  for (const n of s.never) expect(words, `${s.id}, ${surface}, must never say "${n}"`).not.toContain(n)
}

describe('the five event states on every surface (release blocking)', () => {
  for (const s of STATES) {
    describe(s.id, () => {
      it('the Launch Kit card and every caption', async () => {
        h.event = s.event
        h.links = s.links
        const context = await loadArtefactContext('event-1', 'https://www.eventlinqs.com.au', null, 'The Barwon Club', false)
        expect(context).not.toBeNull()
        const card = textOf(await buildCardElement('feed', { ...toCardInput(context!, 'instagram'), qr: QR }))
        holds(card, s, 'Launch Kit card')
        const captions = buildCaptions(toCaptionInput(context!)).map((c) => c.text).join('\n')
        holds(captions, s, 'Launch Kit captions')
      })

      it('the social planner card (/admin/social)', async () => {
        h.event = s.event
        h.links = s.links
        const context = await contextFor(fakeDb() as never, 'event-1', NOW)
        expect(context).not.toBeNull()
        const card = textOf(await buildCardElement('feed', { ...toCardInput(context!, 'instagram'), listing: context!.listing, qr: QR }))
        holds(card, s, 'social card')
        holds(buildCaptions(toCaptionInput(context!)).map((c) => c.text).join('\n'), s, 'social captions')
      })

      it('the event page hero and ticket panel, which the share link draws too', () => {
        const ev = s.event as { entry_mode: string; ticket_tiers: { price: number }[]; is_free: boolean; external_ticket_url: string | null }
        const external = ev.external_ticket_url
        const panel = external ? ticketPanelOf(String(base.slug), s.links, NOW) : null
        const words = heroSaleWords({
          externalUrl: external,
          panel,
          isFree: ev.is_free,
          saleBlocked: false,
          isSoldOut: false,
          priceLabel: ev.ticket_tiers.some((t) => t.price > 0) ? 'From $25' : ev.ticket_tiers.length > 0 ? 'Free' : null,
          cta: ctaFor({ entryMode: ev.entry_mode, tiers: ev.ticket_tiers, isFree: ev.is_free, externalTicketUrl: external }),
        })
        expect(words.cta, `${s.id}, hero action`).toBe(s.hero.cta)
        expect(words.price, `${s.id}, hero price`).toBe(s.hero.price)
        if (panel?.button) expect(panel.button.label).toBe(s.hero.cta)
      })
    })
  }

  it('the share link (/e/<code>) is the event page itself, so it says what the page says', () => {
    const share = readFileSync(join(__dirname, '..', '..', '..', 'src', 'app', 'e', '[code]', 'page.tsx'), 'utf8')
    expect(share).toMatch(/import EventDetailPage/)
    const page = readFileSync(join(__dirname, '..', '..', '..', 'src', 'app', 'events', '[slug]', 'page.tsx'), 'utf8')
    expect(page).toContain('cta: ctaFor({')
  })

  it('E6 and E7 in the one function: free only when checked; outside never EventLinqs ticketing', () => {
    expect(ctaFor({ tiers: [], isFree: null }).state).toBe('unknown_price')
    expect(ctaFor({ tiers: [], isFree: false }).freeEntry).toBe(false)
    expect(ctaFor({ externalTicketUrl: HUMANITIX, providerName: 'Humanitix', tiers: [{ price: 2500 }] }).ticketingByEventLinqs).toBe(false)
  })
})
