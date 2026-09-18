/**
 * WHAT A BUYER IS TOLD WHEN THE FEE IS WAIVED (close-out FO1, 18 September 2026).
 *
 * A Founding Organiser's resolved rates are both zero. Every NUMBER the ticket
 * panel showed for them was already correct: subtotal 2500, no service fee row,
 * total 2500. Both WORDS were wrong, and the driven purchase proof missed them
 * because it asserted the numbers:
 *
 *   the tier line   "Fee included in the ticket price" - nothing is included
 *   the panel line  "It includes the EventLinqs fee of 0% plus Free per ticket,
 *                    which covers card processing" - not English, claims a fee
 *                    is included, and claims a charge of nothing covers
 *                    something
 *
 * These tests fail against that code and pass against the fix. The standard and
 * absorb cases are asserted beside them, because the cheapest way to make the
 * waived sentence pass is to break the other two.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/events/lane-b-waived-fee',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/checkout', () => ({ createReservation: vi.fn() }))

import { TicketSelector } from '@/components/checkout/ticket-selector'

type SelectorTier = Parameters<typeof TicketSelector>[0]['tiers'][number]
type FeeRates = NonNullable<Parameters<typeof TicketSelector>[0]['feeRates']>

const WAIVED: FeeRates = { platformFeePercent: 0, platformFeeFixedCents: 0 }
const STANDARD: FeeRates = { platformFeePercent: 3.5, platformFeeFixedCents: 99 }

function tier(): SelectorTier {
  return {
    id: 'tier-lane-b-waived',
    event_id: 'event-lane-b-waived',
    name: 'General Admission',
    description: null,
    price: 2500,
    currency: 'AUD',
    total_capacity: 100,
    sold_count: 0,
    reserved_count: 0,
    max_per_order: 10,
    is_visible: true,
    is_active: true,
    sale_start: null,
    sale_end: null,
    sort_order: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  } as unknown as SelectorTier
}

function mount(feeRates: FeeRates, feePassType: 'pass_to_buyer' | 'absorb' = 'pass_to_buyer') {
  return render(
    <TicketSelector
      eventId="event-lane-b-waived"
      tiers={[tier()]}
      addons={[]}
      isTicketingSuspended={false}
      currency="AUD"
      eventTimezone="Australia/Melbourne"
      feeRates={feeRates}
      feePassType={feePassType}
    />,
  )
}

/** The panel sentence, read whole the way a person reads it. */
function panelSentence(): string {
  const paragraphs = Array.from(document.querySelectorAll('p'))
  const found = paragraphs.find(p => (p.textContent ?? '').includes('Every price here is the price you pay'))
  return (found?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

afterEach(cleanup)

describe('the ticket panel when the fee is waived', () => {
  it('says there is no fee, and never states a rate of zero', () => {
    mount(WAIVED)
    const sentence = panelSentence()

    expect(sentence).toBe(
      'Every price here is the price you pay. There is no EventLinqs fee on this event, and nothing is added at the payment step.',
    )
    // The three specific wrongs, named so a regression is unambiguous.
    expect(sentence).not.toContain('0%')
    expect(sentence).not.toContain('plus Free')
    expect(sentence).not.toContain('covers card processing')
  })

  it('shows no per-tier breakdown line, because there is nothing to break down', () => {
    mount(WAIVED)
    expect(screen.queryByTestId('tier-all-in-breakdown')).toBeNull()
  })

  it('never tells the buyer anything about the organiser terms that waived it', () => {
    mount(WAIVED)
    const page = (document.body.textContent ?? '').toLowerCase()
    expect(page).not.toContain('founding')
    expect(page).not.toContain('waiv')
  })
})

describe('the ticket panel when the fee is real', () => {
  it('still states the rate it reads from the configuration when the fee is passed on', () => {
    mount(STANDARD)
    expect(panelSentence()).toBe(
      'Every price here is the price you pay. It includes the EventLinqs fee of 3.5% plus AUD 0.99 per ticket, ' +
        'which covers card processing, and nothing further is added at the payment step.',
    )
  })

  it('still breaks the ticket down per tier when the fee is passed on', () => {
    mount(STANDARD)
    // 3.5% of 2500 is 87.5, rounded to 88, plus the 99 flat: 187 cents.
    // The rates above are this test's own fixture, not the platform's live fee,
    // which is read from configuration and is never typed into a test.
    expect((screen.getByTestId('tier-all-in-breakdown').textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      'AUD 25.00 ticket plus AUD 1.87 fee',
    )
  })

  it('still says the fee is inside the price when the organiser absorbs it', () => {
    mount(STANDARD, 'absorb')
    expect(panelSentence()).toBe(
      'Every price here is the price you pay. The EventLinqs fee is already inside the ticket price, ' +
        'and there is nothing added at the payment step.',
    )
    expect(screen.getByTestId('tier-all-in-breakdown').textContent).toContain('Fee included in the ticket price')
  })
})
