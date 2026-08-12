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

/**
 * Tighten a title that swallowed the whole sentence.
 *
 * FOUND BY THE LIVE WALK, not by a unit test. The deterministic title takes
 * the organiser's opening clause by splitting on full stops, which is right
 * for prose and wrong for the way people actually type an event: one line of
 * comma-separated details and no full stop anywhere. So the birthday arrived
 * titled "Ruby's 16th, Saturday 20th September, 6pm at our place in Belmont,
 * about 40 kids, no charge", which is the entire input and is not a title a
 * promoter would be pleased to see.
 *
 * The floor is the product for every anonymous visitor (founder ruling 0.2b),
 * so a merely-competent title is a launch defect rather than a nicety.
 *
 * The rule: cut at the first comma that introduces a DETAIL - a date, a time,
 * a price, a count, or a free-entry marker. A comma that merely continues the
 * name ("Basement 45, Geelong") is left alone. Fixed here in the composer's
 * own layer rather than in the shared extractor, which the organiser wizard
 * also uses and which another session owns.
 */
const DETAIL_AFTER_COMMA =
  /^\s*((mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\w*\b|\d{1,2}(st|nd|rd|th)?\b|\d{1,2}\s*(am|pm)\b|\$|free\b|from \$|doors\b|first\b|second\b|third\b|fourth\b|last\b|every\b|about \d|approx|around \d|\d+\s+(kids|places|stalls|comics|people|guests|seats|tickets))/i

export function tightenTitle(title: string): string {
  const parts = title.split(',')
  if (parts.length < 2) return title.trim()

  let kept = parts[0]!.trim()
  for (let i = 1; i < parts.length; i += 1) {
    if (DETAIL_AFTER_COMMA.test(parts[i]!)) break
    // A comma that continues the name rather than starting the details.
    kept = `${kept}, ${parts[i]!.trim()}`
  }
  const clean = kept.trim().replace(/[,;:\s]+$/, '')
  return clean.length >= 3 ? clean : title.trim()
}

/**
 * The composer's summary, which may only ever ADD to what is already on
 * screen.
 *
 * Found by reading a rendered kit rather than by a test. The shared
 * buildSummaryFallback leads with the date, which is right for a listing line
 * standing on its own and wrong here, because every surface that shows this
 * summary ALSO prints the date beside it: the event page hero, all three
 * cards, and every caption. The result read as a stutter. The Instagram
 * caption said the date twice and the Facebook one said it three times, which
 * is the first thing a promoter notices and the first thing they delete.
 *
 * So this carries only what the title and the date lines do not: where it is,
 * and what it costs, and each of those only when it genuinely adds something.
 *
 * An EMPTY summary is a correct and expected outcome. A line that repeats
 * what is directly above it is worse than no line at all, and the surfaces
 * that render this all treat an empty summary as "do not draw it".
 */
/** Clauses the structured fields already carry, so the summary must not. */
const DATE_CLAUSE =
  /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\w*\b|\b\d{1,2}(st|nd|rd|th)\b|\b\d{1,2}\s*(am|pm)\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(every|each|weekly|fortnightly|monthly|first|second|third|fourth|last)\b|\bdoors?\b/i
const PRICE_CLAUSE = /\$\s?\d|\bfree\b|\bno charge\b|\bno cost\b|\ba head\b|\bpresale\b|\bon the door\b/i

function additiveSummary(facts: {
  title: string
  sourceText: string
  venueName: string
  venueCity: string
  addressHeldBack: boolean
  isFree: boolean
  lowestPrice: number | null
}): string {
  const titleLower = facts.title.toLowerCase()

  // Everything the caption engine and the event page already print on their
  // own lines, so a clause matching any of it would be a stutter.
  const known = [facts.venueName, facts.venueCity].filter(Boolean).map(s => s.toLowerCase())

  const leftovers = facts.sourceText
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => {
      const lower = part.toLowerCase()
      if (titleLower.includes(lower)) return false
      if (lower.includes(titleLower) && titleLower.length > 3) return false
      if (DATE_CLAUSE.test(part)) return false
      if (PRICE_CLAUSE.test(part)) return false
      if (known.some(k => lower.includes(k))) return false
      // Privacy is absolute here: a clause naming a private residence never
      // becomes copy, whatever else it might have carried (D3).
      if (looksLikePrivateResidence(part)) return false
      return true
    })

  if (leftovers.length > 0) {
    const detail = leftovers.join(', ')
    return `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.`.slice(0, 200)
  }

  // Nothing extra was written, so fall back to a fact rather than a blank line
  // (the arrivals suite refuses an empty listing line, correctly). Place first,
  // because the caption prints the price on its own line but nothing else
  // prints the venue.
  const place = [facts.addressHeldBack ? '' : facts.venueName, facts.venueCity]
    .filter(Boolean)
    .filter(part => !titleLower.includes(part.toLowerCase()))
    .join(', ')
  if (place) return `${place}.`.slice(0, 200)

  // The SAME rule the cards (draft-artefacts priceLabelFor) and the event page
  // preview already apply: no price found reads as free. A third rule here
  // would let the listing line contradict the card sitting beside it.
  return facts.isFree || facts.lowestPrice == null || facts.lowestPrice <= 0
    ? 'Free entry.'
    : `Tickets from $${Math.round(facts.lowestPrice)}.`
}

