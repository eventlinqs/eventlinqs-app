/**
 * Founding Organiser offer - the content slot for the organiser landing.
 *
 * The offer band renders ONLY while `enabled` is true, so the founder can turn
 * the programme on and off with a one-line change and the page needs no
 * template edit. Every claim here must stay true in the product: the fee
 * holiday is delivered through the real per-organiser override in
 * `pricing_rules` (the one fee source), and the onboarding promise is the
 * growth plan's concierge lever. The offer terms below are the locked 2026
 * founder ruling: invite-only, first 50 across Geelong and Melbourne, 6
 * months fee-free, extendable 3 months per organiser referred.
 */
export interface FoundingOffer {
  enabled: boolean
  eyebrow: string
  title: string
  body: string
  points: string[]
  ctaLabel: string
  ctaHref: string
  /** Small print under the CTA; keep honest and short. */
  note: string
}

export const FOUNDING_OFFER: FoundingOffer = {
  enabled: true,
  eyebrow: 'Founding organisers · invite-only',
  title: 'The first 50 build it with us.',
  body: 'EventLinqs launches city by city, starting with Geelong and Melbourne. The first 50 organisers across those two cities are invited personally as Founding Organisers: they pay nothing to the platform while they build, and they shape what we build next.',
  points: [
    '6 months completely fee-free on every paid ticket, applied to your account through the same pricing engine that runs checkout',
    '3 more fee-free months for every organiser you refer who runs an event',
    'Hands-on onboarding: your first event set up with you, end to end',
    'A direct line to the founder, not a ticket queue',
  ],
  ctaLabel: 'Register for an invitation',
  ctaHref: '/waitlist',
  note: 'Invitations are limited to the first 50 organisers across Geelong and Melbourne and go out personally. Founding terms are applied to your account before your first on-sale.',
}
