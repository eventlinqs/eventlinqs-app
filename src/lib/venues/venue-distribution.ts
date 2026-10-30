/**
 * D3 (6), A VENUE's DISTRIBUTION PREFERENCES (the DemandOS directive, section 3, "Distribution preferences").
 *
 * A claimed venue says where EventLinqs may carry its nights beyond its own pages, on two channels:
 *   our_posts       EventLinqs' own Instagram and Facebook posts, the daily posters and the owned editions the weekly
 *                   campaign plans (src/lib/social/store.ts planNow, and refused again before approval);
 *   weekly_roundup  the weekly round-up of its city, the email to subscribers and its WhatsApp edition, which carry the
 *                   same nights (src/lib/broadcast/digest.ts fetchDigestEvents).
 * A venue that has said nothing is yes to both. The listing, its event pages and search are not touched.
 *
 * The table is the service role's alone (migration 20261031033001); every read and write goes through its definer
 * functions, so the database decides who may answer for a venue (the venue media rule, venue_image_manager) and no
 * generated type is needed for a table no screen reads directly. A failed read is thrown: a plan or a send that cannot
 * see a venue's no must stop, never carry the venue's nights.
 */

export type DistributionChannel = 'our_posts' | 'weekly_roundup'
export type VenueDistribution = { readonly ourPosts: boolean; readonly weeklyRoundup: boolean; readonly setAt: string | null }
export type DistributionAnswer = { readonly state: 'done' } | { readonly state: 'refused'; readonly reason: string }
export type DistributionDeps = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }>
}

/** A venue that has said nothing: yes to both channels. */
export const SAID_NOTHING: VenueDistribution = Object.freeze({ ourPosts: true, weeklyRoundup: true, setAt: null })

/** The service role's calls, named as strings so a test can fake them (the typed client takes only a literal name). */
export function distributionDeps(admin: { rpc: unknown }): DistributionDeps {
  return {
    async rpc(name, args) {
      const { data, error } = await (admin.rpc as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>).call(admin, name, args)
      return { data, error: error ? { code: error.code, message: error.message } : null }
    },
  }
}

/** A claimed venue's two answers, set together; the database refuses anyone who is not one of the venue's own people. */
export async function setVenueDistribution(
  userId: string,
  venueId: string,
  answer: { ourPosts: boolean; weeklyRoundup: boolean },
  deps: DistributionDeps,
): Promise<DistributionAnswer> {
  const { error } = await deps.rpc('venue_distribution_set', {
    p_user: userId,
    p_venue: venueId,
    p_our_posts: answer.ourPosts,
    p_weekly_roundup: answer.weeklyRoundup,
  })
  if (!error) return { state: 'done' }
  const words = /^refused:\s*(.+)$/s.exec(error.message)?.[1]?.trim()
  if (error.code === '23514' && words) return { state: 'refused', reason: words.charAt(0).toUpperCase() + words.slice(1) }
  throw new Error(`the venue's sharing answers were not saved: ${error.message}`)
}

/** What each of these venues has said; a venue with no answer is SAID_NOTHING. */
export async function venueDistributionFor(venueIds: readonly string[], deps: DistributionDeps): Promise<Map<string, VenueDistribution>> {
  const said = new Map<string, VenueDistribution>()
  if (venueIds.length === 0) return said
  const { data, error } = await deps.rpc('venue_distribution_for', { p_venues: [...venueIds] })
  if (error) throw new Error(`the venues' sharing answers could not be read: ${error.message}`)
  for (const id of venueIds) said.set(id, SAID_NOTHING)
  for (const r of (data ?? []) as { venue_id: string; our_posts: boolean; weekly_roundup: boolean; set_at: string }[]) {
    said.set(r.venue_id, { ourPosts: r.our_posts, weeklyRoundup: r.weekly_roundup, setAt: r.set_at })
  }
  return said
}

/** The venues that said no to one channel. */
export async function venuesOff(channel: DistributionChannel, deps: DistributionDeps): Promise<Set<string>> {
  const { data, error } = await deps.rpc('venue_distribution_off', { p_channel: channel })
  if (error) throw new Error(`the venues that said no to ${channel} could not be read: ${error.message}`)
  return new Set((data ?? []) as string[])
}

/** The nights at a venue that said no; a night with no venue of ours is never left out by this. */
export function nightsLeftOut(nights: readonly { eventId: string; venueId: string | null }[], off: ReadonlySet<string>): Set<string> {
  return new Set(nights.filter((n) => n.venueId !== null && off.has(n.venueId)).map((n) => n.eventId))
}
