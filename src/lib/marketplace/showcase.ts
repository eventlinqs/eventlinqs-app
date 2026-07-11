import type { createAdminClient } from '@/lib/supabase/admin'
import { parseVideoEmbed } from '@/lib/media/video-embed'
import type { VideoProvider } from '@/lib/media/limits'
import type { ArtistRow } from '@/lib/broadcast/artists'
import type { PerformanceType } from './gigs'
import { isPerformanceType } from './gigs'

/**
 * Performer marketplace: showcase profile reads and validation (flag
 * artist_showcase). Extends the Broadcast Layer artist entities; the embed
 * allowlist is the Event Media Standard's parseVideoEmbed, the ONE path a
 * raw URL becomes a renderable embed, so a non-allowlisted or markup-bearing
 * URL is rejected before it ever reaches the database.
 */

export const MAX_SHOWCASE_EMBEDS = 6

export interface ShowcaseEmbed {
  provider: VideoProvider
  embedUrl: string
  sourceUrl: string
}

export interface ShowcaseArtist extends ArtistRow {
  performance_types: PerformanceType[]
  genres: string[]
  city_slug: string | null
  available_for_booking: boolean
  pay_expectation: string | null
  showcase_embeds: ShowcaseEmbed[]
  draw_consent: boolean
  mentor_open: boolean
}

type Admin = ReturnType<typeof createAdminClient>

const SHOWCASE_COLUMNS =
  'id, slug, name, bio, image_url, links, owner_user_id, performance_types, genres, city_slug, available_for_booking, pay_expectation, showcase_embeds, draw_consent, mentor_open'

function normaliseEmbeds(raw: unknown): ShowcaseEmbed[] {
  if (!Array.isArray(raw)) return []
  const out: ShowcaseEmbed[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { provider, embedUrl, sourceUrl } = item as Record<string, unknown>
    if (typeof provider !== 'string' || typeof embedUrl !== 'string') continue
    // Re-validate on read: only rows that still parse cleanly render.
    const parsed = parseVideoEmbed(typeof sourceUrl === 'string' ? sourceUrl : embedUrl)
    if (!parsed.ok) continue
    out.push({
      provider: parsed.video.provider,
      embedUrl: parsed.video.embedUrl,
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : embedUrl,
    })
  }
  return out.slice(0, MAX_SHOWCASE_EMBEDS)
}

function toShowcaseArtist(data: Record<string, unknown>): ShowcaseArtist {
  const types = Array.isArray(data.performance_types)
    ? (data.performance_types as string[]).filter(isPerformanceType)
    : []
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    bio: (data.bio as string | null) ?? null,
    image_url: (data.image_url as string | null) ?? null,
    links: normaliseLinks(data.links),
    owner_user_id: (data.owner_user_id as string | null) ?? null,
    performance_types: types,
    genres: Array.isArray(data.genres) ? (data.genres as string[]).slice(0, 12) : [],
    city_slug: (data.city_slug as string | null) ?? null,
    available_for_booking: Boolean(data.available_for_booking),
    pay_expectation: (data.pay_expectation as string | null) ?? null,
    showcase_embeds: normaliseEmbeds(data.showcase_embeds),
    draw_consent: Boolean(data.draw_consent),
    mentor_open: Boolean(data.mentor_open),
  }
}

function normaliseLinks(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) out[k] = v
  }
  return out
}

export async function fetchShowcaseArtistBySlug(
  admin: Admin,
  slug: string,
): Promise<ShowcaseArtist | null> {
  if (!/^[a-z0-9-]{1,200}$/i.test(slug)) return null
  const { data } = await admin.from('artists').select(SHOWCASE_COLUMNS).eq('slug', slug).maybeSingle()
  return data ? toShowcaseArtist(data as Record<string, unknown>) : null
}

export async function fetchShowcaseArtistForOwner(
  admin: Admin,
  userId: string,
): Promise<ShowcaseArtist | null> {
  const { data } = await admin
    .from('artists')
    .select(SHOWCASE_COLUMNS)
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle()
  return data ? toShowcaseArtist(data as Record<string, unknown>) : null
}

export interface DirectoryFilters {
  citySlug?: string | null
  performanceType?: PerformanceType | null
  availableOnly?: boolean
  mentorOnly?: boolean
  limit?: number
}

/** The public performer directory (city-scoped, filterable). */
export async function fetchDirectoryArtists(
  admin: Admin,
  filters: DirectoryFilters = {},
): Promise<ShowcaseArtist[]> {
  let query = admin
    .from('artists')
    .select(SHOWCASE_COLUMNS)
    .order('name', { ascending: true })
    .limit(filters.limit ?? 48)

  if (filters.citySlug) query = query.eq('city_slug', filters.citySlug)
  if (filters.performanceType) query = query.contains('performance_types', [filters.performanceType])
  if (filters.availableOnly) query = query.eq('available_for_booking', true)
  if (filters.mentorOnly) query = query.eq('mentor_open', true)

  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(toShowcaseArtist)
}

