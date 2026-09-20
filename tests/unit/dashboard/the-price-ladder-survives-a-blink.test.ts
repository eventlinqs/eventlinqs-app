import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readRepoFile } from '../../helpers/read-repo-file'
import {
  attachLadders,
  discountFormCurrency,
  readDynamicPricingLadders,
  readEventDiscountCodes,
  readEventTicketTiers,
} from '@/lib/organisers/event-tier-config'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE ORGANISER'S PRICING CONFIGURATION, READ IN FULL OR NOT AT ALL.
 *
 * The defect these exist for is DATA LOSS rather than a wrong number. The
 * dynamic pricing screen hands its editor the ladder it read, the editor
 * substitutes one synthetic step at the base price when that list is empty, and
 * Save replaces the stored ladder with what the editor is holding. So a read
 * that failed and returned `[]` became, one press of Save later, a deleted
 * pricing decision.
 *
 * Every read here is therefore tested against a FAKE SERVER rather than a fake
 * reader, because the failure being prevented is a property of the server: it
 * can answer 200 with rows left out, and it can refuse. A mock that returns
 * what it was asked for cannot reproduce either.
 */

type Recorded = { table: string; calls: string[]; args: unknown[][] }

/**
 * A PostgREST builder that records the chain it was handed and answers from a
 * table with a ceiling, exactly as the real server does: at most `ceiling` rows
 * per response, HTTP 200, `error` null, and nothing anywhere saying rows were
 * left out.
 */
function fakeClient(rows: Record<string, unknown>[], { ceiling = 1000, fail = '' } = {}) {
  const recorded: Recorded[] = []
  const client = {
    from(table: string) {
      const record: Recorded = { table, calls: [], args: [] }
      recorded.push(record)
      let from = 0
      let to = rows.length
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'order']) {
        builder[method] = (...args: unknown[]) => {
          record.calls.push(method)
          record.args.push(args)
          return builder
        }
      }
      builder.range = (a: number, b: number) => {
        record.calls.push('range')
        record.args.push([a, b])
        from = a
        to = b
        if (fail) return Promise.resolve({ data: null, error: { message: fail } })
        const width = Math.min(to - from + 1, ceiling)
        return Promise.resolve({ data: rows.slice(from, from + width), error: null })
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, recorded }
}

const tierRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `tier-${String(i).padStart(4, '0')}`, name: `Tier ${i}` }))

describe('readEventTicketTiers', () => {
  it('returns every tier when the server ceiling is below the page size', async () => {
    const { client } = fakeClient(tierRows(2500), { ceiling: 500 })
    const tiers = await readEventTicketTiers<{ id: string }>(client, 'event-1', 'id, name')
    expect(tiers).toHaveLength(2500)
    expect(new Set(tiers.map(t => t.id)).size).toBe(2500)
  })

  /*
   * THE TIE BREAK IS THE POINT. `sort_order` is not unique, and ranged paging
   * over a non total order can hand back one row in two windows and no window
   * at all for another, so a ladder comes back with a step repeated and a step
   * missing. Ordering on `id` as well makes the order total.
   */
  it('orders on sort_order and then on id, so the paging order is total', async () => {
    const { client, recorded } = fakeClient(tierRows(3))
    await readEventTicketTiers(client, 'event-1', 'id, name')
    expect(recorded[0].table).toBe('ticket_tiers')
    const orders = recorded[0].args.filter((_, i) => recorded[0].calls[i] === 'order').map(a => a[0])
    expect(orders).toEqual(['sort_order', 'id'])
  })

  it('filters to active tiers only when asked, and not otherwise', async () => {
    const withActive = fakeClient(tierRows(1))
    await readEventTicketTiers(withActive.client, 'event-1', 'id', { activeOnly: true })
    const activeFilters = withActive.recorded[0].args.filter(
      (_, i) => withActive.recorded[0].calls[i] === 'eq',
    )
    expect(activeFilters).toContainEqual(['is_active', true])

    const withoutActive = fakeClient(tierRows(1))
    await readEventTicketTiers(withoutActive.client, 'event-1', 'id')
    const allFilters = withoutActive.recorded[0].args.filter(
      (_, i) => withoutActive.recorded[0].calls[i] === 'eq',
    )
    expect(allFilters).toEqual([['event_id', 'event-1']])
  })

  /*
   * THE ONE THAT MATTERS MOST. A partial answer that looks whole is the defect;
   * a throw is the fix. Returning what it managed to collect would be exactly
   * the empty ladder the editor writes back.
   */
  it('throws rather than returning a short list when the read is refused', async () => {
    const { client } = fakeClient(tierRows(10), { fail: 'connection reset' })
    await expect(readEventTicketTiers(client, 'event-1', 'id')).rejects.toThrow(
      /the event ticket tiers could not be read in full: connection reset/,
    )
  })
})

