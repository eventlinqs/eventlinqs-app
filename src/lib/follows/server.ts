import { createClient } from '@/lib/supabase/server'
import { partitionFollows, type FollowRow } from './orphans'

export const EVENT_CARD_SELECT =
  'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, is_free, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

/**
 * Whether the signed-in user follows a given entity. Returns false when there
 * is no session. Used by server pages to seed FollowButton initial state.
 */
export async function isFollowing(type: 'artist' | 'subgenre', id: string): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('followable_type', type)
    .eq('followable_id', id)
    .maybeSingle()

  return Boolean(data)
}

/**
 * The signed-in user's live follows, partitioned into artist ids and sub-genre
 * slugs with orphans (deleted artists, retired sub-genre slugs) dropped.
 * Returns null when there is no session.
 */
export async function getFollowTargets(): Promise<{
  artistIds: string[]
  subgenreSlugs: string[]
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: followRows } = await supabase
    .from('follows')
    .select('followable_type, followable_id')
    .eq('user_id', user.id)

  const follows = (followRows ?? []) as FollowRow[]

  // Build the set of artist ids that still exist so orphaned artist follows are
  // dropped before we query their events.
  const artistFollowIds = follows
    .filter((f) => f.followable_type === 'artist')
    .map((f) => f.followable_id)

  let liveArtistIds: Set<string> = new Set()
  if (artistFollowIds.length > 0) {
    const { data: artistRows } = await supabase
      .from('artists')
      .select('id')
      .in('id', artistFollowIds)
    liveArtistIds = new Set((artistRows ?? []).map((a) => a.id as string))
  }

  return partitionFollows(follows, liveArtistIds)
}
