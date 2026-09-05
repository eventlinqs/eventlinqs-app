// THE ORGANISER'S REVENUE SUMMARY SHOWS ONE FEE.
//
// Founder ruling of 15 August 2026: there is one fee on every paid ticket and
// no processing line anywhere. This panel kept a separate line for
// processing_fee_cents until the C1 drive of 5 September 2026 found it on the
// event edit page; its plural wording had slipped past the one-fee-copy guard,
// which now matches the plural as well. Orders before 15 August carry a
// non-zero processing_fee_cents, so the arithmetic must still net it out: it
// is folded into the one fee line rather than shown as a line of its own.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RevenueSummary } from '@/components/orders/revenue-summary'

describe('RevenueSummary', () => {
  it('shows gross, ONE fee line and net, and never a processing line', () => {
    render(<RevenueSummary grossCents={10000} platformFeeCents={600} processingFeeCents={0} currency="aud" />)
    expect(screen.getByText('Gross Sales')).toBeInTheDocument()
    expect(screen.getByText('Platform fee')).toBeInTheDocument()
    expect(screen.getByText('Net Revenue')).toBeInTheDocument()
    expect(screen.queryByText(/processing/i)).toBeNull()
    expect(screen.getByText('AUD 100.00')).toBeInTheDocument()
    expect(screen.getByText('−AUD 6.00')).toBeInTheDocument()
    expect(screen.getByText('AUD 94.00')).toBeInTheDocument()
  })

  it('folds a pre-15-August processing_fee_cents into the one fee line and the net', () => {
    render(<RevenueSummary grossCents={10000} platformFeeCents={600} processingFeeCents={250} currency="aud" />)
    expect(screen.getByText('−AUD 8.50')).toBeInTheDocument()
    expect(screen.getByText('AUD 91.50')).toBeInTheDocument()
    expect(screen.getAllByText(/^−AUD/).length).toBe(1)
  })

  it('shows the refunds line only when something was refunded, and nets it out', () => {
    const { rerender } = render(<RevenueSummary grossCents={10000} platformFeeCents={600} processingFeeCents={0} currency="aud" />)
    expect(screen.queryByText('Refunds')).toBeNull()
    rerender(<RevenueSummary grossCents={10000} platformFeeCents={600} processingFeeCents={0} refundedCents={2000} currency="aud" />)
    expect(screen.getByText('Refunds')).toBeInTheDocument()
    expect(screen.getByText('−AUD 20.00')).toBeInTheDocument()
    expect(screen.getByText('AUD 74.00')).toBeInTheDocument()
  })
})