describe('readDynamicPricingLadders', () => {
  it('asks the server nothing when there are no tiers', async () => {
    const { client, recorded } = fakeClient([])
    expect(await readDynamicPricingLadders(client, [])).toEqual([])
    expect(recorded).toHaveLength(0)
  })

  it('orders on step_order and then on id', async () => {
    const { client, recorded } = fakeClient([{ id: 'r1', ticket_tier_id: 't1', step_order: 1 }])
    await readDynamicPricingLadders(client, ['t1'])
    expect(recorded[0].table).toBe('dynamic_pricing_rules')
    const orders = recorded[0].args.filter((_, i) => recorded[0].calls[i] === 'order').map(a => a[0])
    expect(orders).toEqual(['step_order', 'id'])
  })

  /*
   * An `in` list is bounded by BYTES rather than by how many things are in it,
   * so a long one is split. The chunker's own budget is tested where it lives;
   * what is tested here is that this reader uses it at all, because a single
   * enormous `in` is refused by the server with a 414 that reads like an outage.
   */
  it('splits a long tier list into several in filters', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const { client, recorded } = fakeClient([])
    await readDynamicPricingLadders(client, ids)
    expect(recorded.length).toBeGreaterThan(1)
    const everyIdAsked = recorded.flatMap(r =>
      r.args.filter((_, i) => r.calls[i] === 'in').flatMap(a => a[1] as string[]),
    )
    expect(new Set(everyIdAsked).size).toBe(5000)
  })

  it('throws rather than returning a short ladder when the read is refused', async () => {
    const { client } = fakeClient([], { fail: 'statement timeout' })
    await expect(readDynamicPricingLadders(client, ['t1'])).rejects.toThrow(
      /the dynamic pricing ladder could not be read in full: statement timeout/,
    )
  })
})

describe('readEventDiscountCodes', () => {
  it('orders newest first with the id as the tie break', async () => {
    const { client, recorded } = fakeClient([{ id: 'c1' }])
    await readEventDiscountCodes(client, 'event-1')
    expect(recorded[0].table).toBe('discount_codes')
    const orderArgs = recorded[0].args.filter((_, i) => recorded[0].calls[i] === 'order')
    expect(orderArgs).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('throws rather than reporting an event with codes as having none', async () => {
    const { client } = fakeClient([], { fail: 'pool exhausted' })
    await expect(readEventDiscountCodes(client, 'event-1')).rejects.toThrow(
      /the event discount codes could not be read in full: pool exhausted/,
    )
  })
})

describe('attachLadders', () => {
  it('gives each tier its own steps and an empty list to a tier with none', () => {
    const attached = attachLadders(
      [{ id: 't1' }, { id: 't2' }],
      [
        { id: 'r1', ticket_tier_id: 't1', step_order: 1, capacity_threshold_percent: 50, price_cents: 1000 },
        { id: 'r2', ticket_tier_id: 't1', step_order: 2, capacity_threshold_percent: 100, price_cents: 1500 },
      ],
    )
    expect(attached[0].dynamic_pricing_rules).toHaveLength(2)
    expect(attached[1].dynamic_pricing_rules).toEqual([])
  })

  it('coerces the numeric threshold, which PostgREST can send as a string', () => {
    const attached = attachLadders(
      [{ id: 't1' }],
      [
        {
          id: 'r1',
          ticket_tier_id: 't1',
          step_order: 1,
          capacity_threshold_percent: '75.00' as unknown as number,
          price_cents: 1000,
        },
      ],
    )
    expect(attached[0].dynamic_pricing_rules[0].capacity_threshold_percent).toBe(75)
  })
})

describe('discountFormCurrency', () => {
  it('takes the first tier currency', () => {
    expect(discountFormCurrency([{ currency: 'NZD' }, { currency: 'AUD' }])).toBe('NZD')
  })

  it('falls back to AUD only when there is genuinely no tier', () => {
    expect(discountFormCurrency([])).toBe('AUD')
  })
})

/**
 * THE THREE PLACES WHERE A CATCH DECIDES BEHAVIOUR.
 *
 * These read the tree, because what they pin is a decision made in a `catch`
 * that no unit test can reach from outside: the modules are a Next server
 * action file and a page, and neither exports the helper. What must never be
 * lost is that a FAILED read is answered with nothing rather than with an empty
 * list, because in both places an empty list is a statement about the
 * organiser's business that is not true.
 *
 * Read through readRepoFile so the assertion is about the text and never about
 * whether this checkout wrote CRLF.
 */
describe('a failed read is answered with nothing, never with an empty list', () => {
  const actions = readRepoFile(
    resolve(process.cwd(), 'src/app/(dashboard)/dashboard/events/actions.ts'),
  )

  it('writes no inventory history at all when the tiers could not be read', () => {
    // The ledger DIFFERENCES the two lists, so a short `before` makes every
    // ticket type look newly opened and a short `after` makes every one look
    // closed. Either way false history is written once and never noticed.
    expect(actions).toContain('if (slotEvent && opened) {')
    expect(actions).toContain('if (slotEvent && tiersBefore && tiersAfter) {')
    expect(actions).toMatch(/tiersForLedger[\s\S]*?return null/)
  })

  it('refuses to publish with a sentence the organiser can act on', () => {
    // `tiers = []` reached checkSellable and produced "add at least one ticket
    // type before publishing" for an organiser holding ten of them, which is
    // unanswerable: the thing it asks for is already there.
    expect(actions).toContain('Your ticket types could not be read just now')
    expect(actions).not.toMatch(/const \{ data \} = await supabase\s*\n\s*\.from\('ticket_tiers'\)/)
  })

  it('still carries the synthetic step the pricing editor falls back to', () => {
    // If this fallback ever goes away the reads above may relax. While it is
    // there, an empty ladder on screen is one press of Save from being the
    // stored ladder, and every read feeding it must throw.
    const client = readRepoFile(
      resolve(process.cwd(), 'src/app/(dashboard)/dashboard/events/[id]/pricing/pricing-client.tsx'),
    )
    expect(client).toContain('tier.dynamic_pricing_rules.length > 0')
    expect(client).toContain('capacity_threshold_percent: 100, price_cents: tier.price')
  })
})
