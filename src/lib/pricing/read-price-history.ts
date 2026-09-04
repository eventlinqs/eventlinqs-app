/**
 * THE ONE READER OF ticket_price_history.
 *
 * The public event page reads with the anon client; the table grants SELECT to
 * anon and the policy is `USING (true)`, because the page is public and it has
 * already decided which tiers a visitor may see (summarisePriceHistory keeps
 * hidden and access-code tiers out).
 *
 * A read failure is LOGGED and yields an empty history, never a thrown error:
 * a price history that cannot be fetched must not take the ticket panel down
 * with it. It is not swallowed either (scripts/guards/no-silent-catch.mjs): the
 * error is named, with its code, so a missing table on a database that is
 * behind its code reads as exactly that in the server log.
 *
 * The client is the generated SupabaseClient<Database>. A narrower structural
 * type was tried first and the page's call site hit TS2589 (excessively deep
 * instantiation) checking the real client against it, the same trap
 * src/lib/events/revalidate-event.ts records. Tests hand in a stub cast to it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PriceHistoryRow } from './price-history'

export const PRICE_HISTORY_SELECT =
  'id, ticket_tier_id, tier_name, price_cents, previous_price_cents, reason, percent_sold, currency, recorded_at'

export type PriceHistoryClient = SupabaseClient<Database>

export async function readPriceHistory(client: PriceHistoryClient, eventId: string): Promise<PriceHistoryRow[]> {
  const { data, error } = await client
    .from('ticket_price_history')
    .select(PRICE_HISTORY_SELECT)
    .eq('event_id', eventId)
    .order('recorded_at', { ascending: true })
  if (error) {
    console.error('[price-history] read failed, showing no history for this event', {
      eventId,
      code: error.code,
      message: error.message,
    })
    return []
  }
  return (data ?? []) as PriceHistoryRow[]
}