/**
 * Attributed draw totals for a set of artists in three batch queries
 * (links, attribution events, tickets), so the directory can show and sort
 * by REAL sales without one query per performer.
 */
export async function fetchDrawTotalsForArtists(
  admin: Admin,
  artistIds: string[],
): Promise<Map<string, { clicks: number; orders: number; tickets: number }>> {
  const totals = new Map<string, { clicks: number; orders: number; tickets: number }>()
  if (artistIds.length === 0) return totals

  const { data: links } = await admin
    .from('share_links')
    .select('id, artist_id')
    .in('artist_id', artistIds)
  const linkRows = (links ?? []) as { id: string; artist_id: string }[]
  if (linkRows.length === 0) return totals
  const artistByLink = new Map(linkRows.map((l) => [l.id, l.artist_id]))

  const { data: events } = await admin
    .from('share_link_events')
    .select('link_id, kind, order_id')
    .in('link_id', linkRows.map((l) => l.id))
  const rows = (events ?? []) as { link_id: string; kind: string; order_id: string | null }[]

  const orderToArtist = new Map<string, string>()
  for (const row of rows) {
    const artistId = artistByLink.get(row.link_id)
    if (!artistId) continue
    let entry = totals.get(artistId)
    if (!entry) {
      entry = { clicks: 0, orders: 0, tickets: 0 }
      totals.set(artistId, entry)
    }
    if (row.kind === 'click') entry.clicks += 1
    else if (row.kind === 'conversion') {
      entry.orders += 1
      if (row.order_id) orderToArtist.set(row.order_id, artistId)
    }
  }

  const orderIds = [...orderToArtist.keys()]
  if (orderIds.length > 0) {
    const { data: tickets } = await admin.from('tickets').select('order_id').in('order_id', orderIds)
    for (const t of (tickets ?? []) as { order_id: string }[]) {
      const artistId = orderToArtist.get(t.order_id)
      if (!artistId) continue
      const entry = totals.get(artistId)
      if (entry) entry.tickets += 1
    }
  }
  return totals
}

export interface ArtistCredit {
  eventId: string
  slug: string
  title: string
  startDate: string
  venueLabel: string
}

/** Past confirmed shows: the auto-populated credits and lineup history. */
export async function fetchArtistCredits(
  admin: Admin,
  artistId: string,
  limit = 12,
): Promise<ArtistCredit[]> {
  const { data } = await admin
    .from('event_artists')
    .select('status, event:events(id, slug, title, start_date, venue_name, venue_city, status, visibility)')
    .eq('artist_id', artistId)
    .eq('status', 'confirmed')

  type Row = {
    status: string
    event: {
      id: string
      slug: string
      title: string
      start_date: string
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
        !!e &&
        ['published', 'completed'].includes(e.status) &&
        e.visibility !== 'private' &&
        e.start_date < nowIso,
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, limit)
    .map((e) => ({
      eventId: e.id,
      slug: e.slug,
      title: e.title,
      startDate: e.start_date,
      venueLabel: [e.venue_name, e.venue_city].filter(Boolean).join(', '),
    }))
}

export type EmbedParseOutcome =
  | { ok: true; embeds: ShowcaseEmbed[] }
  | { ok: false; error: string }

/**
 * Validate raw showcase URLs against the platform embed allowlist. Rejects
 * the whole set on the first bad URL so the performer sees exactly which
 * link failed; caps at six.
 */
export function parseShowcaseEmbeds(inputs: string[]): EmbedParseOutcome {
  const cleaned = inputs.map((u) => u.trim()).filter((u) => u.length > 0)
  if (cleaned.length > MAX_SHOWCASE_EMBEDS) {
    return { ok: false, error: `Up to ${MAX_SHOWCASE_EMBEDS} showcase links.` }
  }
  const embeds: ShowcaseEmbed[] = []
  for (const url of cleaned) {
    const parsed = parseVideoEmbed(url)
    if (!parsed.ok) {
      return {
        ok: false,
        error: `We could not use "${url.slice(0, 80)}". Paste a YouTube, Vimeo, Instagram, or TikTok link.`,
      }
    }
    embeds.push({
      provider: parsed.video.provider,
      embedUrl: parsed.video.embedUrl,
      sourceUrl: url,
    })
  }
  return { ok: true, embeds }
}
