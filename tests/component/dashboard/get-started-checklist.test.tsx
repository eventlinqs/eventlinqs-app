// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { GetStartedChecklist } from '@/components/dashboard/get-started-checklist'
import { activationOf, type ActivationFacts } from '@/lib/growth/activation'

/*
 * THE ORGANISER'S CHECKLIST IS THE ACTIVATION PATH (V3 item 6): after the email, its steps are activationOf's, in order,
 * with the next action on the first step not done; a claimed account starts at its claim.
 */
afterEach(() => cleanup())

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
const T = '2026-11-01T09:00:00Z'

function draw(facts: ActivationFacts, verifyEmail = true) {
  const { container } = render(<GetStartedChecklist status={{ verifyEmail, activation: activationOf(facts) }} />)
  const items = [...container.querySelectorAll('li')].map((li) => li.querySelector('p')?.textContent ?? '')
  const action = container.querySelector('a')
  return { container, items, action }
}

describe('GetStartedChecklist', () => {
  it('lists the email and then the way to a first sale, and points at the first step not done', () => {
    const { items, action, container } = draw({ ...NONE, organisationAt: T, payoutsAt: T })
    expect(items).toEqual(['Verify your email', 'Create your organisation', 'Connect payouts', 'Add tickets to a night', 'Publish that night', 'Open your checkout', 'Sell your first ticket'])
    expect(action?.textContent).toContain('Add tickets')
    expect(action?.getAttribute('href')).toBe('/dashboard/events')
    expect(container.textContent).toContain('3 of 7 steps complete')
  })

  it('a claimed account starts at its claim', () => {
    const { items, action } = draw({ ...NONE, cameByClaim: true })
    expect(items[1]).toBe('Verify your claim')
    expect(action?.textContent).toContain('See your listings')
  })

  it('says it is all set only once a ticket has sold through EventLinqs', () => {
    const { container, action } = draw({ ...NONE, organisationAt: T, payoutsAt: T, ticketsAt: T, publishedAt: T, checkoutAt: T, firstSaleAt: T })
    expect(container.textContent).toContain('All set. Your first ticket has sold through EventLinqs.')
    expect(action).toBeNull()
  })
})