/**
 * A plain question per unresolved item. Never jargon, never an error.
 *
 * EVERY item recomputeUnresolved can emit is mapped here, plus the one notice
 * pushed separately beside it (magic-start.ts, the weekday mismatch). The map
 * used to cover six labels, two of which are never emitted, and the fallback
 * wrapped everything else in "What is the ...?". That produced, on the first
 * screen a stranger sees:
 *
 *   "What is the check the date: the day you named does not fall on that date?"
 *
 * because the weekday notice is a SENTENCE, not a field name. It also produced
 * "What is the discovery tags?", which does not agree in number.
 */
const QUESTION_FOR: Record<string, string> = {
  Title: 'What do you want to call it?',
  'Short summary': 'How would you sum it up in one line?',
  Description: 'What else should people know before they come?',
  'Date and time': 'When does it start?',
  Venue: 'Where is it on?',
  'Venue name': 'Where is it on?',
  'Venue street address': 'What is the street address?',
  'Ticket type and price': 'What does it cost to get in?',
  Capacity: 'How many people can come?',
  'Discovery tags': 'What words would someone search for to find this?',
  'Check the date: the day you named does not fall on that date':
    'Can you check the date? The day you named does not fall on that date.',
}

function plainQuestion(field: string): string {
  const mapped = QUESTION_FOR[field]
  if (mapped) return mapped
  // An item that already reads as a sentence is passed through rather than
  // wrapped, so a future notice added beside a field name cannot come out
  // garbled the way the weekday one did.
  const alreadyASentence = /[.:?]/.test(field) || field.trim().split(/\s+/).length > 4
  if (alreadyASentence) return field.trim().replace(/[.\s]*$/, '.')
  return `What is the ${field.toLowerCase()}?`
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

  const title = tightenTitle(draft.title)

  // THE REPETITION FIX, found by reading a rendered kit rather than a test.
  //
  // buildSummaryFallback is careful to strip the title out of its own anchor so
  // the line never says the same thing twice. It was being handed the RAW
  // title, though, which for the way people actually type ("Warehouse party at
  // the Barwon Club, Marlo Reyes b2b Kita, Sat 20th, doors 10, $25 presale") is
  // the entire sentence. So the summary re-stated the whole input, and then
  // every caption printed the date and price again underneath it. The
  // Instagram caption said the date twice and the Facebook one said it three
  // times, which is the first thing a promoter would notice and the first
  // thing they would delete.
  //
  // Recomposing from the TIGHTENED title fixes it at the source: the summary
  // carries the event's name, not the organiser's whole sentence.
  const summary = additiveSummary({
    title,
    sourceText: text,
    // A held-back address hides the VENUE, never the suburb. That is the whole
    // shape of the rule (D3): a stranger sees Belmont, not the street. Blanking
    // the city as well left the birthday with nothing to say and produced an
    // empty listing line, which the arrivals suite correctly refused.
    venueName: draft.venue_name,
    venueCity: draft.venue_city,
    addressHeldBack,
    isFree: draft.is_free,
    lowestPrice:
      draft.ticket_tiers.length > 0
        ? Math.min(...draft.ticket_tiers.map(t => t.price))
        : null,
  })

  const payload: KitDraftPayload = {
    title,
    summary,
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
