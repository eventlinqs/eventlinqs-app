/**
 * THE PLATFORM'S OWN LEGAL IDENTITY. One source (close-out UX2.1).
 *
 * WHY THIS FILE EXISTS. The ABN was written out by hand in TWELVE places across
 * nine files, in three formats, beside TWO different postal addresses and THREE
 * different descriptions of the entity. The footer, the About page, the press
 * page, four legal pages, the ticket confirmation email and the refund email
 * each carried their own copy.
 *
 * That is a legal defect rather than an untidiness. The entity taking ticket
 * money must be the entity named on the receipt, and when the Pty Ltd is
 * registered the ABN changes. Thirteen hand-edits is a job somebody does twelve
 * of, and the one that is missed is on a tax document.
 *
 * THE TRAP THIS FILE AND ITS GUARD EXIST TO CLOSE. In four of those files the
 * number is broken across two source lines:
 *
 *     ... trading as EventLinqs, ABN 30 837
 *     447 587, PO Box 141, Newcomb VIC 3219, Australia. ...
 *
 * A line-based search for the number finds nine of twelve, reports a clean tree,
 * and leaves three wrong on the legal pages. `scripts/guards/one-platform-entity.mjs`
 * normalises whitespace across line boundaries before it matches, for that
 * reason and no other.
 *
 * WHAT IS THE FOUNDER'S, AND WHAT IS NOT. The VALUE below is his: the close-out
 * records him verifying it at abr.business.gov.au. Everything else - that it is
 * written once, that it passes the ATO checksum, that no surface may carry its
 * own copy - is enforced here and by the guard. When the number changes it is a
 * one-line edit in this file.
 */

import { formatAbn } from '@/lib/tax/abn'

/**
 * The registered ABN, digits only.
 *
 * Passes the ATO modulus-89 check (the repository's own `isValidAbn`, which the
 * guard runs against this constant on every build, so a typo in a future edit
 * cannot ship). Australian Business Register, ABN format and check algorithm.
 */
const ABN_DIGITS = '30837447587'

/**
 * The entity, as at 9 September 2026.
 *
 * Structure is a sole trader today and converts to a Pty Ltd, which is stated
 * on the About page and is why `entityType` is a field rather than a sentence
 * baked into six pages.
 */
export const PLATFORM_ENTITY = {
  /** The person or company legally trading. */
  legalName: 'Lawal Adams',
  /** The name the public sees. */
  tradingName: 'EventLinqs',
  /** Plain-language structure, for the sentences that describe it. */
  entityType: 'Australian sole trader',
  /** Digits only. Use `abnFormatted` for display. */
  abn: ABN_DIGITS,
  /** The ABR's own 2-3-3-3 display grouping, via the shared formatter. */
  abnFormatted: formatAbn(ABN_DIGITS),
  /**
   * The full postal address, for legal pages and anywhere an address must be
   * servable. This is the one the terms, privacy, cookies and organiser-terms
   * pages already carried.
   */
  postalAddress: 'PO Box 141, Newcomb VIC 3219, Australia',
  /**
   * The short locality, for an email footer where a PO Box reads as clutter.
   * Newcomb is in Geelong, so this is the same place at lower resolution, not
   * a second address. Both were already live and neither was derived.
   */
  locality: 'Geelong VIC, Australia',
} as const

/**
 * "Lawal Adams, trading as EventLinqs" - the phrase the legal pages open with.
 */
export function tradingAsLine(): string {
  return `${PLATFORM_ENTITY.legalName}, trading as ${PLATFORM_ENTITY.tradingName}`
}

/**
 * The single line an email footer and a receipt carry: who took the money, its
 * ABN, and where it is. Used by the ticket confirmation and the refund email so
 * the two can never describe the seller differently.
 */
export function entityFooterLine(): string {
  return `${PLATFORM_ENTITY.tradingName} (${PLATFORM_ENTITY.legalName}), ABN ${PLATFORM_ENTITY.abnFormatted}, ${PLATFORM_ENTITY.locality}.`
}

/**
 * The full legal identification: name, trading name, ABN and postal address.
 * What the terms and privacy pages need in their opening sentence.
 */
export function entityLegalLine(): string {
  return `${tradingAsLine()}, ABN ${PLATFORM_ENTITY.abnFormatted}, ${PLATFORM_ENTITY.postalAddress}`
}
