/**
 * WHAT THE SHARER IS TOLD, AND THE SHAPE IT IS TOLD ABOUT. THE PURE HALF.
 *
 * Close-out AQ2. Split out of my-shares.ts, which is `server-only`, so the
 * sentence can be tested in the node project without the server shim and so a
 * client surface could render it without dragging the admin client along.
 */

export interface ShareResultForEvent {
  eventId: string
  eventTitle: string
  eventSlug: string
  clicks: number
  /** Orders that came back through one of this person's links for this event. */
  joined: number
}

export interface MySharesSummary {
  totalClicks: number
  totalJoined: number
  byEvent: ShareResultForEvent[]
}

export const NO_SHARES: MySharesSummary = { totalClicks: 0, totalJoined: 0, byEvent: [] }

/**
 * The sentence the panel shows, beside the arithmetic rather than in the page,
 * so the words and the numbers cannot drift apart.
 *
 * It never says "nobody" to somebody who has shared: a person who sent five
 * links and had five people look is doing the thing, and being told they
 * produced nothing is how they stop.
 *
 * It counts PEOPLE and never money. A sharer is owed nothing on this platform
 * for a referral, and a dollar figure beside their name would imply they were.
 */
export function mySharesSentence(summary: MySharesSummary): string {
  if (summary.byEvent.length === 0) return 'Share an event and this is where you will see what it did.'
  if (summary.totalJoined === 0) {
    return summary.totalClicks === 1
      ? 'One person has opened a link you shared.'
      : `${summary.totalClicks} people have opened a link you shared.`
  }
  const people = summary.totalJoined === 1 ? 'person has' : 'people have'
  return `${summary.totalJoined} ${people} bought a ticket through a link you shared.`
}
