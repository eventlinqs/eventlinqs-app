import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

import { publishScheduledEvents } from '@/lib/events/publish-scheduled'

/**
 * Scheduling an event has always been offered by the wizard and nothing ever
 * published anything. These tests hold the missing half, and they hold the
 * two ways it could be got wrong: publishing something the gate would refuse,
 * and publishing something whose time has not come.
 */

const NOW = new Date('2026-08-10T09:00:00Z')

type Row = Record<string, unknown>

/**
 * Stub client. Records every filter applied so the selection can be proven,
 * and records the update payload so the transition can be proven.
 */
function stub(options: {
  due?: Row[]
  org?: Row | null
  updateError?: string
}) {
  const calls: { table: string; filters: Record<string, unknown>; update?: Row }[] = []
  return {
    calls,
    client: {
      from(table: string) {
        const filters: Record<string, unknown> = {}
        const call: { table: string; filters: Record<string, unknown>; update?: Row } = {
          table,
          filters,
        }
        calls.push(call)
        const builder: Record<string, unknown> = {}
        const chain = (name: string) =>
          ((...args: unknown[]) => {
            filters[`${name}:${String(args[0])}`] = args.length > 1 ? args[1] : true
            return builder
          }) as unknown
        for (const m of ['select', 'eq', 'not', 'lte', 'gte', 'order', 'limit', 'is']) {
          builder[m] = chain(m)
        }
        builder.update = ((payload: Row) => {
          call.update = payload
          return builder
        }) as unknown
        builder.maybeSingle = (() =>
          Promise.resolve({ data: options.org ?? null, error: null })) as unknown
        builder.then = ((resolve: (v: unknown) => void) => {
          if (table === 'events' && call.update) {
            return resolve({
              error: options.updateError ? { message: options.updateError } : null,
            })
          }
          if (table === 'events') return resolve({ data: options.due ?? [], error: null })
          return resolve({ data: null, error: null })
        }) as unknown
        return builder
      },
    } as never,
  }
}

function dueEvent(over: Row = {}): Row {
  return {
    id: 'evt-1',
    slug: 'scheduled-night',
    title: 'Scheduled Night',
    organisation_id: 'org-1',
    cover_image_url: 'https://cdn.example.com/real-cover.jpg',
    scheduled_publish_at: '2026-08-10T08:55:00Z',
    /*
     * A future end and a real venue. The publish gate gained both rules on
     * 29 August: an event that has already ENDED cannot go on sale, and an
     * in-person event with no venue cannot be attended. A fixture missing them
     * is refused, correctly, which is what these lines stop from masking the
     * thing each test is actually about.
     */
    end_date: new Date(Date.now() + 30 * 864e5).toISOString(),
    event_type: 'in_person',
    venue_name: 'The Wool Exchange',
    venue_address: '44 Moorabool St, Geelong',
    ticket_tiers: [{ price: 0 }],
    ...over,
  }
}

describe('the events selected', () => {
  it('takes only scheduled events whose time has arrived', async () => {
    const { client, calls } = stub({ due: [] })
    await publishScheduledEvents(client, NOW)
    const query = calls.find((c) => c.table === 'events')
    expect(query?.filters['eq:status']).toBe('scheduled')
    expect(query?.filters['lte:scheduled_publish_at']).toBe(NOW.toISOString())
    expect(query?.filters['not:scheduled_publish_at']).toBe('is')
  })

  it('reports nothing to do without touching anything', async () => {
    const { client } = stub({ due: [] })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary).toMatchObject({ considered: 0, published: 0, blocked: 0, errored: 0 })
  })
})

describe('a free event whose time has come', () => {
  it('goes live, with published_at stamped', async () => {
    const { client, calls } = stub({ due: [dueEvent()] })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.published).toBe(1)
    expect(summary.outcomes[0]).toMatchObject({ slug: 'scheduled-night', result: 'published' })

    const update = calls.find((c) => c.update)
    expect(update?.update).toMatchObject({
      status: 'published',
      published_at: NOW.toISOString(),
    })
  })

  it('only updates a row that is still scheduled, so a concurrent run cannot double publish', async () => {
    const { client, calls } = stub({ due: [dueEvent()] })
    await publishScheduledEvents(client, NOW)
    const update = calls.find((c) => c.update)
    expect(update?.filters['eq:id']).toBe('evt-1')
    expect(update?.filters['eq:status']).toBe('scheduled')
  })
})

describe('the gate is re-run at publish time, not trusted from scheduling time', () => {
  it('refuses a paid event whose organisation can no longer take payment', async () => {
    const { client, calls } = stub({
      due: [dueEvent({ ticket_tiers: [{ price: 2500 }] })],
      // Five columns, because the publish gate now runs the sale gate's own
      // predicate and verifies field PRESENCE first. Three columns made this an
      // incomplete row rather than an unsellable organiser.
      org: { stripe_account_id: 'acct_x', stripe_charges_enabled: false, stripe_payouts_enabled: false, stripe_account_country: 'AU', payout_status: 'active' },
    })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.published).toBe(0)
    expect(summary.blocked).toBe(1)
    expect(summary.outcomes[0]).toMatchObject({
      result: 'blocked',
      reason: 'paid_event_charges_disabled',
    })
    // Nothing was written: it stays scheduled rather than being dropped.
    expect(calls.find((c) => c.update)).toBeUndefined()
  })

  it('refuses a paid event whose payouts became restricted after scheduling', async () => {
    const { client } = stub({
      due: [dueEvent({ ticket_tiers: [{ price: 2500 }] })],
      org: { stripe_account_id: 'acct_x', stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU', payout_status: 'restricted' },
    })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.outcomes[0]).toMatchObject({
      result: 'blocked',
      reason: 'organisation_payouts_restricted',
    })
  })

  it('refuses an event whose cover was removed after scheduling', async () => {
    const { client } = stub({ due: [dueEvent({ cover_image_url: null })] })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.outcomes[0]).toMatchObject({
      result: 'blocked',
      reason: 'cover_image_required',
    })
  })

  it('publishes a paid event when the organisation is still in good standing', async () => {
    const { client } = stub({
      due: [dueEvent({ ticket_tiers: [{ price: 2500 }] })],
      org: { stripe_account_id: 'acct_x', stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU', payout_status: 'active' },
    })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.published).toBe(1)
  })
})

describe('failure is reported, never swallowed', () => {
  it('counts a failed write as an error rather than a publish', async () => {
    const { client } = stub({ due: [dueEvent()], updateError: 'row locked' })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.published).toBe(0)
    expect(summary.errored).toBe(1)
    expect(summary.outcomes[0]).toMatchObject({ result: 'error', reason: 'row locked' })
  })

  it('one blocked event never stops the ones behind it', async () => {
    const { client } = stub({
      due: [dueEvent({ id: 'a', slug: 'a', cover_image_url: null }), dueEvent({ id: 'b', slug: 'b' })],
    })
    const summary = await publishScheduledEvents(client, NOW)
    expect(summary.considered).toBe(2)
    expect(summary.blocked).toBe(1)
    expect(summary.published).toBe(1)
  })
})
