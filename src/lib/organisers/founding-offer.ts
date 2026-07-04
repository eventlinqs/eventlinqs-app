/**
 * Founding Organiser offer - the content slot for the organiser landing.
 *
 * The offer band renders ONLY while `enabled` is true, so the founder can turn
 * the programme on and off with a one-line change and the page needs no
 * template edit. Every claim here must stay true in the product: the reduced
 * fee is delivered through the real per-organiser override in `pricing_rules`
 * (the one fee source), and the onboarding promise is the growth plan's
 * concierge lever. Never add a number or a scarcity counter here that the
 * platform cannot substantiate.
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
  eyebrow: 'Founding organisers',
  title: 'Be one of the organisers we build this with.',
  body: 'EventLinqs is launching across Australia now, and the first organisers on the platform shape it. Founding organisers get a reduced platform fee set personally for them, direct onboarding with the founder, and first say in what we build next.',
  points: [
    'A reduced platform fee, set for your account through the same pricing engine that runs checkout',
    'Hands-on onboarding: your first event set up with you, end to end',
    'A direct line to the founder, not a ticket queue',
  ],
  ctaLabel: 'Claim your founding spot',
  ctaHref: '/organisers/signup',
  note: 'Founding terms are agreed with you directly and applied to your account before your first on-sale.',
}
