/**
 * ONE ACTION, ONE BUTTON (the PM's score of 15 November 2026, D1). While a payout method is needed the dashboard's
 * banner carries "Add payout method"; the Next payout card keeps its words and drops its own button, and Quick actions
 * drops its row. At 1440 three gold buttons had sat in the first screen. Anywhere without the banner the card keeps its
 * button (money-panel-next-step.test.tsx).
 */
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { MoneyPanel } from '@/components/dashboard/money-panel'
import { QuickActionsPanel } from '@/components/dashboard/quick-actions-panel'
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

describe('while the payout banner carries the step', () => {
  it('the Next payout card keeps its words and has no button of its own', () => {
    const { container } = render(<MoneyPanel summary={held} actionInBanner />)
    const card = container.querySelector('[data-kpi="money-next-payout"]')
    expect(card?.textContent).toContain('Payout method needed')
    expect(card?.textContent).toContain('$20.00 is paid once your payout method is added and verified')
    expect(card?.querySelector('a[data-kpi-action]')).toBeNull()
  })

  it('Quick actions has no "Add payout method" row', () => {
    const { container } = render(<QuickActionsPanel hidePayoutMethod />)
    expect(container.textContent).not.toContain('Add payout method')
    expect(container.querySelector('a[href="/dashboard/payouts"]')).toBeNull()
    expect(container.textContent).toContain('Create event')
  })

  it('without the banner Quick actions keeps the row', () => {
    const { container } = render(<QuickActionsPanel />)
    expect(container.querySelector('a[href="/dashboard/payouts"]')).not.toBeNull()
  })
})

describe('the money panel at 390 (D2)', () => {
  it('draws Sales and Refunds as compact tiles and Paid out and Next payout full width', () => {
    const { container } = render(<MoneyPanel summary={held} actionInBanner />)
    const grid = container.querySelector('[data-money-panel] > div')
    expect(grid?.className).toContain('grid-cols-2')
    expect(container.querySelector('[data-kpi="money-paid-out"]')?.className).toContain('col-span-2')
    expect(container.querySelector('[data-kpi="money-next-payout"]')?.className).toContain('col-span-2')
    expect(container.querySelector('[data-kpi="money-sales"]')?.className).not.toContain('col-span-2')
    expect(container.querySelector('[data-kpi="money-refunds"]')?.textContent).toContain('No refunds')
  })
})
