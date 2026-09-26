/**
 * Founding Organiser offer - the content slot for the organiser landing.
 *
 * The offer band renders ONLY while `enabled` is true, so the founder can turn
 * the programme on and off with a one-line change and the page needs no
 * template edit. Every claim here must stay true in the product: the fee
 * holiday is delivered through the real per-organiser override in
 * `pricing_rules` (the one fee source), and the onboarding promise is the
 * growth plan's concierge lever.
 *
 * THE TERMS ARE LAW 24 (founder ruling, 20 September 2026): "Every new
 * organiser gets six months free, counted from the date they register or set
 * up on EventLinqs. Not a cap of 50. Every organiser. After six months the
 * standard fee applies." Plus 3 months per organiser referred who runs an
 * event, unchanged. The window is stamped by the database at registration
 * (trg_registration_fee_free_window, migration 20260926000001), so the copy
 * below is what the charge does rather than what an invitation might grant.
 *
 * Until 26 September 2026 this band promised the offer to "the first 50
 * organisers anywhere in the country", invited personally. There is no cap and
 * nothing to be invited to: every organiser in Australia holds the six months
 * from the day they register, and the CTA goes straight to signup.
 *
 * LAW 24 AS RULED (26 September 2026): every number, the badge name and the
 * national scope below are RENDERED from src/lib/payments/founding-waiver.ts,
 * the one module that holds the offer. Two points were removed that day
 * because they cannot be true for every organiser in the country with no cap:
 * "Hands-on onboarding: your first event set up with you, end to end" and "A
 * direct line to the founder, not a ticket queue". Whether to restore either,
 * in a form that holds at scale, is the founder's decision.
 */
import {
  FOUNDING_BADGE_NAME,
  FOUNDING_INITIAL_MONTHS,
  FOUNDING_INITIAL_MONTHS_WORD,
  FOUNDING_OFFER_SCOPE,
  FOUNDING_TERMS,
} from '@/lib/payments/founding-waiver'

const SIX = FOUNDING_INITIAL_MONTHS_WORD.charAt(0).toUpperCase() + FOUNDING_INITIAL_MONTHS_WORD.slice(1)

export interface FoundingOffer {
  enabled: boolean
  eyebrow: string
  title: string
  body: string
  points: string[]
  ctaLabel: string
  ctaHref: string
  /**
   * The second button beside the signup CTA (close-out OL1): the way to say
   * yes to the founder rather than to a form. Every message sent from
   * 12 September 2026 promises that Lawal sets the first event up personally,
   * and the page had no way to take him up on it.
   *
   * THE ADDRESS IS NOT HERE, and that is deliberate. Founder ruling R2 of
   * 3 August 2026 removed a personal address from source and put every
   * destination behind one definition; this href is built from that definition
   * (src/lib/email/sender.ts, contactMailto) at render, so the page can never
   * publish a private mailbox.
   */
  founderCtaLabel: string
  /** Shown under the founder button, in his own words. */
  founderCtaNote: string
  /** The subject line the reply arrives with, so it can be found and answered. */
  founderCtaSubject: string
  /** Small print under the CTA; keep honest and short. */
  note: string
}

export const FOUNDING_OFFER: FoundingOffer = {
  enabled: true,
  eyebrow: `${SIX} months free · every organiser`,
  title: `Your first ${FOUNDING_INITIAL_MONTHS_WORD} months are on us.`,
  body: `${FOUNDING_TERMS.scope} ${FOUNDING_TERMS.initial} ${FOUNDING_TERMS.after}`,
  points: [
    `${FOUNDING_INITIAL_MONTHS} months completely fee-free on every paid ticket, applied to your account through the same pricing engine that runs checkout`,
    FOUNDING_TERMS.referral,
    `${FOUNDING_TERMS.badge} The name and the badge are yours from the day you register.`,
  ],
  ctaLabel: 'Create your organiser account',
  ctaHref: '/organisers/signup',
  founderCtaLabel: 'Set up my event with Lawal',
  founderCtaNote: 'I set up the first events myself, on a 20 minute call. Lawal Adams, founder.',
  founderCtaSubject: FOUNDING_BADGE_NAME,
  note: `Start free today: you can build, publish and sell straight away, wherever in ${FOUNDING_OFFER_SCOPE} you are. Your ${FOUNDING_INITIAL_MONTHS_WORD} months begin the day you register and are applied to your account before your first on-sale.`,
}
