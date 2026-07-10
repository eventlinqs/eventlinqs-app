import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Broadcast Layer Stage 3 core: performer attribution (SPEC section 4).
 *
 * Artists are the existing public.artists entities (genre foundation),
 * extended with links, ownership (owner_user_id), and lineup status. This
 * module holds the reads shared by the artist profile page, the lineup
 * manager, and the two attribution dashboards. Attribution numbers come
 * exclusively from share_link_events rows on artist-tagged links: measured,
 * never estimated, and the order id is only ever read.
 */

export interface ArtistRow {
  id: string
  slug: string
  name: string
  bio: string | null
  image_url: string | null
  links: Record<string, string>
  owner_user_id: string | null
}

export interface ArtistShow {
  eventId: string
  slug: string
  title: string
  startDate: string
  timezone: string | null
  venueLabel: string
  status: 'confirmed' | 'invited'
}

export interface ArtistShowAttribution {
  eventId: string
  eventTitle: string
  eventSlug: string
  startDate: string
  clicks: number
  conversions: number
  tickets: number
}

type Admin = ReturnType<typeof createAdminClient>

function normaliseLinks(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) out[k] = v
  }
  return out
}

const ARTIST_COLUMNS = 'id, slug, name, bio, image_url, links, owner_user_id'

function toArtistRow(data: Record<string, unknown>): ArtistRow {
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    bio: (data.bio as string | null) ?? null,
    image_url: (data.image_url as string | null) ?? null,
    links: normaliseLinks(data.links),
    owner_user_id: (data.owner_user_id as string | null) ?? null,
  }
}

export async function fetchArtistBySlug(admin: Admin, slug: string): Promise<ArtistRow | null> {
  if (!/^[a-z0-9-]{1,200}$/i.test(slug)) return null
  const { data } = await admin.from('artists').select(ARTIST_COLUMNS).eq('slug', slug).maybeSingle()
  return data ? toArtistRow(data as Record<string, unknown>) : null
}

export async function fetchArtistById(admin: Admin, id: string): Promise<ArtistRow | null> {
  const { data } = await admin.from('artists').select(ARTIST_COLUMNS).eq('id', id).maybeSingle()
  return data ? toArtistRow(data as Record<string, unknown>) : null
}

/** The artist profile a signed-in user has claimed, if any. */
export async function fetchArtistForOwner(admin: Admin, userId: string): Promise<ArtistRow | null> {
  const { data } = await admin
    .from('artists')
    .select(ARTIST_COLUMNS)
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle()
  return data ? toArtistRow(data as Record<string, unknown>) : null
}

/** Upcoming published shows for an artist (confirmed tags only, public data). */
export async function fetchArtistUpcomingShows(
  admin: Admin,
  artistId: string,
  limit = 12,
): Promise<ArtistShow[]> {
  const { data } = await admin
    .from('event_artists')
    .select(
      'status, event:events(id, slug, title, start_date, timezone, venue_name, venue_city, status, visibility)',
    )
    .eq('artist_id', artistId)
    .eq('status', 'confirmed')

  type Row = {
    status: string
    event: {
      id: string
      slug: string
      title: string
      start_date: string
      timezone: string | null
      venue_name: string | null
      venue_city: string | null
      status: string
      visibility: string | null
    } | null
  }
  const nowIso = new Date().toISOString()
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.event)
    .filter(
      (e): e is NonNullable<Row['event']> =>
        !!e && e.status === 'published' && e.visibility !== 'private' && e.start_date >= nowIso,
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, limit)
    .map((e) => ({
      eventId: e.id,
      slug: e.slug,
      title: e.title,
      startDate: e.start_date,
      timezone: e.timezone,
      venueLabel: [e.venue_name, e.venue_city].filter(Boolean).join(', '),
      status: 'confirmed' as const,
    }))
}

/** The event's lineup for the organiser manager (both statuses, billing order). */
export async function fetchEventLineup(
  admin: Admin,
  eventId: string,
): Promise<{ artist: ArtistRow; status: 'confirmed' | 'invited'; inviteToken: string | null; billingOrder: number }[]> {
  const { data } = await admin
    .from('event_artists')
    .select('status, invite_token, billing_order, artist:artists(id, slug, name, bio, image_url, links, owner_user_id)')
    .eq('event_id', eventId)
    .order('billing_order', { ascending: true })

  type Row = {
    status: 'confirmed' | 'invited'
    invite_token: string | null
    billing_order: number
    artist: Record<string, unknown> | null
  }
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !!r.artist)
    .map((r) => ({
      artist: toArtistRow(r.artist as Record<string, unknown>),
      status: r.status,
      inviteToken: r.invite_token,
      billingOrder: r.billing_order,
    }))
}

/**
 * Per-show attribution for one artist across every show they are tagged on:
 * the portable proof of draw. Counts clicks, conversions, and tickets from
 * that artist's tracked links only.
 */
