/**
 * THE CARD THAT NAMES THE STEP CARRIES THE STEP'S BUTTON (the PM's score of 14 November 2026, fix 7).
 *
 * An organiser who has sold before connecting a payout account sees "Payout method needed" on the Next payout card.
 * The action sat only in Quick actions, far below at 390. The card now carries "Add payout method" itself. The first
 * build gave the card's data an action and the card an action prop, and never passed one to the other: the screens
 * showed no button. This draws the money panel in that state and asks for the link.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyPanel } from '@/components/dashboard/money-panel'
import type { OrganiserMoneySummary } from '@/lib/payouts/money-summary'

const held: OrganiserMoneySummary = {
  currency: 'AUD',
  salesCents: 2500,
  salesCount: 1,
  refundedCents: 0,
  refundCount: 0,
  paidOutCents: 0,
  heldCents: 2000,
  reserveCents: 500,
  nextPayout: { state: 'held_setup', amountCents: 2000 },
}

describe('the money panel when a payout method is needed', () => {
  it('puts "Add payout method" on the Next payout card, linked to the payouts page', () => {
    const { container } = render(<MoneyPanel summary={held} />)
    const card = container.querySelector('[data-kpi="money-next-payout"]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('Payout method needed')
    const link = card?.querySelector('a[data-kpi-action]') as HTMLAnchorElement | null
    expect(link?.textContent).toBe('Add payout method')
    expect(link?.getAttribute('href')).toBe('/dashboard/payouts')
  })

  it('shows the sale, what is held for the payout and what is held for refunds', () => {
    render(<MoneyPanel summary={held} />)
    expect(screen.getByText('1 order')).toBeInTheDocument()
    expect(screen.getByText('$20.00 held for your payout, $5.00 for refunds')).toBeInTheDocument()
  })

  it('carries no button when nothing is asked of the organiser', () => {
    const { container } = render(<MoneyPanel summary={{ ...held, nextPayout: null, heldCents: 0, reserveCents: 0 }} />)
    expect(container.querySelector('a[data-kpi-action]')).toBeNull()
  })
})
