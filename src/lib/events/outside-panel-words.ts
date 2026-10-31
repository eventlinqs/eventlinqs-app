import { TICKETS_SOLD_ELSEWHERE_BODY, TICKETS_SOLD_ELSEWHERE_HEADING } from '@/lib/payments/sale-status'

/**
 * WHAT THE OUTSIDE NIGHT's PANEL SAYS (the CONTROLLER's 17:55 (6), 31 October 2026). A night sold on another site says
 * tickets; a free night whose organiser takes registrations on its own site says registration, free, and where (the
 * same fact the hero's 'Register free on <site>' states, src/lib/events/cta.ts registrationRequired). Nothing here is
 * invented: the host is the destination's own, and where it is unknown the words say so. Pure.
 */
export function outsidePanelWords(input: { registration: boolean; bookingInHero: boolean; host: string | null }): { heading: string; body: string } {
  if (input.registration) {
    const where = input.host ?? "the organiser's site"
    return {
      heading: 'Registration is on another site',
      body: input.bookingInHero ? `Registration is free, on ${where}.` : `Registration is free, on ${where}. The button below takes you there.`,
    }
  }
  return {
    heading: TICKETS_SOLD_ELSEWHERE_HEADING,
    body: input.bookingInHero ? `This organiser sells tickets for this event on ${input.host ?? 'another site'}.` : TICKETS_SOLD_ELSEWHERE_BODY,
  }
}
