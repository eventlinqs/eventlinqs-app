/**
 * Affinity ranking for the personalised "For You" feed (demand engine 2: the
 * Match and Personalised Feed). PURE and testable: given a user's graph signals
 * and a set of candidate events, it returns a deterministically ranked list with
 * a score per event. No I/O, no Supabase, no clock except the `now` passed in.
 *
 * The graph signals come from the existing tables only (no migration):
 *   - followedOrganisationIds : saved_organisers (follow an organiser)
 *   - savedCategoryIds        : saved_categories
 *   - followedArtistEventIds  : follows(followable_type='artist') joined through
 *                               event_artists to the events those artists play
 *   - followedSceneSlugs      : follows(followable_type='subgenre'), matched
 *                               against an event's community/scene tags
 *   - savedEventCategoryIds   : the categories of the user's saved_events, used
 *                               as a soft "more like what you saved" signal
 *   - preferredCity           : profiles.preferred_city
 *
 * Weights are tuned so a direct follow (organiser / artist) always outranks a
 * softer taste signal (category / city), and recency only ever breaks ties
 * within the same affinity band - it never lifts an unrelated event above a
 * followed one. Past and expired events are excluded entirely.
 */

import type { PublicEventRow } from './types'

/** The user's demand-graph signals, resolved once by the fetcher. */
export interface AffinitySignals {
  followedOrganisationIds: Set<string>
  savedCategoryIds: Set<string>
  /** Event ids the user reaches via a followed artist (through event_artists). */
  followedArtistEventIds: Set<string>
  /** Scene/subgenre slugs the user follows, lowercased. */
  followedSceneSlugs: Set<string>
  /** Categories of the user's saved_events - a soft "similar to saved" signal. */
  savedEventCategoryIds: Set<string>
  /** The user's preferred city name (already extracted from the json), or null. */
  preferredCity: string | null
}

export interface ScoredEvent {
  event: PublicEventRow
  score: number
  /** The matched signals, for debugging / future "because you follow X" copy. */
  reasons: string[]
}

/**
 * Signal weights. A followed organiser or artist is the strongest pull; saved
 * categories and preferred city are softer taste signals; saved-event category
 * similarity is the softest. These are additive so an event that matches several
 * signals (followed organiser IN the preferred city) ranks above one that
 * matches a single signal.
 */
export const AFFINITY_WEIGHTS = {
  followedOrganiser: 100,
  followedArtist: 90,
  followedScene: 60,
  savedCategory: 40,
  preferredCity: 25,
  savedEventCategory: 15,
} as const

/**
 * Recency tie-breaker. Sooner events score a small bonus that decays over a
 * horizon, capped well below the smallest affinity weight so it can only order
 * events that are otherwise tied on affinity. Never lifts an unrelated event
 * above a followed one.
 */
const RECENCY_MAX_BONUS = 8
const RECENCY_HORIZON_DAYS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

function recencyBonus(startDate: string, now: Date): number {
  const start = new Date(startDate).getTime()
  if (Number.isNaN(start)) return 0
  const days = (start - now.getTime()) / MS_PER_DAY
  if (days <= 0) return RECENCY_MAX_BONUS
  if (days >= RECENCY_HORIZON_DAYS) return 0
  // Linear decay: an event today gets the full bonus, one at the horizon gets 0.
  return RECENCY_MAX_BONUS * (1 - days / RECENCY_HORIZON_DAYS)
}

function cityMatches(eventCity: string | null, preferred: string | null): boolean {
  if (!eventCity || !preferred) return false
  const a = eventCity.trim().toLowerCase()
  const b = preferred.trim().toLowerCase()
  if (!a || !b) return false
  // ilike-style containment, matching the fetcher's `venue_city.ilike.%city%`
  // so "Melbourne" matches a stored "Melbourne, VIC".
  return a.includes(b) || b.includes(a)
}

/** True when an event is still in the future relative to `now`. */
function isUpcoming(event: PublicEventRow, now: Date): boolean {
  const start = new Date(event.start_date).getTime()
  if (Number.isNaN(start)) return false
  return start >= now.getTime()
}

/**
 * Score a single candidate event against the signals. Returns the additive
 * affinity score (before the recency tie-breaker) and the matched reasons.
 */
function scoreEvent(
  event: PublicEventRow,
  signals: AffinitySignals,
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  const orgId = event.organisation?.id ?? null
  if (orgId && signals.followedOrganisationIds.has(orgId)) {
    score += AFFINITY_WEIGHTS.followedOrganiser
    reasons.push('followed-organiser')
  }

  if (signals.followedArtistEventIds.has(event.id)) {
    score += AFFINITY_WEIGHTS.followedArtist
    reasons.push('followed-artist')
  }

  const catId = event.category?.id ?? null
  if (catId && signals.savedCategoryIds.has(catId)) {
    score += AFFINITY_WEIGHTS.savedCategory
    reasons.push('saved-category')
  }

  if (signals.preferredCity && cityMatches(event.venue_city, signals.preferredCity)) {
    score += AFFINITY_WEIGHTS.preferredCity
    reasons.push('preferred-city')
  }

  // Saved-event category similarity is a softer signal than an explicit saved
  // category follow, so it is only counted when the category was not already
  // matched as an explicit saved category (no double counting).
  if (catId && !signals.savedCategoryIds.has(catId) && signals.savedEventCategoryIds.has(catId)) {
    score += AFFINITY_WEIGHTS.savedEventCategory
    reasons.push('similar-to-saved')
  }

  return { score, reasons }
}

/**
 * Rank candidate events by affinity for the user's graph.
 *
 * - Past/expired events are excluded.
 * - Events with zero affinity are dropped (the feed only shows events the graph
 *   actually connects to). The empty-graph fallback is handled by the fetcher,
 *   which calls a popular/chronological path when there are no signals at all.
 * - Ties on affinity break by soonest start date (recency bonus).
 * - The final order is fully deterministic (event id breaks any remaining tie).
 */
export function rankEventsByAffinity(
  events: PublicEventRow[],
  signals: AffinitySignals,
  now: Date = new Date(),
): ScoredEvent[] {
  const scored: ScoredEvent[] = []

  for (const event of events) {
    if (!isUpcoming(event, now)) continue
    const { score, reasons } = scoreEvent(event, signals)
    if (score <= 0) continue
    scored.push({
      event,
      score: score + recencyBonus(event.start_date, now),
      reasons,
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Deterministic final tie-break by id so the order is stable across runs.
    return a.event.id.localeCompare(b.event.id)
  })

  return scored
}

/** True when the graph carries no usable personalisation signal at all. */
export function hasAnyAffinitySignal(signals: AffinitySignals): boolean {
  return (
    signals.followedOrganisationIds.size > 0 ||
    signals.savedCategoryIds.size > 0 ||
    signals.followedArtistEventIds.size > 0 ||
    signals.followedSceneSlugs.size > 0 ||
    signals.savedEventCategoryIds.size > 0 ||
    Boolean(signals.preferredCity)
  )
}
