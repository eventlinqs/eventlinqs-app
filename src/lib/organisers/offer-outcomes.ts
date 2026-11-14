/**
 * THE ORGANISER OFFER, LED BY VALUE (the PM's version 2 of 14 November 2026, 21:05, and version 3 of 15 November, 00:22:
 * C:\dev\START-16OCT\EL-ORGANISER-OFFER-14NOV.md). LAW 24 is retired (Lawal, 15 November 2026, 00:19): every organiser
 * pays the platform fee from the first paid ticket, so the offer leads on what EventLinqs does for an event, never on
 * free months. Lawal, 00:37: the organisers page "in the leaders' voice", the five outcomes over the stack.
 *
 * The leaders lead the same way (C:\dev\START-16OCT\EL-LAW24-RETIRED-15NOV\leaders-organisers.md, captured 15 November
 * 2026 at 390 and 1440): Eventbrite's organiser page groups its value as "Event hosting made easy" and "Reach the right
 * people"; Humanitix's as "Create your event in minutes", "Every feature hosts need" and "Grow your events".
 *
 * THE INTEGRITY RULE (the offer file's own): every line says only what runs today. No guarantee ("sell out", "every
 * channel", "exactly where every ticket came from"), no number that is not read live, and nothing not yet built: the
 * follow feature is ordered, not live, so "Build your audience" names the attendee list and opted-in email only.
 * Each outcome names where in the product it runs, so a reader can check it.
 */

export interface OfferOutcome {
  /** A stable key, for tests and anchors. */
  key: 'discovered' | 'sell' | 'promote' | 'audience' | 'control'
  title: string
  body: string
  /** Where it runs today, for a reader checking the line (never rendered). */
  runsIn: string
}

export const OFFER_HEADLINE = 'Your event deserves more than a ticketing link.'

export const OFFER_SUBLINE = 'Discovery, selling, promotion and your audience, in one place.'

export const OFFER_OUTCOMES: readonly OfferOutcome[] = [
  {
    key: 'discovered',
    title: 'Get discovered',
    body: "Your event is listed on your city's guide, where people look for what's on, and its page carries the event details search engines read.",
    runsIn: 'src/components/features/city-guide (law 16: every published event on its guide); src/components/features/events/event-schema-jsonld.tsx',
  },
  {
    key: 'sell',
    title: 'Sell tickets',
    body: 'Paid or free tickets, tiers, early bird and discount codes, with the full price shown from the first click. Publish and start selling straight away.',
    runsIn: 'the event form and its tiers; dashboard/events/[id]/discounts; the all-in price (src/lib/payments/fee-math.ts); publishing before a payout method (train 23)',
  },
  {
    key: 'promote',
    title: 'Promote your event',
    body: 'The moment you publish, your launch kit is ready: a tracked link for each place you share it, a print-ready QR poster, captions, and a link for each act on your lineup.',
    runsIn: 'the publish success screen: src/components/launch-kit, src/components/broadcast/lineup-loop-panel.tsx',
  },
  {
    key: 'audience',
    title: 'Build your audience',
    body: 'Every attendee relationship is yours. Export your full attendee list any time, and email the attendees who opt in.',
    runsIn: 'dashboard/events/[id]/attendees and its export route; the opted-in attendee email',
  },
  {
    key: 'control',
    title: 'Keep control',
    body: 'One published fee per paid ticket, passed on to the buyer or absorbed by you. Your refund policy, your sales on your dashboard, and your ticket money paid to your own account after the event.',
    runsIn: 'events.fee_pass_type; the refund policy setting; the organiser dashboard; payouts to the connected account (A2)',
  },
]
