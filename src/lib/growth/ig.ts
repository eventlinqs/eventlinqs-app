import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { GUIDE_SELECT } from '@/lib/events/guide-queries'
import type { RawRow } from '@/lib/events/home-queries'
import type { LedgerRow } from '@/lib/events/ledger-data'
import { discoveryData } from '@/lib/events/discovery-data'
import { listingKey } from '@/lib/events/guide-sections'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { marketCard, type MarketCard } from '@/lib/home/market-cards'
import { IG_DAYS, igHref, igPieceHeading, igPiecePicks, igPicks, type IgNight, type IgPick, type IgPost } from './ig-math'

/**
 * The rows behind /ig (the rules and why are in ./ig-math.ts). The posts are the engine's own record of what went to
 * Instagram (social_piece_postings on platform 'instagram', each naming its approval, whose revision names the nights);
 * the nights are read by the site's one public visibility rule, test accounts left out as the city guide leaves them;
 * each is drawn by the marketplace's own card (src/lib/home/market-cards.ts marketCard: the night's own photograph with
 * its rights on record, else its venue's with its credit, else its labelled illustrative photograph, else the brand
 * panel), shaped by the city guide's own read (discoveryData), so nothing here decides a picture.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** A hundred ids a read, so the request line stays short whatever the fortnight holds. */
const IDS_PER_READ = 100

export type IgItem = {
  readonly card: MarketCard
  /** The card's link: its listing, tagged source instagram and the post's id. */
  readonly href: string
  readonly postId: string
}

export async function readIgItems(now: Date = new Date()): Promise<IgItem[]> {
  // NO SERVICE-ROLE KEY, NO ADMIN READ (the rule /weekend and featured-with-recorded-rights.ts hold): the CI build
  // prerenders with NEXT_PUBLIC values only, so there the page renders its empty state. Wherever the key exists, it reads.
  if (!getSupabaseServiceRoleKey()) {
    console.warn('[ig] no service-role key on this host; the Instagram posts are not read')
    return []
  }
  const admin = createAdminClient()
  const since = new Date(now.getTime() - IG_DAYS * DAY_MS).toISOString()
  const postings = await readOrThrow('the Instagram posts for /ig', () =>
    admin
      .from('social_piece_postings')
      .select('piece_id, post_url, posted_at, social_piece_approvals(revision)')
      .eq('platform', 'instagram')
      // Public posts only: a partner kit marked sent is never a post (scripts/guards/kit-sent-reads-the-touch.mjs).
      .neq('post_url', 'sent')
      .gte('posted_at', since)
      .lte('posted_at', now.toISOString())
      .order('posted_at', { ascending: false })
      .limit(500),
  )
  const went = (postings ?? []).flatMap((p) => {
    const approval = Array.isArray(p.social_piece_approvals) ? p.social_piece_approvals[0] : p.social_piece_approvals
    return approval ? [{ pieceId: p.piece_id, revision: approval.revision, postUrl: p.post_url, postedAt: p.posted_at }] : []
  })
  if (went.length === 0) return []

  const revisions = await readOrThrow('the approved revisions for /ig', () =>
    admin
      .from('social_piece_revisions')
      .select('piece_id, version, event_ids')
      .in('piece_id', [...new Set(went.map((w) => w.pieceId))])
      .limit(2000),
  )
  const posts: IgPost[] = went.flatMap((w) => {
    const rev = (revisions ?? []).find((r) => r.piece_id === w.pieceId && r.version === w.revision)
    return rev ? [{ postId: w.pieceId, postUrl: w.postUrl, postedAt: w.postedAt, eventIds: rev.event_ids ?? [] }] : []
  })

  const named = [...new Set(posts.flatMap((p) => p.eventIds))]
  if (named.length === 0) return []
  const rows = await readPublicNights(named, now)
  return cardsOf(igPicks(posts, nightsOf(rows), now), rows, now)
}