export async function fetchArtistAttribution(
  admin: Admin,
  artistId: string,
): Promise<{ shows: ArtistShowAttribution[]; totals: { clicks: number; conversions: number; tickets: number } }> {
  const { data: links } = await admin
    .from('share_links')
    .select('id, event_id')
    .eq('artist_id', artistId)
  const linkRows = (links ?? []) as { id: string; event_id: string }[]
  const totals = { clicks: 0, conversions: 0, tickets: 0 }
  if (linkRows.length === 0) return { shows: [], totals }

  const eventByLink = new Map(linkRows.map((l) => [l.id, l.event_id]))

  const { data: events } = await admin
    .from('share_link_events')
    .select('link_id, kind, order_id')
    .in('link_id', linkRows.map((l) => l.id))
  const rows = (events ?? []) as { link_id: string; kind: string; order_id: string | null }[]

  const byEvent = new Map<string, { clicks: number; conversions: number; orderIds: string[] }>()
  for (const row of rows) {
    const eventId = eventByLink.get(row.link_id)
    if (!eventId) continue
    let entry = byEvent.get(eventId)
    if (!entry) {
      entry = { clicks: 0, conversions: 0, orderIds: [] }
      byEvent.set(eventId, entry)
    }
    if (row.kind === 'click') entry.clicks += 1
    else if (row.kind === 'conversion') {
      entry.conversions += 1
      if (row.order_id) entry.orderIds.push(row.order_id)
    }
  }

  const allOrderIds = [...byEvent.values()].flatMap((e) => e.orderIds)
  const ticketCountByOrder = new Map<string, number>()
  if (allOrderIds.length > 0) {
    const { data: tickets } = await admin
      .from('tickets')
      .select('order_id')
      .in('order_id', allOrderIds)
    for (const t of (tickets ?? []) as { order_id: string }[]) {
      ticketCountByOrder.set(t.order_id, (ticketCountByOrder.get(t.order_id) ?? 0) + 1)
    }
  }

  const eventIds = [...byEvent.keys()]
  const { data: eventMeta } = await admin
    .from('events')
    .select('id, title, slug, start_date')
    .in('id', eventIds)
  const metaById = new Map(
    ((eventMeta ?? []) as { id: string; title: string; slug: string; start_date: string }[]).map(
      (e) => [e.id, e],
    ),
  )

  const shows: ArtistShowAttribution[] = []
  for (const [eventId, entry] of byEvent) {
    const meta = metaById.get(eventId)
    if (!meta) continue
    const tickets = entry.orderIds.reduce((sum, id) => sum + (ticketCountByOrder.get(id) ?? 0), 0)
    shows.push({
      eventId,
      eventTitle: meta.title,
      eventSlug: meta.slug,
      startDate: meta.start_date,
      clicks: entry.clicks,
      conversions: entry.conversions,
      tickets,
    })
    totals.clicks += entry.clicks
    totals.conversions += entry.conversions
    totals.tickets += tickets
  }
  shows.sort((a, b) => b.startDate.localeCompare(a.startDate))
  return { shows, totals }
}

/** Per-artist attribution rows for ONE event: the organiser side of 4.4. */
export async function fetchEventArtistAttribution(
  admin: Admin,
  eventId: string,
): Promise<{ artistId: string; artistName: string; clicks: number; conversions: number; tickets: number }[]> {
  const { data: links } = await admin
    .from('share_links')
    .select('id, artist_id')
    .eq('event_id', eventId)
    .not('artist_id', 'is', null)
  const linkRows = (links ?? []) as { id: string; artist_id: string }[]
  if (linkRows.length === 0) return []

  const artistByLink = new Map(linkRows.map((l) => [l.id, l.artist_id]))

  const { data: events } = await admin
    .from('share_link_events')
    .select('link_id, kind, order_id')
    .in('link_id', linkRows.map((l) => l.id))
  const rows = (events ?? []) as { link_id: string; kind: string; order_id: string | null }[]

  const byArtist = new Map<string, { clicks: number; conversions: number; orderIds: string[] }>()
  for (const row of rows) {
    const artistId = artistByLink.get(row.link_id)
    if (!artistId) continue
    let entry = byArtist.get(artistId)
    if (!entry) {
      entry = { clicks: 0, conversions: 0, orderIds: [] }
      byArtist.set(artistId, entry)
    }
    if (row.kind === 'click') entry.clicks += 1
    else if (row.kind === 'conversion') {
      entry.conversions += 1
      if (row.order_id) entry.orderIds.push(row.order_id)
    }
  }
  if (byArtist.size === 0) return []

  const allOrderIds = [...byArtist.values()].flatMap((e) => e.orderIds)
  const ticketCountByOrder = new Map<string, number>()
  if (allOrderIds.length > 0) {
    const { data: tickets } = await admin
      .from('tickets')
      .select('order_id')
      .in('order_id', allOrderIds)
    for (const t of (tickets ?? []) as { order_id: string }[]) {
      ticketCountByOrder.set(t.order_id, (ticketCountByOrder.get(t.order_id) ?? 0) + 1)
    }
  }

  const { data: artists } = await admin
    .from('artists')
    .select('id, name')
    .in('id', [...byArtist.keys()])
  const nameById = new Map(((artists ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))

  return [...byArtist.entries()]
    .map(([artistId, entry]) => ({
      artistId,
      artistName: nameById.get(artistId) ?? 'Unknown artist',
      clicks: entry.clicks,
      conversions: entry.conversions,
      tickets: entry.orderIds.reduce((sum, id) => sum + (ticketCountByOrder.get(id) ?? 0), 0),
    }))
    .sort((a, b) => b.tickets - a.tickets || b.clicks - a.clicks)
}

/** Slug for a new artist: lowercased name plus a short random suffix,
 * mirroring the event slug pattern. */
export function generateArtistSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
  const suffix = Math.random().toString(36).substring(2, 8)
  return base ? `${base}-${suffix}` : suffix
}
