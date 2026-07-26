/**
 * The organiser guide library: types.
 *
 * A guide is long-form, evergreen teaching for organisers, distinct from the
 * Help Centre (src/lib/help-content.ts), which is short question-and-answer
 * support. Guides are structured data, not markdown, so the renderer owns the
 * design system and no guide can ever paint its own styles.
 *
 * Two blocks carry live platform values rather than hardcoded numbers, per the
 * Fee system law (never hardcode a fee, never let a document drift from the
 * charged value): text may contain {{fee}} and {{payoutDays}} tokens, which the
 * renderer substitutes from the one pricing resolver at request time.
 */

export type GuideCategoryId = 'set-up' | 'seating' | 'promote' | 'money' | 'event-day'

export type GuideCategory = {
  id: GuideCategoryId
  title: string
  blurb: string
}

/** A screenshot captured from the running app. Never an illustration. */
export type GuideShot = {
  /** Path under /public, e.g. /guides/creating-your-first-event-1.png */
  src: string
  alt: string
  caption: string
  /** Captured viewport width, shown in the caption rule. */
  viewport?: 1440 | 390
}

export type GuideBlock =
  | { kind: 'para'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'steps'; items: { title: string; text: string }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'shot'; shot: GuideShot }
  | { kind: 'note'; title: string; text: string }
  /** The one thing that most often goes wrong here, and how to avoid it. */
  | { kind: 'pitfall'; title: string; text: string }

export type Guide = {
  slug: string
  title: string
  /** One line, used on the hub card and as the meta description. */
  summary: string
  category: GuideCategoryId
  /** Honest reading time in minutes, derived from the written body. */
  minutes: number
  /** ISO date the guide was last reviewed against the running app. */
  updated: string
  /** The lead screenshot: the hub card image and the top of the guide. */
  hero: GuideShot
  blocks: GuideBlock[]
  /** Other guide slugs, rendered as a cross-link rail at the foot. */
  related: string[]
  /** Extra terms the hub search should match beyond title and summary. */
  keywords: string[]
  /**
   * The in-product surface this guide backs, when there is one. The guidance
   * registry reads this so a surface and its guide can never drift apart.
   */
  surface?: 'buyer-seat-map' | 'room-studio'
}

/** Live platform values substituted into {{token}} placeholders at render. */
export type GuideLiveValues = {
  /** e.g. "3.5% + AUD 0.99", resolved through the one pricing resolver. */
  fee: string
  /** Days after an event ends before its funds are released for disbursement. */
  payoutDays: number
}