/** The nights named, by the site's one public visibility rule, test accounts left out; a hundred ids a read. */
async function readPublicNights(named: readonly string[], now: Date): Promise<RawRow[]> {
  const db = createPublicClient()
  const rows: RawRow[] = []
  for (let i = 0; i < named.length; i += IDS_PER_READ) {
    const ids = named.slice(i, i + IDS_PER_READ)
    const page = await readOrThrow('the nights /ig names', () =>
      applyPublicEventVisibility(
        db.from('events').select(GUIDE_SELECT).in('id', ids).eq('is_test', false).limit(ids.length),
        // A night sold on another site is listed: its EventLinqs listing carries the verified onward booking link.
        { now, includeExternal: true },
      ) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown }>,
    )
    rows.push(...(page ?? []))
  }
  return rows
}

function nightsOf(rows: readonly RawRow[]): Map<string, IgNight> {
  return new Map<string, IgNight>(
    rows.map((r) => [r.id, { id: r.id, start_date: r.start_date, end_date: r.end_date ?? null, timezone: r.timezone ?? null, listing: listingKey({ title: r.title, venue: r.venue_name ?? null }) }]),
  )
}

/** Each pick on the marketplace's own card, its link tagged for the visit ledger. */
async function cardsOf(picks: readonly IgPick[], rows: readonly RawRow[], now: Date, source: 'instagram' | 'facebook' = 'instagram'): Promise<IgItem[]> {
  if (picks.length === 0) return []
  const pickedIds = new Set(picks.map((p) => p.eventId))
  const shaped = await discoveryData((await withVenuePhotos(rows.filter((r) => pickedIds.has(r.id)))) as LedgerRow[], now)
  const byId = new Map(shaped.rows.map((r) => [r.id, r]))
  return picks.flatMap((p) => {
    const row = byId.get(p.eventId)
    if (!row) return []
    const card = marketCard({ row, more: p.more, every: null }, shaped.days.todayKey)
    return [{ card, href: igHref(card.href, p.postId, source), postId: p.postId }]
  })
}

/** One piece's own page: its heading from its own hook, and exactly its nights (ig-math.ts igPiecePicks). */
export type IgPiecePage = { readonly heading: string | null; readonly items: IgItem[] }

/**
 * /ig?piece=<id>, ONE PIECE'S OWN NIGHTS (the PM's RETURN of 04:05 on 24 November 2026; the rules in ig-math.ts
 * igPiecePicks): the nights the piece's newest revision names, still public and still listed, in date order, each on the
 * marketplace's own card leading to its event page, which carries its booking button. A piece unknown, or none of whose
 * nights is still ahead, gives no item, and the page says so. Read whether or not the piece was posted: its own link
 * lands here from its first post.
 */
export async function readIgPiecePage(pieceId: string, source: 'instagram' | 'facebook', now: Date = new Date()): Promise<IgPiecePage> {
  if (!getSupabaseServiceRoleKey()) {
    console.warn('[ig] no service-role key on this host; the piece is not read')
    return { heading: null, items: [] }
  }
  const admin = createAdminClient()
  const newest = await readOrThrow("the piece's newest words for /ig", () =>
    admin.from('social_piece_revisions').select('version, event_ids, versions').eq('piece_id', pieceId).order('version', { ascending: false }).limit(1),
  )
  const rev = (newest ?? [])[0] as { event_ids?: string[] | null; versions?: { instagram?: { hook?: string } } | null } | undefined
  if (!rev) return { heading: null, items: [] }
  const named = [...new Set(rev.event_ids ?? [])]
  const heading = igPieceHeading(rev.versions?.instagram?.hook ?? null)
  if (named.length === 0) return { heading, items: [] }
  const rows = await readPublicNights(named, now)
  return { heading, items: await cardsOf(igPiecePicks(pieceId, named, nightsOf(rows), now), rows, now, source) }
}
