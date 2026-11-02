import { describe, expect, it } from 'vitest'
import { planSeriesTickets, seriesTierInputs, type SeriesNight } from '@/lib/events/series-tickets'

/*
 * EVERY NIGHT OF A SERIES TICKETED IN ONE STEP (V3 item 6): the same ticket types onto every other upcoming night, never
 * over a night's own, never onto a night that has ended, is sold elsewhere or is a free walk-in night.
 */
const NOW = new Date('2026-11-01T00:00:00Z')
const night = (id: string, start: string, over: Partial<SeriesNight> = {}): SeriesNight => ({
  id,
  start_date: start,
  end_date: null,
  entry_mode: 'tickets',
  external_ticket_url: null,
  tierCount: 0,
  ...over,
})

describe('planSeriesTickets', () => {
  it('tickets every other upcoming night with none of its own, and says why each other night is left', () => {
    const plan = planSeriesTickets({
      templateId: 'a',
      now: NOW,
      nights: [
        night('a', '2026-11-06T09:00:00Z', { tierCount: 2 }),
        night('b', '2026-11-13T09:00:00Z'),
        night('c', '2026-11-20T09:00:00Z'),
        night('d', '2026-10-30T09:00:00Z'),
        night('e', '2026-11-27T09:00:00Z', { tierCount: 1 }),
        night('f', '2026-12-04T09:00:00Z', { external_ticket_url: 'https://elsewhere.example/t/1' }),
        night('g', '2026-12-11T09:00:00Z', { entry_mode: 'walk_in' }),
      ],
    })
    expect(plan.ticket).toEqual(['b', 'c'])
    expect(plan.skipped).toEqual([
      { id: 'a', reason: 'the night you are copying from' },
      { id: 'd', reason: 'has ended' },
      { id: 'e', reason: 'already has tickets' },
      { id: 'f', reason: 'sold on another site' },
      { id: 'g', reason: 'free walk-in night' },
    ])
  })

  it('a night still running (ends after now) is ticketed; one whose end has passed is not', () => {
    const plan = planSeriesTickets({
      templateId: 'a',
      now: NOW,
      nights: [night('a', '2026-11-06T09:00:00Z'), night('b', '2026-10-31T20:00:00Z', { end_date: '2026-11-01T02:00:00Z' }), night('c', '2026-10-31T09:00:00Z', { end_date: '2026-10-31T12:00:00Z' })],
    })
    expect(plan.ticket).toEqual(['b'])
  })
})

describe('seriesTierInputs', () => {
  const general = {
    name: 'General',
    description: null,
    tier_type: 'general_admission',
    access_mode: 'in_person' as const,
    price: 2500,
    currency: 'AUD',
    total_capacity: 120,
    sale_start: '2026-10-20T00:00:00.000Z',
    sale_end: '2026-11-06T08:00:00.000Z',
    min_per_order: 1,
    max_per_order: 10,
    sort_order: 0,
    is_active: true,
  }

  it('carries the active types in dollars, with the sale window moved by the week between the nights', () => {
    const inputs = seriesTierInputs([general, { ...general, name: 'Old', is_active: false }], '2026-11-06T09:00:00Z', '2026-11-13T09:00:00Z')
    expect(inputs).toEqual([
      {
        name: 'General',
        description: '',
        tier_type: 'general_admission',
        access_mode: 'in_person',
        price: 25,
        currency: 'AUD',
        total_capacity: 120,
        sale_start: '2026-10-27T00:00:00.000Z',
        sale_end: '2026-11-13T08:00:00.000Z',
        min_per_order: 1,
        max_per_order: 10,
        sort_order: 0,
      },
    ])
  })

  it('leaves an open sale window open', () => {
    const [only] = seriesTierInputs([{ ...general, sale_start: null, sale_end: null }], '2026-11-06T09:00:00Z', '2026-11-13T09:00:00Z')
    expect([only.sale_start, only.sale_end]).toEqual([null, null])
  })
})
