import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { NO_SHARES, type MySharesSummary, type ShareResultForEvent } from './my-shares-sentence'

/**
 * WHAT YOUR OWN LINKS PRODUCED.
 *
 * Close-out AQ2: "The sharer sees what their link produced." The share-link
 * route has carried the intention since the Broadcast Layer shipped, in a
 * comment: "a signed-in sharer's links are their own rows so a future 'your
 * shares' view can credit them." This is that view's data.
 *
 * WHY A PERSON SHOULD SEE IT AT ALL, since it is not a feature anybody asked
 * for. AQ2's whole argument is that referral is the only acquisition channel
 * whose cash cost is zero, and a channel nobody can see themselves working is a
 * channel nobody works twice. One number, shown to the person who earned it.
 *
 * IT CREDITS ONLY WHAT IT CAN PROVE. Links are matched on `created_by`, so a
 * share made while signed out belongs to nobody and is not counted here. That
 * understates rather than overstates, which is the correct direction for a
 * number shown to the person it flatters.
 *
 * NOTHING HERE IS A MONEY FIGURE. It reports people, not revenue: a sharer is
 * not owed anything for a referral on this platform and a dollar number beside
 * their name would imply they were.
 */

export { mySharesSentence, type MySharesSummary, type ShareResultForEvent } from './my-shares-sentence'

const EMPTY = NO_SHARES

export async function fetchMyShares(userId: string | null): Promise<MySharesSummary> {
  if (!userId) return EMPTY
  const admin = createAdminClient()

  const links = await readEveryRow('share_links (mine)', (from, to) =>
    admin
      .from('share_links')
      .select('id, event_id')
      .eq('created_by', userId)
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (links.length === 0) return EMPTY

  const eventByLink = new Map(links.map(l => [l.id, l.event_id]))
  const linkIds = links.map(l => l.id)

  const events = await readEveryRow('events (shared by me)', (from, to) =>
    admin
      .from('events')
      .select('id, title, slug')
      .in('id', [...new Set(links.map(l => l.event_id).filter((v): v is string => Boolean(v)))])
      .order('id', { ascending: true })
      .range(from, to),
  )
  const eventById = new Map(events.map(e => [e.id, e]))

  /*
   * Paged, because one enthusiastic sharer on one busy event produces a click
   * row per tap. The thousand-row ceiling would silently cut the newest ones,
   * which is the half a person is looking for when they open this.
   */
  const rows: { link_id: string; kind: string; order_id: string | null }[] = []
  for (let i = 0; i < linkIds.length; i += 100) {
    const chunk = linkIds.slice(i, i + 100)
    const page = await readEveryRow('share_link_events (mine)', (from, to) =>
      admin
        .from('share_link_events')
        .select('link_id, kind, order_id')
        .in('link_id', chunk)
        .order('id', { ascending: true })
        .range(from, to),
    )
    rows.push(...page)
  }

  const byEvent = new Map<string, { clicks: number; orders: Set<string> }>()
  for (const row of rows) {
    const eventId = eventByLink.get(row.link_id)
    if (!eventId) continue
    const bucket = byEvent.get(eventId) ?? { clicks: 0, orders: new Set<string>() }
    if (row.kind === 'click') bucket.clicks += 1
    // One order counted once however many of this person's links it touched.
    if (row.kind === 'conversion' && row.order_id) bucket.orders.add(row.order_id)
    byEvent.set(eventId, bucket)
  }

  const out: ShareResultForEvent[] = []
  for (const [eventId, bucket] of byEvent) {
    const event = eventById.get(eventId)
    if (!event) continue
    if (bucket.clicks === 0 && bucket.orders.size === 0) continue
    out.push({
      eventId,
      eventTitle: event.title,
      eventSlug: event.slug,
      clicks: bucket.clicks,
      joined: bucket.orders.size,
    })
  }
  out.sort((a, b) => b.joined - a.joined || b.clicks - a.clicks || a.eventTitle.localeCompare(b.eventTitle))

  return {
    totalClicks: out.reduce((n, e) => n + e.clicks, 0),
    totalJoined: out.reduce((n, e) => n + e.joined, 0),
    byEvent: out,
  }
}
