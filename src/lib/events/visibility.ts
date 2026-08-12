/**
 * THE ONE PLACE THAT DECIDES WHETHER AN EVENT IS PUBLIC.
 *
 * Founder ruling, 9 August 2026. A sixteenth birthday at a home address with
 * forty minors must never reach the public feed, a search index, the sitemap,
 * or the weekly digest. That is a child-safety requirement, not a preference,
 * and it is the reason every predicate in this file fails CLOSED.
 *
 * THE INVARIANT: an event is publicly discoverable only when its visibility is
 * exactly 'public'. Unlisted, private, null, undefined, and any value a future
 * migration introduces are all NOT discoverable. Written as an allow-list so a
 * new enum member can never silently become public.
 *
 * Before this module the platform had two independent bugs that both let a
 * private gathering leak:
 *
 *   1. The weekly city digest filtered `visibility !== 'private'`, which passes
 *      UNLISTED straight through into an email blast (`digest.ts`).
 *   2. The public event page emitted NO robots directive at all, so an unlisted
 *      event was fully indexable the moment Google found the URL, which it
 *      will, because the organiser shares that URL by design.
 *
 * Both are fixed by routing every caller through here.
 */

import type { EventVisibility } from '@/types/database'

/** The only value that means "anyone may find this". */
export const PUBLIC_VISIBILITY = 'public' satisfies EventVisibility

/**
 * The single predicate. Allow-list by construction: only an exact 'public'
 * passes, so an unrecognised or future visibility value is treated as private.
 */
export function isPubliclyDiscoverable(visibility: string | null | undefined): boolean {
  return visibility === PUBLIC_VISIBILITY
}

/**
 * The Next.js robots directive for an event page.
 *
 * A non-public event returns index:false AND follow:false, plus the googleBot
 * overrides, because Google honours the more specific googleBot block when both
 * are present and we want no ambiguity on a page that may show a home address.
 */
export function eventRobotsDirective(visibility: string | null | undefined) {
  if (isPubliclyDiscoverable(visibility)) return undefined
  return {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  } as const
}

/* ------------------------------------------------------------------ */
/* Inference for the public composer                                   */
/* ------------------------------------------------------------------ */

export type VisibilityInference = {
  visibility: EventVisibility
  /** Plain sentence shown to the organiser. Never jargon, never a warning. */
  reason: string
  /** Which rule fired, for tests and for the audit trail. */
  signals: string[]
}

/**
 * Signals that this is a PRIVATE gathering. Any hit forces unlisted and cannot
 * be overridden by a public signal, because the cost of being wrong is
 * asymmetric: a public event wrongly unlisted loses some reach and the
 * organiser can flip it in one tap, while a private one wrongly published
 * cannot be recalled from a search index or an email blast.
 */
const PRIVATE_SIGNALS: { name: string; test: RegExp }[] = [
  // A person plus an age is the birthday shape: "Ruby's 16th", "Mum's 60th".
  { name: 'birthday-age', test: /\b\w+['’]s\s+\d{1,3}(st|nd|rd|th)\b/i },
  { name: 'birthday-word', test: /\b(birthday|bday|christening|baptism|bar ?mitzvah|bat ?mitzvah)\b/i },
  { name: 'private-home', test: /\b(our|my)\s+(place|house|home|backyard|back yard|garden|studio|garage)\b/i },
  { name: 'private-word', test: /\b(private (party|event|function|gathering)|invite[- ]only|invitation only|closed event)\b/i },
  { name: 'family-occasion', test: /\b(engagement party|hens|hen[' ]?s night|bucks|buck[' ]?s night|baby shower|kitchen tea|wake|funeral|memorial)\b/i },
  { name: 'house-party', test: /\b(house ?party|housewarming|sleepover|slumber party)\b/i },
]

/**
 * Signals that this is genuinely a PUBLIC event. Deliberately demanding: a
 * public verdict needs real commercial or venue evidence, not merely the
 * absence of a private signal.
 */
const PUBLIC_SIGNALS: { name: string; test: RegExp }[] = [
  { name: 'ticketed', test: /\b(tickets?|ticketed|presale|pre[- ]sale|on sale|door sales?|ga\b|general admission|early bird)\b/i },
  { name: 'priced-entry', test: /\$\s?\d/ },
  { name: 'public-venue', test: /\b(pub|hotel|bar|club|venue|theatre|theater|hall|arena|stadium|gallery|library|park|showgrounds?|racecourse|town hall|rsl|amphitheatre)\b/i },
  { name: 'public-form', test: /\b(gig|festival|market|matinee|showcase|open mic|fundraiser|conference|expo|workshop|masterclass|screening|exhibition|tournament|parkrun)\b/i },
  { name: 'open-invite', test: /\b(everyone welcome|all welcome|open to the public|public event|free entry|rsvp online)\b/i },
]

/**
 * Decide a draft's visibility from the organiser's own words.
 *
 * THE RULE, in the founder's words: default anything the composer cannot
 * confirm is a public event to unlisted, never public.
 *
 * So the verdict is 'public' only when a public signal fires AND no private
 * signal fires. Silence returns unlisted. This is the opposite posture to
 * community detection, which is high-precision on the tick; here we are
 * high-precision on PUBLIC, because public is the direction that can hurt
 * somebody.
 */
export function inferVisibility(text: string): VisibilityInference {
  const source = (text ?? '').toLowerCase()

  const privateHits = PRIVATE_SIGNALS.filter(s => s.test.test(source)).map(s => s.name)
  if (privateHits.length > 0) {
    return {
      visibility: 'unlisted',
      reason:
        'This one stays off the public listings. Only people with your link can see it.',
      signals: privateHits,
    }
  }

  const publicHits = PUBLIC_SIGNALS.filter(s => s.test.test(source)).map(s => s.name)
  if (publicHits.length > 0) {
    return {
      visibility: 'public',
      reason: 'This one goes on the public listings so people can find it.',
      signals: publicHits,
    }
  }

  return {
    visibility: 'unlisted',
    reason:
      'This one stays off the public listings for now. Only people with your link can see it, and you can list it publicly whenever you like.',
    signals: [],
  }
}

/**
 * Whether a venue string looks like a private residence, used to hold the
 * street address back to suburb level. Same failing-closed posture: when in
 * doubt, show less.
 */
export function looksLikePrivateResidence(venueName: string | null | undefined): boolean {
  if (!venueName) return false
  return /\b(our|my)\s+(place|house|home|backyard|back yard|garden|studio|garage)\b|^home$|^house$/i.test(
    venueName.trim(),
  )
}
