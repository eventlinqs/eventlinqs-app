import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'

/**
 * WHAT AN ORGANISER HAS DECIDED A BUYER WILL PAY, READ IN FULL OR NOT AT ALL.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS, and it is not the row ceiling.
 *
 * Four screens and four server actions each carried their own read of
 * `ticket_tiers`, and two of them also read the price ladder and the discount
 * codes. Every one of those reads discarded its error and stated no bound. On
 * most screens that produces a wrong number. On ONE of them it produces silent
 * data loss, and that is why this module is here rather than a `.limit()` at
 * each call site.
 *
 * THE DESTRUCTIVE ONE. `/dashboard/events/[id]/pricing` reads the ladder,
 * hands it to `pricing-client.tsx`, and that client seeds its editor from what
 * it was handed:
 *
 *     useState(tier.dynamic_pricing_rules.length > 0
 *       ? tier.dynamic_pricing_rules
 *       : [{ step_order: 1, capacity_threshold_percent: 100, price_cents: tier.price }])
 *
 * So a REFUSED read renders a one step ladder at the base price, which is
 * indistinguishable on screen from a tier that never had one. Save then calls
 * `save_dynamic_pricing`, which replaces the stored ladder with what it was
 * given. A dropped socket on the way in, one press of Save, and a five step
 * pricing decision the organiser made once is gone, with nothing anywhere
 * saying a read had failed.
 *
 * A read whose failure can be written back over the thing it failed to read has
 * to throw. That is the whole argument for this file.
 *
 * THE QUIETER ONES, each real and each measured against the code that renders
 * it:
 *
 *   pricing/page.tsx       `if (tiersError) notFound()`, four lines under a
 *                          comment explaining that readOrThrow exists so a
 *                          blink is never reported as a missing event. A
 *                          transient fault answered 404 on the organiser's own
 *                          event.
 *   discounts/page.tsx     a refused `discount_codes` read renders "no discount
 *                          codes" on an event that has them, and the organiser
 *                          creates a second code for a promotion that is
 *                          already running. The tier read beside it carried NO
 *                          order at all, and `tiers?.[0]?.currency` labels the
 *                          whole form, so which currency the organiser is
 *                          typing into was decided by whichever row Postgres
 *                          happened to return first.
 *   events/actions.ts      the publish gate summed a discarded read, so a
 *                          refusal became `tiers = []` and `checkSellable`
 *                          told an organiser with ten ticket types to "add at
 *                          least one ticket type before publishing".
 *   events/actions.ts      the slot ledger reads the tiers BEFORE and AFTER a
 *                          save and writes the difference as inventory history.
 *                          A refused `before` makes every tier look newly
 *                          opened; a refused `after` makes every tier look
 *                          closed. False history, written once, never noticed.
 *   stream/page.tsx        livestream tickets sold is a sum over the tiers, so
 *                          a refused read reports zero sold on a sold out room.
 *
 * ---------------------------------------------------------------------------
 * THE ROW CEILING, STATED HONESTLY RATHER THAN BORROWED. Supabase caps a
 * response at 1,000 rows in silence: HTTP 200, `error` null, a full looking
 * array (https://supabase.com/docs/reference/javascript/select, fetched
 * 2026-09-19). An event with more than a thousand ticket types is not a real
 * event, so the ceiling is NOT the live danger on these tables and this module
 * does not pretend it is. Paging is here because it costs one extra request and
 * removes the question, and because a bound stated in the source is a bound a
 * reviewer can argue with.
 *
 * WHY EVERY ORDER ENDS IN `id`. `sort_order`, `step_order` and `created_at` are
 * none of them unique. Ranged paging over a non total order is not paging:
 * Postgres may hand back one row in two windows and no window at all for
 * another. The tie break makes the order total, which is what makes the pager
 * correct rather than merely bounded.
 */

/** One row of an event's price ladder, as the pricing screen renders it. */
export interface LadderStep {
  id: string
  ticket_tier_id: string
  step_order: number
  capacity_threshold_percent: number
  price_cents: number
}

/** The tier shape the pricing screen needs, and the one the ladder attaches to. */
export interface PricingTierRow {
  id: string
  name: string
  price: number
  currency: string
  dynamic_pricing_enabled: boolean
  sold_count: number
  total_capacity: number
}

/** The tier shape the discount form needs: what a code can be aimed at. */
export interface DiscountTierRow {
  id: string
  name: string
  currency: string
}

/**
 * Every ticket tier on one event, in the order the organiser arranged them.
 *
 * The column list is the caller's, because five call sites want five different
 * projections of the same rows and a module that returned the widest of them
 * would ship a price list to a screen that only wanted a name. The ORDER and
 * the boundedness and the loudness are not the caller's, which is the point.
 */
