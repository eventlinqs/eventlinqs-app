import 'server-only'
import { buildDeterministicDraft } from '@/lib/ai/magic-start'
import { inferVisibility, looksLikePrivateResidence } from '@/lib/events/visibility'
import type { KitDraftPayload } from './draft-store'

/**
 * THE ANONYMOUS COMPOSER, ON THE DETERMINISTIC FLOOR.
 *
 * Founder ruling 9 August 2026 (0.2b): the anonymous route runs on the
 * deterministic floor BY DEFAULT and the AI budget is spent only on a claimed
 * draft. That inverts the cost problem instead of rationing it - a stranger
 * costs nothing, so there is no volume at which a stranger becomes a bill, and
 * the AI is a benefit of claiming rather than a cost of being visited.
 *
 * The consequence, stated plainly because it drives the design: the floor IS
 * the product for every anonymous visitor. It is not a fallback and it is not
 * degraded. Nothing on the surface says "limited", nothing apologises, and the
 * visitor never learns there was a model they did not get.
 *
 * This module also fixes the three defects the six-arrival walk found:
 *   D1 recurring phrasing, which three of six arrivals use
 *   D2 revenue framing shown to a free event, which is meaningless there
 *   D3 a private residence published as a street address
 */

/** How the kit talks about measurement, which differs for a free event (D2). */
export type ReachFraming = 'tickets' | 'attendance'

export type ComposeResult = {
  payload: KitDraftPayload
  /** Present when the organiser described something recurring (D1). */
  recurringNote: string | null
  /** What the reach panel leads with. */
  reachFraming: ReachFraming
  /** One plain question per gap. Never a blank field with no prompt. */
  questions: string[]
}

/**
 * Recurring phrasings. Recurrence is NOT built on this platform, and silently
 * picking one date from "first Tuesday every month" gives the organiser a
 * wrong event. So it is detected and answered honestly instead.
 */
const RECURRING = /\b(every|each)\s+(week|fortnight|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(first|second|third|fourth|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(weekly|fortnightly|monthly|recurring)\b/i

export function detectsRecurring(text: string): boolean {
  return RECURRING.test(text ?? '')
}

/**
 * The honest sentence for a recurring description. It never claims we support
 * recurrence and it never leaves the organiser wondering which date we chose.
 */
export function recurringNote(startDateLabel: string | null): string {
  const when = startDateLabel ? ` The first one is ${startDateLabel}.` : ''
  return `You said this one repeats. This sets up the first date and you can copy it for the next one in a couple of taps.${when}`
}

/** A plain question per unresolved field. Never jargon, never an error. */
const QUESTION_FOR: Record<string, string> = {
  'Date and time': 'When does it start?',
  'Venue': 'Where is it on?',
  'Venue name': 'Where is it on?',
  'Title': 'What do you want to call it?',
  'Ticket type and price': 'What does it cost to get in?',
  'Capacity': 'How many people can come?',
}

function plainQuestion(field: string): string {
  return QUESTION_FOR[field] ?? `What is the ${field.toLowerCase()}?`
}

/**
 * Build a complete kit payload from one paragraph, with no model call.
 *
 * `categoryNames` and `communitySlugs` come from the live taxonomy, so this
 * survives a taxonomy change without an edit here.
 */
export function composeFromText(opts: {
  text: string
  categoryNames: string[]
  communitySlugs: string[]
  nowIso?: string
}): ComposeResult {
  const text = (opts.text ?? '').trim()

  const draft = buildDeterministicDraft({
    description: text,
    categoryNames: opts.categoryNames,
    communitySlugs: opts.communitySlugs,
    nowIso: opts.nowIso,
  })

  // D3: a private residence never publishes its street address. The venue
  // name is kept (the organiser wrote it) but the address is held back and the
  // card shows the suburb.
  //
  // Checked against BOTH the extracted venue and the organiser's own sentence.
  // The extractor is deliberately conservative and often does not read "our
  // place in Belmont" as a venue at all, so testing the extracted field alone
  // silently failed to protect the exact arrival this rule exists for. Found by
  // the six-arrival test, which is why that test walks real sentences rather
  // than hand-built payloads.
  const addressHeldBack =
    looksLikePrivateResidence(draft.venue_name) || looksLikePrivateResidence(text)

  // Child safety: visibility is inferred from the organiser's own words and
  // defaults to unlisted. A private signal always wins.
  const visibility = inferVisibility(text)

  // D2: a free event has no revenue to attribute, so the kit must not promise
  // revenue attribution to it. The measurement is real either way; only the
  // noun changes.
  const reachFraming: ReachFraming =
    draft.is_free || visibility.visibility !== 'public' ? 'attendance' : 'tickets'

  const lowest =
    draft.ticket_tiers.length > 0
      ? Math.min(...draft.ticket_tiers.map(t => t.price))
      : null

  const payload: KitDraftPayload = {
    title: draft.title,
    summary: draft.summary,
    description: draft.description,
    startDate: draft.start_date,
    endDate: draft.end_date,
    venueName: draft.venue_name,
    // The composer never invents a suburb; it uses what the extractor read.
    venueSuburb: draft.venue_city,
    venueCity: draft.venue_city,
    categoryName: draft.category,
    isFree: draft.is_free,
    price: draft.is_free ? 0 : lowest,
    capacity: draft.ticket_tiers[0]?.total_capacity ?? null,
    // THE BILL is typed by the organiser, never inferred. There is no lineup
    // field in the extraction schema, and guessing a performer from prose
    // produces a share card for a pub. The composer asks instead.
    billNames: [],
    visibility: visibility.visibility,
    visibilityReason: visibility.reason,
    addressHeldBack,
    coverUrl: null,
    sourceText: text,
    unresolved: draft.unresolved,
  }

  return {
    payload,
    recurringNote: detectsRecurring(text) ? recurringNote(null) : null,
    reachFraming,
    questions: draft.unresolved.map(plainQuestion),
  }
}
