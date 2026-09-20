import type { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow, type PagedResult } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { parseVideoEmbed } from '@/lib/media/video-embed'
import type { VideoProvider } from '@/lib/media/limits'
import type { ArtistRow } from '@/lib/broadcast/artists'
import type { PerformanceType } from './gigs'
import { isPerformanceType } from './gigs'
import { isPubliclyDiscoverable } from '@/lib/events/visibility'

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

/**
 * The showcase behind the PUBLIC performer profile.
 *
 * Null used to mean two different things and the page could not tell them
 * apart. `src/app/artists/[slug]/page.tsx` renders the showcase section only
 * when this is non-null, so a dropped socket took the embeds, the genres, the
 * booking availability and the draw off a working performer's public profile
 * and still answered 200. The promoter who came to book them saw a profile that
 * looked deliberately empty. readOrThrow retries a blink, throws a real fault,
 * and answers null only for a performer who genuinely has not set one up.
 */
export async function fetchShowcaseArtistBySlug(
  admin: Admin,
  slug: string,
): Promise<ShowcaseArtist | null> {
  if (!/^[a-z0-9-]{1,200}$/i.test(slug)) return null
  const row = await readOrThrow(
    'showcase-artist-by-slug',
    () =>
      admin
        .from('artists')
        .select(SHOWCASE_COLUMNS)
        .eq('slug', slug)
        .maybeSingle() as unknown as Read<Record<string, unknown>>,
  )
  return row ? toShowcaseArtist(row) : null
}

/**
 * The performer's own showcase, for their own dashboard.
 *
 * `src/app/artist/dashboard/page.tsx` renders `ShowcaseEditor` only when this
 * is non-null, so a failed read did not reset the editor, it REMOVED it: the
 * performer opened their dashboard and the only control they have over their
 * public profile was simply not on the page, with nothing saying why.
 */