export async function readEventTicketTiers<T>(
  client: SupabaseClient,
  eventId: string,
  columns: string,
  { activeOnly = false, pageSize }: { activeOnly?: boolean; pageSize?: number } = {},
): Promise<T[]> {
  /*
   * TWO COMPLETE CHAINS RATHER THAN ONE BUILT UP IN A VARIABLE, and that is not
   * a style preference. `scripts/guards/lib/supabase-select-chains.mjs` reads a
   * PostgREST builder as a CHAIN, and a chain broken by an assignment ends at
   * the break: written as `const q = client.from(...).select(...); const scoped
   * = activeOnly ? q.eq(...) : q; return scoped.order(...).range(...)`, this
   * module reported its own read as UNBOUNDED to the census and to every guard
   * that judges boundedness. A module whose whole subject is bounded reads must
   * be legible to the scanner that enforces them.
   */
  return readEveryRow<T>(
    'the event ticket tiers',
    (from, to) =>
      (activeOnly
        ? client
            .from('ticket_tiers')
            .select(columns)
            .eq('event_id', eventId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        : client
            .from('ticket_tiers')
            .select(columns)
            .eq('event_id', eventId)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)) as unknown as PromiseLike<{
        data: T[] | null
        error: { message: string } | null
      }>,
    pageSize ? { pageSize } : {},
  )
}

/**
 * The price ladders for a set of tiers, flat, oldest step first within a tier.
 *
 * CHUNKED, because an `in` list is bounded by BYTES rather than by how many
 * things are in it (src/lib/supabase/in-chunks.ts). An event with enough ticket
 * types to overflow that budget is unlikely; a call site that grows to pass
 * every tier on an organisation is not, and the chunking costs nothing today.
 */
export async function readDynamicPricingLadders(
  client: SupabaseClient,
  tierIds: string[],
  { pageSize }: { pageSize?: number } = {},
): Promise<LadderStep[]> {
  if (tierIds.length === 0) return []

  const steps: LadderStep[] = []
  for (const chunk of chunkInFilterValues(tierIds)) {
    const rows = await readEveryRow<LadderStep>(
      'the dynamic pricing ladder',
      (from, to) =>
        client
          .from('dynamic_pricing_rules')
          .select('id, ticket_tier_id, step_order, capacity_threshold_percent, price_cents')
          .in('ticket_tier_id', chunk)
          .order('step_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: LadderStep[] | null
          error: { message: string } | null
        }>,
      pageSize ? { pageSize } : {},
    )
    steps.push(...rows)
  }
  return steps
}

/**
 * Attach each tier's ladder to it, in step order, with the threshold coerced to
 * a number.
 *
 * `capacity_threshold_percent` is `numeric` in Postgres, which PostgREST sends
 * as a JSON number but supabase-js types as `number` only because the generated
 * type says so; the call site has always coerced it and that coercion belongs
 * with the read rather than in a page.
 */
export function attachLadders<T extends { id: string }>(
  tiers: T[],
  steps: LadderStep[],
): (T & { dynamic_pricing_rules: Omit<LadderStep, 'ticket_tier_id'>[] })[] {
  const byTier = new Map<string, Omit<LadderStep, 'ticket_tier_id'>[]>()
  for (const step of steps) {
    const list = byTier.get(step.ticket_tier_id) ?? []
    list.push({
      id: step.id,
      step_order: step.step_order,
      capacity_threshold_percent: Number(step.capacity_threshold_percent),
      price_cents: step.price_cents,
    })
    byTier.set(step.ticket_tier_id, list)
  }
  return tiers.map(tier => ({ ...tier, dynamic_pricing_rules: byTier.get(tier.id) ?? [] }))
}

/**
 * Every discount code on one event, newest first, with the id as the tie break
 * because `created_at` is not unique and two codes made in the same second are
 * ordinary.
 */
export async function readEventDiscountCodes<T>(
  client: SupabaseClient,
  eventId: string,
  { pageSize }: { pageSize?: number } = {},
): Promise<T[]> {
  return readEveryRow<T>(
    'the event discount codes',
    (from, to) =>
      client
        .from('discount_codes')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    pageSize ? { pageSize } : {},
  )
}

/**
 * The currency an organiser is typing a discount amount into.
 *
 * It used to be `tiers?.[0]?.currency ?? 'AUD'` on an unordered read, so it was
 * whichever row came back first and it silently became AUD whenever the read
 * failed. The read is ordered now, so "the first tier" is a stable answer, and
 * this states the fallback in one place where it can be read rather than buried
 * in a prop.
 */
export function discountFormCurrency(tiers: Pick<DiscountTierRow, 'currency'>[]): string {
  return tiers[0]?.currency ?? 'AUD'
}
