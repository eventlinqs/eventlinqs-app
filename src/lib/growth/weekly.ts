import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { channelForVisit } from './traffic-channel'
import { getAllCities } from '@/lib/cities/data'
import { bestOfWeek, figuresFor, lastWeeks, refundedOf, stateScorecard, type DemandRow, type Rows, type Week, type WeekFigures, type Best, type StateScorecard } from './weekly-math'

/**
 * READING THE ROWS BEHIND THE GROWTH PAGE. Every read here is a READ; the
 * arithmetic is ./weekly-math.ts, pure and tested without a database.
 *
 * WHAT IS READ, and why each source is the one: the event page visits and the
 * calendar adds, shares and follows are the ledger's own demand rows
 * (ledger_entries, kind 'demand'), the rows the Free traffic screen already reads
 * (./organic-reach.ts); the listings are events; saves are saved_events; new
 * subscribers are email_subscribers confirmed in the week; orders and refunds are
 * read as the GMV screen reads them (src/lib/admin/analytics.ts), in AUD.
 *
 * HOW FAR BACK. The two weeks shown, and the 90 days before them, so a visitor
 * seen in those 90 days counts as returning. Orders are read whole, because "sold
 * before" means ever. Every ranged read carries a stable order
 * (scripts/guards/no-silent-row-ceiling.mjs).
 */

const DAY_MS = 86_400_000
const LOOKBACK_DAYS = 90
const VICTORIA: ReadonlySet<string> = new Set(getAllCities().filter((c) => c.state === 'VIC').map((c) => c.slug))

/**
 * Every instant as one ISO form. The arithmetic compares instants as text, and the database answers '+00:00' with
 * microseconds while the week bounds end in Z, so two forms of one moment would compare wrongly.
 */
const iso = (at: string): string => new Date(at).toISOString()
const isoOrNull = (at: string | null): string | null => (at === null ? null : iso(at))

/** A page view's occurrence key is `<event id>:<visitor>:<day>` (src/app/api/ledger/demand/route.ts). */
function keyParts(occurrenceKey: string): { eventId: string; visitor: string } | null {
  const parts = occurrenceKey.split(':')
  return parts.length >= 3 && parts[0] !== '' && parts[1] !== '' ? { eventId: parts[0], visitor: parts[1] } : null
}

/** An embedded category, which the generated types give as a list and the API may answer as one row. */
type CategoryEmbed = { name: string | null } | { name: string | null }[] | null
const categoryName = (c: CategoryEmbed): string | null => (Array.isArray(c) ? (c[0]?.name ?? null) : (c?.name ?? null))

export interface GrowthWeek {
  readonly last: Week
  readonly before: Week
  readonly lastFigures: WeekFigures
  readonly beforeFigures: WeekFigures
  readonly best: { readonly city: Best | null; readonly category: Best | null; readonly channel: Best | null }
  /** Victoria, the first state (the plan, Expansion), read from the cities whose state is VIC. */
  readonly victoria: StateScorecard
  /** Page view rows whose key could not be read as event, visitor and day: shown when not zero. */
  readonly unreadVisitRows: number
}

export async function readGrowthWeek(now: Date = new Date()): Promise<GrowthWeek> {
  const { last, before } = lastWeeks(now)
  const { rows, unreadVisitRows } = await readGrowthRows(before.from, last.to)
  return { last, before, lastFigures: figuresFor(rows, last), beforeFigures: figuresFor(rows, before), best: bestOfWeek(rows, last), victoria: stateScorecard(rows, last, before, VICTORIA), unreadVisitRows }
}

/**
 * The rows behind any run of whole weeks from `spanFrom` to `spanTo`: the visits from 90 days before `spanFrom` (so a visitor seen
 * then counts as returning), the demand, saves, subscribers and refunds inside the span, every listing, and every order
 * before `spanTo`. The growth page reads its two weeks through it, and the social report (./social-report.ts) its campaign
 * weeks, so both count from the same rows.
 */
