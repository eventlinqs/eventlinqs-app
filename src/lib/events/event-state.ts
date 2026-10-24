import { isStillListed } from './listing-window'

/**
 * WHICH STATE AN EVENT PAGE SHOWS ITS VISITOR, from its status and its dates.
 *
 * Until 23 October 2026 the ticketed page judged "past" by status 'completed'
 * alone, so an event whose end had passed while its status stayed 'published'
 * read as on sale: on production the one live event, which ended on 10 October,
 * still offered "Get tickets" and told search engines it was in stock twelve
 * days later (WINDOW4-STATUS.txt, 23 October 00:57). An event is over when its
 * end has passed, whatever its status says, and the moment it is over is the
 * one the discovery surfaces already use (`isStillListed`, listing-window.ts),
 * so the page and /events can never disagree about whether it is on.
 *
 * Cancelled, postponed and archived keep their own state even after the date:
 * a cancelled night stays cancelled, and a postponed one is waiting for its new
 * date rather than over.
 */
export type EventPageState = 'cancelled' | 'postponed' | 'past' | 'archived' | null

export function eventPageState(
  event: { status: string; start_date: string; end_date?: string | null; timezone?: string | null },
  now: Date,
): EventPageState {
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'postponed') return 'postponed'
  if (event.status === 'completed') return 'past'
  // Only a ticket holder ever reaches an archived event's page
  // (readEventForRoute, branch 3).
  if (event.status === 'archived') return 'archived'
  if (!isStillListed(event, now)) return 'past'
  return null
}
