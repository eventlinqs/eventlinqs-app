import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import {
  judgeCaptureConversion,
  conversionRate,
  type ConversionComparison,
  type ConversionRate,
  type ConversionSample,
} from './capture-conversion-math'
import {
  placementPeriodsFrom,
  placementInForceAt,
  type CapturePlacement,
  type PlacementPeriod,
} from './capture-placement-math'
import { readPlacementHistory, type PlacementDecision } from './capture-placement'

type Admin = SupabaseClient<Database>

/**
 * THE MEASUREMENT AQ1 ASKS FOR, TAKEN FROM THE ROWS THE PLATFORM ALREADY HAS.
 *
 * No new counter, no analytics round trip and no sampling: public.reservations
 * records when a buyer reached the payment step and whether they came out the
 * other side, which is the whole of the question. Anything that had to be
 * instrumented separately would also have to be trusted separately.
 *
 * TWO COMPARISONS, BOTH NAMED, because they answer different questions and
 * conflating them is how a decision gets made from the wrong number.
 *
 *   theQuestionArriving   before the question existed, against the periods it
 *                         was asked at checkout. This is AQ1's "before and
 *                         after", and it is the one that triggers the reversal.
 *   theMove               the checkout periods against the ticket page periods.
 *                         Empty until the reversal has actually been taken, and
 *                         it says so rather than reporting a zero.
 *
 * A reservation is attributed to the placement in force WHEN IT WAS CREATED,
 * never the placement in force now, because the question a buyer saw is the one
 * that was on screen at the time.
 */

export interface CaptureConversionReport {
  currentPlacement: CapturePlacement | null
  periods: PlacementPeriod[]
  decisions: PlacementDecision[]
  /** Reservations created before any placement decision took effect. */
  beforeTheQuestion: ConversionRate
  underCheckout: ConversionRate
  underTicketPage: ConversionRate
  theQuestionArriving: ConversionComparison
  theMove: ConversionComparison
  /** Not settled yet, so in neither half. Reported so the totals reconcile. */
  inFlight: number
}

interface ReservationRow {
  created_at: string
  status: Database['public']['Enums']['reservation_status']
}

/**
 * A reservation whose outcome is known. `active` is still in flight; the other
 * three are terminal, and a cancelled reservation is as much a non-sale as an
 * expired one.
 */
const SETTLED_STATUSES: ReservationRow['status'][] = ['converted', 'expired', 'cancelled']

export async function readCaptureConversion(admin: Admin): Promise<CaptureConversionReport> {
  const decisions = await readPlacementHistory(admin)
  const periods = placementPeriodsFrom(decisions)

  const reservations = await readEveryRow('reservations', (from, to) =>
    admin.from('reservations').select('created_at, status').order('created_at', { ascending: true }).range(from, to),
  )

  return buildCaptureConversionReport(decisions, periods, reservations as ReservationRow[])
}

/**
 * The report from rows already in hand. Separated from the read so the whole
 * attribution can be tested against fixed rows rather than against whatever a
 * shared TEST database happens to hold this week.
 */
export function buildCaptureConversionReport(
  decisions: PlacementDecision[],
  periods: PlacementPeriod[],
  reservations: ReservationRow[],
): CaptureConversionReport {
  const buckets = new Map<string, ConversionSample>([
    ['none', { settled: 0, converted: 0 }],
    ['checkout', { settled: 0, converted: 0 }],
    ['ticket_page', { settled: 0, converted: 0 }],
  ])
  let inFlight = 0

  for (const row of reservations) {
    if (!SETTLED_STATUSES.includes(row.status)) {
      inFlight += 1
      continue
    }
    const placement = placementInForceAt(periods, row.created_at)
    const bucket = buckets.get(placement ?? 'none')
    if (!bucket) continue
    bucket.settled += 1
    if (row.status === 'converted') bucket.converted += 1
  }

  const beforeSample = buckets.get('none') as ConversionSample
  const checkoutSample = buckets.get('checkout') as ConversionSample
  const ticketPageSample = buckets.get('ticket_page') as ConversionSample

  const open = periods[periods.length - 1]
  return {
    currentPlacement: open && open.until === null ? open.placement : null,
    periods,
    decisions,
    beforeTheQuestion: conversionRate(beforeSample),
    underCheckout: conversionRate(checkoutSample),
    underTicketPage: conversionRate(ticketPageSample),
    theQuestionArriving: judgeCaptureConversion(beforeSample, checkoutSample),
    theMove: judgeCaptureConversion(checkoutSample, ticketPageSample),
    inFlight,
  }
}
