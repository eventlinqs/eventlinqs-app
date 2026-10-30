import { ctaFor, type CtaInput } from './cta'

/**
 * WHAT THE EVENT PAGE MAY PROMISE ABOUT THE TICKET ITSELF (the PROJECT MANAGER's 13:10 of 30 October 2026; the master
 * checklist's L6, M18 and M28).
 *
 * Kate Ceberano's night at Geelong Arts Centre is sold on geelongartscentre.org.au and has no ticket type here, and her
 * page said 'Your QR ticket lives in your email', 'Cancelled events are refunded automatically' and 'The booking fee is
 * not returned'. Each block was written for our own tickets and none asked who sells the ticket.
 *
 * One answer now, from the one call to action (cta.ts): only where EventLinqs issues the ticket (E3, our paid tickets,
 * and our own free registration) may the page promise a QR ticket at the door, state our refund policy, or show the
 * trust row. An outside night, a listing with no checked price and a walk-in night promise none of them.
 *
 * Once our own night is over the refund policy stays (a holder may still need it, and a cancelled night is refunded in
 * full); the door and the trust row go, since nothing is bought or scanned any more.
 */
export type EventPagePromises = {
  /** "Your QR ticket lives in your email and your account" at the door. */
  qrTicket: boolean
  /** The Refund policy block: the window, the booking fee and automatic refunds. */
  refundPolicy: boolean
  /** The trust row under the hero button: secure checkout, refund policy. */
  trustSignals: boolean
}

export function eventPagePromises(input: CtaInput): EventPagePromises {
  const ours = ctaFor({ ...input, over: false }).ticketingByEventLinqs
  const over = input.over === true
  return { qrTicket: ours && !over, refundPolicy: ours, trustSignals: ours && !over }
}