export async function fetchShowcaseArtistForOwner(
  admin: Admin,
  userId: string,
): Promise<ShowcaseArtist | null> {
  const row = await readOrThrow(
    'showcase-artist-for-owner',
    () =>
      admin
        .from('artists')
        .select(SHOWCASE_COLUMNS)
        .eq('owner_user_id', userId)
        .limit(1)
        .maybeSingle() as unknown as Read<Record<string, unknown>>,
  )
  return row ? toShowcaseArtist(row) : null
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
    // `name` is not unique, so on its own it leaves the 48 that survive the
    // bound undefined among ties and the directory can reshuffle between two
    // renders of the same query. `id` is the table's primary key, which makes
    // the order total. The same reasoning is written out in
    // src/lib/marketplace/cities.ts.
    .order('id', { ascending: true })
    .limit(filters.limit ?? 48)

  if (filters.citySlug) query = query.eq('city_slug', filters.citySlug)
  if (filters.performanceType) query = query.contains('performance_types', [filters.performanceType])
  if (filters.availableOnly) query = query.eq('available_for_booking', true)
  if (filters.mentorOnly) query = query.eq('mentor_open', true)

  // A FAILED READ IS NOT AN EMPTY MARKETPLACE. The error was discarded, so a
  // dropped socket rendered /artists as "No performers match those filters
  // yet", with a 200, to the promoter the supply side exists for. The bound
  // above is deliberate and stays (this is a browse surface with a page size,
  // not a set that must be read whole); what changes is that a failure is now
  // a failure. Same shape, same sentence, as fetchOpenGigs.
  const { data, error } = await query
  if (error) throw new Error(`the performer directory could not be read: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(toShowcaseArtist)
}

/**
 * Attributed draw totals for a set of artists in three batched, paged queries
 * (links, attribution events, tickets), so the directory can show and sort by
 * REAL sales without one query per performer.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE DIRECTORY'S COPY OF A FUNCTION THAT WAS FIXED ONCE ALREADY.
 * `fetchArtistAttribution` in src/lib/broadcast/artists.ts is the same
 * computation for ONE performer and was routed through the pager on 19
 * September, in its own words: "share_link_events takes one row per click, so a
 * working artist passes the 1,000-row ceiling and their proof quietly shrinks".
 * This one reads the links of every performer on the page at once, so it
 * reaches that ceiling sooner rather than later, and it was left behind.
 *
 * THE COST IS NOT ONLY AN UNDER-REPORTED NUMBER. src/app/artists/page.tsx sorts
 * on `draw?.tickets ?? 0` for sort=draw, so a truncated count RE-ORDERS the
 * directory: the performer who sells most can be ranked below one who sells
 * less. The page's own promise is "the exact tickets their sharing sold".
 *
 * All three reads are paged through `readEveryRow` (which throws rather than
 * returning what it managed to collect) and every `in` list is split by
 * `chunkInFilterValues`, because a full directory's worth of link ids does not
 * fit in one request's filter.
 */
export async function fetchDrawTotalsForArtists(
  admin: Admin,
  artistIds: string[],
): Promise<Map<string, { clicks: number; orders: number; tickets: number }>> {
  const totals = new Map<string, { clicks: number; orders: number; tickets: number }>()
  if (artistIds.length === 0) return totals

  const linkRows: { id: string; artist_id: string }[] = []
  for (const chunk of chunkInFilterValues(artistIds)) {
    linkRows.push(
      ...(await readEveryRow<{ id: string; artist_id: string }>(
        'the tracked links carrying these performers',
        (from, to) =>
          admin
            .from('share_links')
            .select('id, artist_id')
            .in('artist_id', chunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<PagedResult<{ id: string; artist_id: string }>>,
      )),
    )
  }
  if (linkRows.length === 0) return totals
  const artistByLink = new Map(linkRows.map((l) => [l.id, l.artist_id]))

  const rows: { link_id: string; kind: string; order_id: string | null }[] = []
  for (const chunk of chunkInFilterValues(linkRows.map((l) => l.id))) {
    rows.push(
      ...(await readEveryRow<{ link_id: string; kind: string; order_id: string | null }>(
        'the clicks and conversions on these performers links',
        (from, to) =>
          admin
            .from('share_link_events')
            .select('link_id, kind, order_id')
            .in('link_id', chunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<
            PagedResult<{ link_id: string; kind: string; order_id: string | null }>
          >,
      )),
    )
  }

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

  for (const chunk of chunkInFilterValues([...orderToArtist.keys()])) {
    const tickets = await readEveryRow<{ order_id: string }>(
      'the tickets on these performers attributed orders',
      (from, to) =>
        admin
          .from('tickets')
          .select('id, order_id')
          .in('order_id', chunk)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<PagedResult<{ order_id: string }>>,
    )
    for (const t of tickets) {
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
  /** The EVENT's IANA zone, so a credit shows the night it was, not the
   *  reader's. A credit reading "Aug 2026" can slip a month at a month
   *  boundary when formatted in the reader's zone instead. */
  timezone: string | null
  venueLabel: string
}

/**
 * Past confirmed shows: the auto-populated credits and lineup history.
 *
 * PAGED RATHER THAN BOUNDED, and the distinction matters here more than it
 * looks. The `limit` is applied in JavaScript, AFTER the allow-list filter and
 * after sorting newest first, because the filter reads a nested event and the
 * sort key is on it. So the twelve that render are chosen from the whole set:
 * a read that stopped at the 1,000-row ceiling would not have shown twelve
 * fewer credits, it would have shown the WRONG twelve, silently, with the
 * performer's most recent work being exactly what was missing.
 *
 * A failure throws. This is a public profile and the credits are the performer's
 * history; drawing an empty list says they have never played.
 */
export async function fetchArtistCredits(
  admin: Admin,
  artistId: string,
  limit = 12,
): Promise<ArtistCredit[]> {
  const data = await readEveryRow<Record<string, unknown>>(
    'this performer past confirmed shows',
    (from, to) =>
      admin
        .from('event_artists')
        .select(
          'id, status, event:events(id, slug, title, start_date, timezone, venue_name, venue_city, status, visibility)',
        )
        .eq('artist_id', artistId)
        .eq('status', 'confirmed')
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<PagedResult<Record<string, unknown>>>,
  )

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
        // Child-safety ruling, 9 August 2026. Credits render on the PUBLIC
        // artist profile and the public gig page, so this is a discovery
        // surface. It used to read `visibility !== 'private'`, a deny-list that
        // passed UNLISTED events onto a public page. Allow-list only.
        !!e &&
        ['published', 'completed'].includes(e.status) &&
        isPubliclyDiscoverable(e.visibility) &&
        e.start_date < nowIso,
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, limit)
    .map((e) => ({
      eventId: e.id,
      slug: e.slug,
      title: e.title,
      startDate: e.start_date,
      timezone: e.timezone,
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
