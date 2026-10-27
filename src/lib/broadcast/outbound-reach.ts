import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { PROVIDER_NAMES, type BookingProvider } from '@/lib/events/booking-links'

/**
 * THE ORGANISER'S OUTBOUND WEEK (window 6, 27 October 2026; the locked foundation's item 8, "visits and clicks out on
 * their claimed listing", and its listing rule 6: "Clicks counted per site, so the organiser reads 'EventLinqs sent 46
 * people to your tickets this week: 31 to Humanitix, 15 to Eventbrite'").
 *
 * Every number is a counted share_link_events row of kind 'outbound' (src/lib/broadcast/outbound.ts), one per visitor
 * per booking link per day, never for a crawler. "People" is DISTINCT VISITORS over the seven days, per site and in
 * all, so a person who pressed twice on two days is one person, and a person who went to two sites counts once in the
 * total and once at each site. A press with no visitor key is counted as its own person, which can only overstate by
 * that one row, and is said here rather than hidden.
 *
 * Callers pass the ownership gate (getOrganiserEvent) first: this reads with the service role, as fetchReachSummary does.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type OutboundRow = { provider: string | null; visitor_hash: string | null; occurred_at: string; id: string }
export type OutboundWeek = { people: number; bySite: { provider: string; people: number }[] }

/** Distinct visitors in the seven days to `now`, in all and per site, the busiest site first. */
export function outboundWeekOf(rows: readonly OutboundRow[], now: Date): OutboundWeek {
  const since = now.getTime() - WEEK_MS
  const all = new Set<string>()
  const bySite = new Map<string, Set<string>>()
  for (const r of rows) {
    const at = new Date(r.occurred_at).getTime()
    if (!(at > since && at <= now.getTime())) continue
    const who = r.visitor_hash ?? `row:${r.id}`
    const site = r.provider ?? 'other'
    all.add(who)
    if (!bySite.has(site)) bySite.set(site, new Set())
    bySite.get(site)?.add(who)
  }
  return {
    people: all.size,
    bySite: [...bySite.entries()].map(([provider, set]) => ({ provider, people: set.size })).sort((a, b) => b.people - a.people || a.provider.localeCompare(b.provider)),
  }
}

/** The organiser's sentence, from the counted week; null when nobody was sent. */
export function outboundSentence(week: OutboundWeek): string | null {
  if (week.people === 0) return null
  const named = (p: string) => PROVIDER_NAMES[p as BookingProvider] ?? 'their own site'
  const who = week.people === 1 ? '1 person' : `${week.people} people`
  if (week.bySite.length === 1) return `EventLinqs sent ${who} to your tickets on ${named(week.bySite[0].provider)} this week.`
  return `EventLinqs sent ${who} to your tickets this week: ${week.bySite.map((s) => `${s.people} to ${named(s.provider)}`).join(', ')}.`
}

/** The week's outbound presses for one event, read in full. */
export async function fetchOutboundWeek(eventId: string, now: Date): Promise<OutboundWeek> {
  const admin = createAdminClient()
  const links = await readEveryRow<{ id: string }>('the tracked links for this event', (from, to) =>
    admin.from('share_links').select('id').eq('event_id', eventId).order('id', { ascending: true }).range(from, to),
  )
  const rows: OutboundRow[] = []
  const since = new Date(now.getTime() - WEEK_MS).toISOString()
  for (const chunk of chunkInFilterValues(links.map((l) => l.id))) {
    rows.push(
      ...(await readEveryRow<OutboundRow>('the outbound presses on those links this week', (from, to) =>
        admin
          .from('share_link_events')
          .select('id, provider, visitor_hash, occurred_at')
          .in('link_id', chunk)
          .eq('kind', 'outbound')
          .gte('occurred_at', since)
          .order('id', { ascending: true })
          .range(from, to),
      )),
    )
  }
  return outboundWeekOf(rows, now)
}
