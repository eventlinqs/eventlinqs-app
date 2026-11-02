/**
 * ORGANISER ACTIVATION, ONE ANSWER (V3 item 6, the CONTROLLER's 05:45 of 1 November 2026; plan.json's ticketing gap: 0
 * upcoming nights sold through EventLinqs that morning). An organiser is activated when their first paid ticket sells
 * through us. The steps between, in order, and where each organiser stops, come from records the platform already
 * writes, so drop-off at every step is counted, never guessed:
 *
 *   claim_verified  their listing claim verified (only for an organiser who came by a claim)
 *   organisation  their organisation exists
 *   payouts     Stripe lets them take money (the sale decision, src/lib/payments/sale-status.ts)
 *   tickets     an upcoming night carries an active paid ticket of ours (not an outside link)
 *   published   that night is published
 *   checkout_ready  the sale decision says the night is on sale: a buyer can reach checkout
 *   first_sale  a paid order has gone through
 *
 * A leaf, so the rule is tested without a database. The reader is ./activation-read.ts; the funnel (V3 item 3) and the
 * organiser's own checklist (the dashboard) both ask this one function.
 */

export const ACTIVATION_STEPS = ['claim_verified', 'organisation', 'payouts', 'tickets', 'published', 'checkout_ready', 'first_sale'] as const
export type ActivationStep = (typeof ACTIVATION_STEPS)[number]

/** What the records say, each step's time where it is done, null where it is not. */
export type ActivationFacts = {
  /** True when the organiser's account came by a listing claim; the claim step applies only then. */
  readonly cameByClaim: boolean
  readonly claimVerifiedAt: string | null
  readonly organisationAt: string | null
  readonly payoutsAt: string | null
  readonly ticketsAt: string | null
  readonly publishedAt: string | null
  readonly checkoutAt: string | null
  readonly firstSaleAt: string | null
}

export type ActivationAnswer = {
  readonly steps: readonly { readonly step: ActivationStep; readonly done: boolean; readonly at: string | null }[]
  /** The first step not done, where this organiser has stopped; null when they have sold. */
  readonly next: ActivationStep | null
  readonly activated: boolean
}

const AT: Record<ActivationStep, keyof ActivationFacts> = {
  claim_verified: 'claimVerifiedAt',
  organisation: 'organisationAt',
  payouts: 'payoutsAt',
  tickets: 'ticketsAt',
  published: 'publishedAt',
  checkout_ready: 'checkoutAt',
  first_sale: 'firstSaleAt',
}

/**
 * The organiser's path. A step counts as done only when every step before it is done too: a sale recorded against an
 * organisation that has since lost its payouts still shows payouts as the step to fix, so the checklist never tells an
 * organiser they are further on than they can act from.
 */
export function activationOf(facts: ActivationFacts): ActivationAnswer {
  const applies = ACTIVATION_STEPS.filter((s) => s !== 'claim_verified' || facts.cameByClaim)
  let blocked = false
  const steps = applies.map((step) => {
    const at = facts[AT[step]] as string | null
    const done = !blocked && at !== null
    if (!done) blocked = true
    return { step, done, at: done ? at : null }
  })
  const next = steps.find((s) => !s.done)?.step ?? null
  return { steps, next, activated: next === null }
}

/** The organiser's own words for each step, and where they act on it. */
export const ACTIVATION_WORDS: Record<
  ActivationStep,
  { readonly label: string; readonly description: string; readonly href: string; readonly cta: string }
> = {
  claim_verified: {
    label: 'Verify your claim',
    description: "Enter the code we sent to the venue's own address, on the listing's claim page.",
    href: '/dashboard/events',
    cta: 'See your listings',
  },
  // The organisation and payouts words are the checklist's own, as they were (components/dashboard/get-started-checklist).
  organisation: { label: 'Create your organisation', description: 'Add your brand name, logo, and payout details.', href: '/dashboard/organisation/create', cta: 'Set up organisation' },
  payouts: { label: 'Connect payouts', description: 'Link Stripe so you can get paid out for ticket sales.', href: '/dashboard/organisation', cta: 'Connect Stripe' },
  tickets: { label: 'Add tickets to a night', description: 'Give an upcoming night a paid ticket type, so it can sell through EventLinqs.', href: '/dashboard/events', cta: 'Add tickets' },
  published: { label: 'Publish that night', description: 'Put the ticketed night live, so buyers can find it.', href: '/dashboard/events', cta: 'Publish' },
  checkout_ready: { label: 'Open your checkout', description: 'Check the night is on sale and a buyer can reach checkout.', href: '/dashboard/events', cta: 'Check your event' },
  first_sale: { label: 'Sell your first ticket', description: 'Share your event link. Your first paid ticket finishes setup.', href: '/dashboard/events', cta: 'Share your event' },
}

/** Drop-off across many organisers: how many reached each step, in order (the funnel's input, V3 item 3). */
export function activationFunnel(answers: readonly ActivationAnswer[]): { step: ActivationStep; reached: number }[] {
  return ACTIVATION_STEPS.map((step) => ({
    step,
    reached: answers.filter((a) => a.steps.some((s) => s.step === step && s.done)).length,
  }))
}
