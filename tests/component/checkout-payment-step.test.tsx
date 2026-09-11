import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * THE PAYMENT STEP OWNS THE VIEWPORT IT MOUNTS INTO. Close-out UX6, driven on
 * the preview of 0a195454 at 390 on 12 September 2026.
 *
 * What the phone showed after "Continue to payment": the viewport sat at the
 * top of the Payment card for a moment, then Stripe's loading skeleton and then
 * its frame inserted ABOVE the content Chrome had anchored the scroll to, and
 * the browser scrolled the page down by the same amount, twice, to keep that
 * content still (scrollY 145 -> 381 -> 890, measured). The buyer ended up
 * looking at the Pay button with every card field above the top of the screen.
 * Nothing in the markup was wrong, which is why no static check saw it and why
 * a driven proof against a preview with a live key was the first thing that
 * could.
 *
 * These hold the two halves of the fix from inside the component, where they
 * cannot go stale against the proof that found the defect: the step opts the
 * whole page out of scroll anchoring, and it starts every buyer at the top with
 * focus on the heading.
 */

vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve(null) }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <>{children}</>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({}),
  useElements: () => ({}),
}))
vi.mock('@/app/actions/checkout', () => ({ processCheckout: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/checkout/cart-timer', () => ({ CartTimer: () => <div data-testid="cart-timer" /> }))
vi.mock('@/components/checkout/checkout-summary', () => ({
  CheckoutSummary: () => <div data-testid="checkout-summary">Order summary</div>,
}))

import { PaymentStep } from '@/app/checkout/[reservation_id]/checkout-form'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'

const fees = { total_cents: 5373 } as unknown as FeeBreakdown

function mountStep() {
  return render(
    <PaymentStep
      clientSecret="pi_test_secret"
      orderId="order-1"
      expiresAt={new Date(Date.now() + 600_000).toISOString()}
      onExpired={() => {}}
      fees={fees}
      currency="aud"
      eventTitle="Lineup Loop Proof Night"
      eventDate="2026-09-18T09:00:00.000Z"
      venue="Geelong"
      trustSlot={<div data-testid="trust" />}
    />,
  )
}

describe('PaymentStep', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  it('starts the buyer at the top of the page when the step mounts', () => {
    mountStep()
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('moves focus to the Payment heading, so the step change is announced and the card fields come first', () => {
    mountStep()
    const heading = screen.getByRole('heading', { name: 'Payment' })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).toBe(heading)
  })

  it('opts the whole step out of scroll anchoring, so Stripe growing above the fold cannot move the viewport', () => {
    const { container } = mountStep()
    // jsdom does not lay out, so the property cannot be read back as a
    // computed style; the class is the mechanism, and its absence is the defect.
    expect(container.firstElementChild?.className).toContain('[overflow-anchor:none]')
    expect(container.firstElementChild).toContainElement(screen.getByTestId('payment-element'))
    expect(container.firstElementChild).toContainElement(screen.getByTestId('checkout-summary'))
  })

  it('names the all-in total on the Pay button', () => {
    mountStep()
    expect(screen.getByRole('button', { name: 'Pay AUD 53.73' })).toBeInTheDocument()
  })
})
