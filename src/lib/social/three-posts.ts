import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { tierOf } from '@/lib/events/relevance'
import { LISTINGS_ORGANISATION_SLUG } from '@/lib/listings/shown-organiser'
import { planPost, readCampaign, readPosts, soldOut, type PieceRow, type PieceState, type PostRow } from './store'
import { bestSocialGrant, pickSpotlight, SPOTLIGHT_AHEAD_DAYS, type SpotlightNight } from './spotlight-math'

/**
 * THIS WEEK'S THREE POSTS ON THE COMMAND CENTRE (Lawal, 12 November 2026, 11:11, items 3 and 4: "the Marketing Studio's
 * first three posts drafted from verified Melbourne inventory: Friday's weekend guide, one free or tonight post, one
 * organiser spotlight ... He approves and posts from his phone until Meta is connected; a 'posted' press records it", and
 * "the Command Centre shows tomorrow's twenty with drafts and the three posts").
 *
 * Nothing new decides a post here. The weekend guide and the tonight and tomorrow piece are Melbourne's pieces of the
 * week's campaign (./store.ts planCampaignWeek, their nights ranked by src/lib/growth/post-picks.ts, a photograph only
 * where an approved rights row covers social use). The spotlight is the night ./spotlight-math.ts picks by rule, posted
 * through the week's own per event post (./store.ts planPost). Approving, editing and the posted press stay on
 * /admin/social; this reads their state and links to each.
 */

type Db = SupabaseClient

export interface PieceSummary {
  readonly id: string
  readonly state: PieceState
  readonly postUrl: string | null
  readonly href: string
}

export interface SpotlightSummary {
  readonly night: SpotlightNight
  /** The night's planned Instagram feed post, or null when none is planned yet. */
  readonly post: {
    readonly id: string
    readonly href: string
    readonly wordsBy: 'kit' | 'person' | null
    readonly approvedAt: string | null
    readonly postedAt: string | null
    readonly postUrl: string | null
  } | null
}

export interface ThreePosts {
  readonly weekStart: string | null
  readonly weekend: PieceSummary | null
  readonly tonight: PieceSummary | null
  readonly spotlight: SpotlightSummary | null
}

const piece = (pieces: readonly PieceRow[], kind: PieceRow['kind']): PieceSummary | null => {
  const p = pieces.find((x) => x.kind === kind && x.city === 'melbourne')
  return p ? { id: p.id, state: p.state, postUrl: p.postUrl, href: `/admin/social#piece-${p.id}` } : null
}

/** The three posts from the week's pieces, the planned posts and the picked night. Pure. */
export function threePostsView(
  campaign: { readonly weekStart: string; readonly pieces: readonly PieceRow[] } | null,
  posts: readonly PostRow[],
  night: SpotlightNight | null,
): ThreePosts {
  const mine = night
    ? posts
        .filter((p) => p.eventId === night.eventId && p.platform === 'instagram' && p.format === 'feed')
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0] ?? null
    : null
  return {
    weekStart: campaign?.weekStart ?? null,
    weekend: campaign ? piece(campaign.pieces, 'weekend_carousel') : null,
    tonight: campaign ? piece(campaign.pieces, 'tonight_tomorrow') : null,
    spotlight: night
      ? {
          night,
          post: mine
            ? {
                id: mine.id,
                href: `/admin/social#post-${mine.id}`,
                wordsBy: mine.draft?.writtenBy ?? null,
                approvedAt: mine.approvedAt,
                postedAt: mine.postedAt,
                postUrl: mine.postUrl,
              }
            : null,
        }
      : null,
  }
}

type NightRow = {
  id: string
  slug: string
  title: string
  start_date: string
  end_date: string
  venue_name: string | null
  venue_city: string | null
  is_free: boolean | null
  category: { slug: string | null } | null
  organisation: { slug: string | null } | null
  ticket_tiers: { total_capacity: number; sold_count: number; reserved_count: number; is_active: boolean }[] | null
  event_booking_links: { availability: string }[] | null
}

/** Melbourne's public nights in the spotlight's window, each with its best grant for social use. */
export async function readSpotlightNights(db: Db, now: Date): Promise<SpotlightNight[]> {
  const { data, error } = await applyPublicEventVisibility(
    db
      .from('events')
      .select(
        'id, slug, title, start_date, end_date, venue_name, venue_city, is_free, category:event_categories!events_category_id_fkey(slug), organisation:organisations(slug), ticket_tiers(total_capacity, sold_count, reserved_count, is_active), event_booking_links(availability)',
      ),
    { now, includeExternal: true },
  )
    .gt('end_date', now.toISOString())
    .lte('start_date', new Date(now.getTime() + SPOTLIGHT_AHEAD_DAYS * 86_400_000).toISOString())
    .ilike('venue_city', '%melbourne%')
    .order('start_date', { ascending: true })
    .limit(400)
  if (error) throw new Error(`Melbourne's nights could not be read: ${error.message}`)
  const rows = (data ?? []) as unknown as NightRow[]
  if (rows.length === 0) return []
  const assets = await db
    .from('social_assets')
    .select('event_id, scope, approval_status, withdrawal_status, expires_at')
    .in('event_id', rows.map((r) => r.id))
  if (assets.error) throw new Error(`the nights' photograph grants could not be read: ${assets.error.message}`)
  const byEvent = new Map<string, { scope: string; approvalStatus: string; withdrawn: boolean }[]>()
  for (const a of assets.data ?? []) {
    const expired = a.expires_at !== null && new Date(a.expires_at as string).getTime() <= now.getTime()
    const list = byEvent.get(a.event_id as string) ?? []
    list.push({ scope: a.scope as string, approvalStatus: a.approval_status as string, withdrawn: a.withdrawal_status !== 'current' || expired })
    byEvent.set(a.event_id as string, list)
  }
  return rows.map((r) => ({
    eventId: r.id,
    title: r.title,
    slug: r.slug,
    startDate: r.start_date,
    endDate: r.end_date,
    city: r.venue_city,
    ownAccount: Boolean(r.organisation?.slug) && r.organisation?.slug !== LISTINGS_ORGANISATION_SLUG,
    soldOut: soldOut(r.ticket_tiers ?? [], r.event_booking_links ?? []),
    socialGrant: bestSocialGrant(byEvent.get(r.id) ?? []),
    tier: tierOf({ title: r.title, venue: r.venue_name, categorySlug: r.category?.slug ?? null, ticketed: r.is_free === false }),
  }))
}

/**
 * The spotlight's post drafted without a press (the PM's 11:11 item 3: the three posts drafted by the morning): in the
 * outreach run's hourly drafting, when the rule picks a night and its Instagram feed post is not yet planned, it is
 * planned through the week's own planner (./store.ts planPost) in the founder's name. Approval and posting stay his.
 */
export async function draftTheSpotlight(db: Db, input: { readonly now: Date; readonly plannedBy: string }): Promise<string> {
  const night = pickSpotlight(await readSpotlightNights(db, input.now), input.now)
  if (night === null) return 'no Melbourne organiser has a night of their own in the next fortnight'
  const done = await planPost(db, { eventId: night.eventId, platform: 'instagram', format: 'feed' }, input)
  if (!done.kept) return `${night.title}: ${done.held ?? 'not planned'}`
  return `${night.title}: drafted${done.held ? ` (${done.held})` : ''}`
}

export async function readThreePosts(db: Db, now: Date = new Date()): Promise<ThreePosts> {
  const [campaign, posts, nights] = await Promise.all([readCampaign(db, now), readPosts(db, now), readSpotlightNights(db, now)])
  return threePostsView(campaign, posts, pickSpotlight(nights, now))
}
