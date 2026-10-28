/**
 * THE ONE CALL TO ACTION, FOR EVERY SURFACE THAT NAMES HOW TO GET IN (the release checklist of 28 October 2026,
 * section E, release blocking: C:\dev\START-16OCT\EVENTLINQS-RELEASE-CHECKLIST-28OCT.md).
 *
 * Five states, each with the only action it may offer and the only thing it may say about price:
 *   E1 free, no registration   "View event details"          "Free entry", only when free is VERIFIED
 *   E2 free, registration      "Register" (on the named site) says registration is required
 *   E3 paid, EventLinqs        "Get tickets"                  ticketing through EventLinqs
 *   E4 paid, outside           "View tickets at <provider>"   the outside destination named, never EventLinqs ticketing
 *   E5 price unknown           "View event details"          no price at all
 * E6: free is never inferred from a missing price. E7: an outside event is never called EventLinqs ticketing.
 *
 * Social cards, captions, the event page, share links and the Launch Kit all ask this function, and
 * tests/unit/events/cta-five-states.test.ts holds every one of them to it (a registered guard, cta-five-states).
 * A leaf: no imports, so the browser bundle and the server ask the same question for nothing.
 */

export type CtaState = 'free_open' | 'free_registration' | 'paid_native' | 'paid_external' | 'unknown_price'

export type CtaInput = {
  /** events.entry_mode: 'walk_in' is free entry with no ticket, held free by the database (20261021000020). */
  entryMode?: string | null
  /** The event's own ticket types at EventLinqs; inactive ones are ignored. */
  tiers?: readonly { price: number; is_active?: boolean | null }[] | null
  /** events.is_free: true only where someone checked it; null or false is never read as free. */
  isFree?: boolean | null
  /** The button's destination when the event sells elsewhere (WI3: external_ticket_url, the button's mirror). */
  externalTicketUrl?: string | null
  /** The kind of that button's link, when known (WI3's event_booking_links.kind). */
  externalKind?: string | null
  /** The name the button gives the outside site: the platform's ("Humanitix") or the host ("barwonclub.com.au"). */
  providerName?: string | null
}

export type Cta = {
  state: CtaState
  /** The button or the line that asks the person to act. */
  action: string
  /** The QR tile's words on a card. */
  scan: 'Scan for details' | 'Scan to register' | 'Scan to buy' | 'Scan for tickets'
  /** True only for E3 and an EventLinqs registration: "Ticketing by EVENTLINQS" may be said. */
  ticketingByEventLinqs: boolean
  /** True only for E1: "Free entry" may be said. */
  freeEntry: boolean
  /** True only for E2: the surface says registration is required. */
  registrationRequired: boolean
  /** Where it is bought or registered: 'EventLinqs', the outside site's name, or null. */
  where: string | null
  /**
   * The chip a social slide carries (the project manager's approved samples, 28 October 2026, 13:27): "Free · just turn
   * up", "Free · register first", "Tickets · at <provider>"; an unknown price carries none.
   */
  chip: string | null
}

function activeTiers(tiers: CtaInput['tiers']): { price: number }[] {
  return (tiers ?? []).filter((t) => t.is_active !== false)
}

/** Which of the five states an event is in, read from what is stored and never guessed. */
export function ctaStateOf(input: CtaInput): CtaState {
  if (input.entryMode === 'walk_in') return 'free_open'
  const external = typeof input.externalTicketUrl === 'string' && input.externalTicketUrl.trim() !== ''
  if (external) return input.externalKind === 'free_register' || input.isFree === true ? 'free_registration' : 'paid_external'
  const tiers = activeTiers(input.tiers)
  if (tiers.length > 0) return tiers.some((t) => t.price > 0) ? 'paid_native' : 'free_registration'
  return input.isFree === true ? 'free_open' : 'unknown_price'
}

/** The call to action for an event: the one function every surface asks. */
export function ctaFor(input: CtaInput): Cta {
  const state = ctaStateOf(input)
  const external = typeof input.externalTicketUrl === 'string' && input.externalTicketUrl.trim() !== ''
  const outside = input.providerName?.trim() || null
  switch (state) {
    case 'free_open':
      return { state, action: 'View event details', scan: 'Scan for details', ticketingByEventLinqs: false, freeEntry: true, registrationRequired: false, where: null, chip: 'Free · just turn up' }
    case 'free_registration':
      return external
        ? { state, action: outside ? `Register free on ${outside}` : 'Register free', scan: 'Scan to register', ticketingByEventLinqs: false, freeEntry: false, registrationRequired: true, where: outside, chip: outside ? `Free · register first on ${outside}` : 'Free · register first' }
        : { state, action: 'Register', scan: 'Scan to register', ticketingByEventLinqs: true, freeEntry: false, registrationRequired: true, where: 'EventLinqs', chip: 'Free · register first' }
    case 'paid_native':
      return { state, action: 'Get tickets', scan: 'Scan to buy', ticketingByEventLinqs: true, freeEntry: false, registrationRequired: false, where: 'EventLinqs', chip: 'Tickets · on EventLinqs' }
    case 'paid_external':
      return { state, action: outside ? `View tickets at ${outside}` : 'View tickets', scan: 'Scan for tickets', ticketingByEventLinqs: false, freeEntry: false, registrationRequired: false, where: outside, chip: outside ? `Tickets · at ${outside}` : 'Tickets · sold elsewhere' }
    case 'unknown_price':
      return { state, action: 'View event details', scan: 'Scan for details', ticketingByEventLinqs: false, freeEntry: false, registrationRequired: false, where: null, chip: null }
  }
}

/** The words "Free, registration required" (E2's required clarity). */
export const FREE_REGISTRATION_REQUIRED = 'Free, registration required'

/**
 * The price line beside the action, the only one each state may carry: E1 "Free entry"; E2 "Free, registration
 * required"; E3 the price of our own ticket types (the caller's priceLabel, from src/lib/events/price-label.ts); E4 a
 * price the outside link was checked at within the last day, else "Tickets on <provider>"; E5 nothing at all.
 */
export function ctaPriceLine(cta: Cta, prices: { native?: string | null; outsideChecked?: string | null } = {}): string | null {
  switch (cta.state) {
    case 'free_open':
      return 'Free entry'
    case 'free_registration':
      return FREE_REGISTRATION_REQUIRED
    case 'paid_native':
      return prices.native?.trim() || null
    case 'paid_external':
      return prices.outsideChecked?.trim() || (cta.where ? `Tickets on ${cta.where}` : 'Tickets are sold elsewhere')
    case 'unknown_price':
      return null
  }
}