export async function readGrowthRows(spanFrom: string, spanTo: string): Promise<{ readonly rows: Rows; readonly unreadVisitRows: number }> {
  const admin = createAdminClient()
  const since = new Date(new Date(spanFrom).getTime() - LOOKBACK_DAYS * DAY_MS).toISOString()

  const [visitRows, demandRows, listingRows, saveRows, subscriberRows, orderRows, refundRows] = await Promise.all([
    readEveryRow<{ occurrence_key: string; occurred_at: string; referrer: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }>(
      'the event page visits for the growth page',
      (from, to) =>
        admin
          .from('ledger_entries')
          .select('occurrence_key, occurred_at, referrer, utm_source, utm_medium, utm_campaign')
          .eq('kind', 'demand')
          .eq('demand_action', 'page_view')
          .gte('occurred_at', since)
          .lt('occurred_at', spanTo)
          .order('id', { ascending: true })
          .range(from, to),
    ),
    readEveryRow<{ demand_action: string; occurred_at: string }>('the calendar adds, shares and follows for the growth page', (from, to) =>
      admin
        .from('ledger_entries')
        .select('demand_action, occurred_at')
        .eq('kind', 'demand')
        .in('demand_action', ['calendar_add', 'share', 'follow'])
        .gte('occurred_at', spanFrom)
        .lt('occurred_at', spanTo)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readEveryRow<{ id: string; city_primary: string | null; status: string; published_at: string | null; start_date: string; is_seed_data: boolean | null; is_recurring: boolean | null; listing_series_id: string | null; organisation_id: string | null; event_categories: CategoryEmbed }>(
      'the listings for the growth page',
      (from, to) =>
        admin
          .from('events')
          .select('id, city_primary, status, published_at, start_date, is_seed_data, is_recurring, listing_series_id, organisation_id, event_categories(name)')
          .order('id', { ascending: true })
          .range(from, to),
    ),
    readEveryRow<{ created_at: string }>('the saves for the growth page', (from, to) =>
      admin.from('saved_events').select('created_at').gte('created_at', spanFrom).lt('created_at', spanTo).order('id', { ascending: true }).range(from, to),
    ),
    readEveryRow<{ confirmed_at: string | null }>('the new subscribers for the growth page', (from, to) =>
      admin.from('email_subscribers').select('confirmed_at').gte('confirmed_at', spanFrom).lt('confirmed_at', spanTo).order('id', { ascending: true }).range(from, to),
    ),
    readEveryRow<{ total_cents: number; platform_fee_cents: number; status: string; created_at: string; organisation_id: string; event_id: string | null; platform_fee_retained_cents: number | null; stripe_processing_estimate_cents: number | null; refunds: { amount_cents: number; status: string }[] | null }>('the orders for the growth page', (from, to) =>
      admin
        .from('orders')
        .select('total_cents, platform_fee_cents, status, created_at, organisation_id, event_id, platform_fee_retained_cents, stripe_processing_estimate_cents, refunds(amount_cents, status)')
        .eq('currency', 'AUD')
        .lt('created_at', spanTo)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readEveryRow<{ amount_cents: number; status: string; created_at: string }>('the refunds for the growth page', (from, to) =>
      admin
        .from('refunds')
        .select('amount_cents, status, created_at')
        .eq('currency', 'AUD')
        .gte('created_at', spanFrom)
        .lt('created_at', spanTo)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  let unreadVisitRows = 0
  const visits: Rows['visits'][number][] = []
  for (const r of visitRows) {
    const k = keyParts(r.occurrence_key)
    if (k === null) {
      unreadVisitRows += 1
      continue
    }
    visits.push({ visitor: k.visitor, eventId: k.eventId, at: iso(r.occurred_at), channel: channelForVisit({ referrer: r.referrer, utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign }) })
  }

  const rows: Rows = {
    listings: listingRows.map((l) => ({
      id: l.id,
      city: l.city_primary,
      category: categoryName(l.event_categories),
      status: l.status,
      publishedAt: isoOrNull(l.published_at),
      startDate: iso(l.start_date),
      isSeed: l.is_seed_data === true,
      recurring: l.is_recurring === true || l.listing_series_id !== null,
      organisationId: l.organisation_id,
    })),
    visits,
    demand: demandRows.map((d) => ({ action: d.demand_action as DemandRow['action'], at: iso(d.occurred_at) })),
    saves: saveRows.map((s) => ({ at: iso(s.created_at) })),
    subscribers: subscriberRows.map((s) => ({ confirmedAt: isoOrNull(s.confirmed_at) })),
    orders: orderRows.map((o) => ({ totalCents: Number(o.total_cents ?? 0), platformFeeCents: Number(o.platform_fee_cents ?? 0), status: o.status, createdAt: iso(o.created_at),
      organisationId: o.organisation_id,
      eventId: o.event_id,
      retainedCents: o.platform_fee_retained_cents === null ? null : Number(o.platform_fee_retained_cents),
      processingCents: o.stripe_processing_estimate_cents === null ? null : Number(o.stripe_processing_estimate_cents),
      refundedCents: refundedOf(o.refunds),
    })),
    refunds: refundRows.map((r) => ({ amountCents: Number(r.amount_cents ?? 0), status: r.status, at: iso(r.created_at) })),
  }

  return { rows, unreadVisitRows }
}
