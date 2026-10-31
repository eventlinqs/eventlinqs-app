import { describe, expect, it } from 'vitest'
import { activationFunnel, activationOf, ACTIVATION_STEPS, ACTIVATION_WORDS, type ActivationFacts } from '@/lib/growth/activation'

/*
 * ORGANISER ACTIVATION (V3 item 6, the CONTROLLER's 05:45 of 1 November 2026): one answer for where an organiser has
 * reached on the way to their first ticket sold through EventLinqs, and where they stopped.
 */
const NONE: ActivationFacts = {
  cameByClaim: false,
  claimVerifiedAt: null,
  organisationAt: null,
  payoutsAt: null,
  ticketsAt: null,
  publishedAt: null,
  checkoutAt: null,
  firstSaleAt: null,
}
const T = (d: number) => `2026-11-0${d}T09:00:00Z`

describe('activationOf', () => {
  it('a new account stops at its organisation, and the claim step is not asked of it', () => {
    const a = activationOf(NONE)
    expect(a.steps.map((s) => s.step)).toEqual(['organisation', 'payouts', 'tickets', 'published', 'checkout_ready', 'first_sale'])
    expect(a.next).toBe('organisation')
    expect(a.activated).toBe(false)
  })

  it('an organiser who came by a claim starts at the claim', () => {
    const a = activationOf({ ...NONE, cameByClaim: true })
    expect(a.steps[0]).toEqual({ step: 'claim_verified', done: false, at: null })
    expect(a.next).toBe('claim_verified')
  })

  it('records each step done with its time, and stops at the first missing one', () => {
    const a = activationOf({ ...NONE, cameByClaim: true, claimVerifiedAt: T(1), organisationAt: T(1), payoutsAt: T(2), ticketsAt: T(3) })
    expect(a.steps.filter((s) => s.done).map((s) => [s.step, s.at])).toEqual([
      ['claim_verified', T(1)],
      ['organisation', T(1)],
      ['payouts', T(2)],
      ['tickets', T(3)],
    ])
    expect(a.next).toBe('published')
  })

  it('never shows a step done past one that is not: a sale with payouts since lost still asks for payouts', () => {
    const a = activationOf({ ...NONE, organisationAt: T(1), payoutsAt: null, ticketsAt: T(2), publishedAt: T(2), checkoutAt: T(2), firstSaleAt: T(3) })
    expect(a.next).toBe('payouts')
    expect(a.steps.filter((s) => s.done).map((s) => s.step)).toEqual(['organisation'])
  })

  it('a first paid sale through us is activation', () => {
    const a = activationOf({ ...NONE, organisationAt: T(1), payoutsAt: T(1), ticketsAt: T(2), publishedAt: T(2), checkoutAt: T(2), firstSaleAt: T(4) })
    expect(a).toMatchObject({ next: null, activated: true })
  })
})

describe('the funnel and the words', () => {
  it('counts how many organisers reached each step, so drop-off is read between any two', () => {
    const funnel = activationFunnel([
      activationOf({ ...NONE, organisationAt: T(1) }),
      activationOf({ ...NONE, organisationAt: T(1), payoutsAt: T(2) }),
      activationOf({ ...NONE, cameByClaim: true, claimVerifiedAt: T(1), organisationAt: T(1), payoutsAt: T(2), ticketsAt: T(3), publishedAt: T(3), checkoutAt: T(3), firstSaleAt: T(5) }),
    ])
    expect(funnel).toEqual([
      { step: 'claim_verified', reached: 1 },
      { step: 'organisation', reached: 3 },
      { step: 'payouts', reached: 2 },
      { step: 'tickets', reached: 1 },
      { step: 'published', reached: 1 },
      { step: 'checkout_ready', reached: 1 },
      { step: 'first_sale', reached: 1 },
    ])
  })

  it('every step has the organiser its own label and a place to act, inside their dashboard', () => {
    for (const step of ACTIVATION_STEPS) {
      expect(ACTIVATION_WORDS[step].label.length).toBeGreaterThan(5)
      expect(ACTIVATION_WORDS[step].href).toMatch(/^\/dashboard\//)
    }
  })
})
