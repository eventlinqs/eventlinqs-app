import type { Tier } from '@/lib/events/relevance'

/**
 * THE ORGANISER SPOTLIGHT, BY RULE (Lawal, 12 November 2026, 11:11, item 3: "the Marketing Studio's first three posts
 * drafted from verified Melbourne inventory: Friday's weekend guide, one free or tonight post, one organiser spotlight.
 * Images only where the recorded permission covers social use").
 *
 * Never a hand list of events. The spotlight is the Melbourne night of an organiser who listed it under their own
 * account (not a night the platform's listings account holds for them), public, not sold out, starting within the next
 * fortnight; first the night whose own photographs carry a grant that covers social use (approved before one waiting
 * for Lawal's yes), then the bigger night by the relevance tiers (src/lib/events/relevance.ts, law 18), then the
 * soonest. Pure: the reads are ./three-posts.ts's.
 */

export const SPOTLIGHT_AHEAD_DAYS = 14

export type SocialGrant = 'approved' | 'pending' | null

export interface SpotlightNight {
  readonly eventId: string
  readonly title: string
  readonly slug: string
  readonly startDate: string
  readonly endDate: string
  readonly city: string | null
  /** Listed by the organiser under their own account, not held by the platform's listings account. */
  readonly ownAccount: boolean
  readonly soldOut: boolean
  /** The best grant on the night's own photographs that covers social use. */
  readonly socialGrant: SocialGrant
  readonly tier: Tier
}

const GRANT_ORDER: Record<string, number> = { approved: 0, pending: 1, none: 2 }

/** The one night to spotlight now, or null when no Melbourne organiser's own night qualifies. */
export function pickSpotlight(nights: readonly SpotlightNight[], now: Date): SpotlightNight | null {
  const until = now.getTime() + SPOTLIGHT_AHEAD_DAYS * 86_400_000
  const due = nights
    .filter((n) => /melbourne/i.test(n.city ?? '') && n.ownAccount && !n.soldOut)
    .filter((n) => new Date(n.endDate).getTime() > now.getTime() && new Date(n.startDate).getTime() <= until)
    .sort(
      (a, b) =>
        GRANT_ORDER[a.socialGrant ?? 'none'] - GRANT_ORDER[b.socialGrant ?? 'none'] ||
        a.tier - b.tier ||
        a.startDate.localeCompare(b.startDate) ||
        a.eventId.localeCompare(b.eventId),
    )
  return due[0] ?? null
}

/** The best grant among a night's photographs: approved before waiting; a grant for the site alone is not one. */
export function bestSocialGrant(assets: readonly { readonly scope: string; readonly approvalStatus: string; readonly withdrawn: boolean }[]): SocialGrant {
  const social = assets.filter((a) => (a.scope === 'social' || a.scope === 'both') && !a.withdrawn)
  if (social.some((a) => a.approvalStatus === 'approved')) return 'approved'
  if (social.some((a) => a.approvalStatus === 'pending')) return 'pending'
  return null
}
