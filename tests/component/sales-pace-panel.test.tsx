import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SalesPacePanel } from '@/components/dashboard/sales-pace-panel'
import type { PaceCurve } from '@/lib/ledger/pace'

/**
 * "HOW YOUR TICKETS SOLD" MUST NOT SAY SOMETHING FALSE WHEN IT KNOWS NOTHING.
 * Close-out D1, found by driving the panel on 10 September 2026.
 *
 * Against a real slot with 28 backfilled sales, the panel read:
 *
 *     28 sold, $665 taken
 *     Reached checkout 0 | Did not finish 0 | Looked at the page 0
 *
 * Not one of those zeros was true. Nobody recorded who reached checkout before
 * the ledger existed, and the backfill REFUSES to invent those rows for exactly
 * that reason: "writing zero abandonment for a period nobody measured would be
 * a lie the recovery engine would then act on". The panel was telling that lie
 * on the backfill's behalf, in the one place an organiser would read it.
 *
 * The two states are distinguishable, and these hold the distinction: a slot
 * with sales and no demand rows AT ALL predates the recording, because a live
 * sale writes a checkout_started row on its way through.
 */
const demand = (over: Partial<PaceCurve['demand']> = {}): PaceCurve['demand'] => ({
  views: 0,
  soldOutViews: 0,
  checkoutsStarted: 0,
  checkoutsAbandoned: 0,
  waitlistJoins: 0,
  abandonmentPercent: null,
  ...over,
})

const curve = (over: Partial<PaceCurve> = {}): PaceCurve => ({
  slotId: 'slot-1',
  category: 'music',
  subcategory: 'afrobeats',
  capacity: 190,
  slotAt: '2026-08-15T09:00:00.000Z',
  onSaleAt: '2026-07-01T00:00:00.000Z',
  points: [
    { daysOut: 40, units: 10, cumulativeUnits: 10, cumulativeAmountCents: 25000, unitAmountCents: 2500 },
    { daysOut: 12, units: 18, cumulativeUnits: 28, cumulativeAmountCents: 66500, unitAmountCents: 2750 },
  ],
  priceMoves: [],
  totals: { units: 28, amountCents: 66500, unitsReturned: 0 },
  demand: demand(),
  close: null,
  ...over,
})

describe('SalesPacePanel', () => {
  it('a slot whose demand was never recorded says so, rather than showing three zeros', () => {
    render(<SalesPacePanel curve={curve()} />)
    expect(screen.getByText(/Nothing is recorded yet about the people who looked and did not buy/)).toBeInTheDocument()
    expect(screen.queryByText('Reached checkout')).toBeNull()
    expect(screen.queryByText('Did not finish')).toBeNull()
    // The sales half is unaffected: those numbers are real and are still shown.
    expect(screen.getByText(/28 sold/)).toBeInTheDocument()
  })

  it('a slot with real demand rows shows the three numbers, including a real zero', () => {
    render(
      <SalesPacePanel
        curve={curve({ demand: demand({ views: 140, checkoutsStarted: 9, checkoutsAbandoned: 0, abandonmentPercent: 0 }) })}
      />,
    )
    expect(screen.getByText('Reached checkout')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    // ZERO IS SHOWN when zero is what was measured. "Nobody abandoned" is a real
    // and good answer, and hiding it would be the opposite mistake.
    expect(screen.getByText('Did not finish')).toBeInTheDocument()
    expect(screen.getByText('0 (0%)')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing is recorded yet/)).toBeNull()
  })

  it('a slot the ledger has never heard of says that, and does not draw an empty chart', () => {
    render(<SalesPacePanel curve={null} />)
    expect(screen.getByText(/created before the platform started keeping a sales history/)).toBeInTheDocument()
  })

  it('a slot the ledger knows about that has sold nothing yet says THAT, which is a different sentence', () => {
    render(<SalesPacePanel curve={curve({ points: [], totals: { units: 0, amountCents: 0, unitsReturned: 0 } })} />)
    expect(screen.getByText(/Nothing has sold yet/)).toBeInTheDocument()
  })
})

/*
 * THE SECOND SURFACE (close-out D1, 13 September 2026).
 *
 * /admin/events/[id] draws the same curve for the platform owner, because the
 * one real production event belongs to an outside organiser and the owner had
 * nowhere to read it. The console shell is dark, so the panel takes a tone. What
 * must be true of that: the ARITHMETIC and every refusal-to-lie sentence are the
 * same component and therefore identical, the heading stops saying "your" on a
 * screen that is not the organiser's, and no light-surface token survives onto
 * the dark card, because S1 found twelve elements on that exact shell painted
 * white on white while axe reported zero violations in the same run.
 */
describe('SalesPacePanel on the admin console', () => {
  it('says "this event" rather than "your tickets", on every state', () => {
    const { container, unmount } = render(<SalesPacePanel curve={curve()} tone="console" />)
    expect(screen.getByText('How this event sold')).toBeInTheDocument()
    expect(screen.queryByText('How your tickets sold')).toBeNull()
    expect(container.textContent).toContain('28 sold')
    unmount()

    render(<SalesPacePanel curve={null} tone="console" />)
    expect(screen.getByText('How this event sold')).toBeInTheDocument()
  })

  it('keeps every sentence the organiser panel refuses to replace with a zero', () => {
    const { unmount } = render(<SalesPacePanel curve={curve()} tone="console" />)
    expect(screen.getByText(/Nothing is recorded yet about the people who looked and did not buy/)).toBeInTheDocument()
    unmount()

    render(<SalesPacePanel curve={curve({ points: [], totals: { units: 0, amountCents: 0, unitsReturned: 0 } })} tone="console" />)
    expect(screen.getByText(/Nothing has sold yet/)).toBeInTheDocument()
  })

  it('draws the identical chart geometry, so the tone is paint and never arithmetic', () => {
    const light = render(<SalesPacePanel curve={curve()} />)
    const lightPaths = [...light.container.querySelectorAll('path')].map((p) => p.getAttribute('d'))
    const lightTable = light.container.querySelector('table')?.textContent
    light.unmount()

    const dark = render(<SalesPacePanel curve={curve()} tone="console" />)
    const darkPaths = [...dark.container.querySelectorAll('path')].map((p) => p.getAttribute('d'))
    expect(darkPaths).toEqual(lightPaths)
    expect(dark.container.querySelector('table')?.textContent).toBe(lightTable)
  })

  it('carries no light-surface token onto the dark card, and no dark one onto the light card', () => {
    const dark = render(<SalesPacePanel curve={curve()} tone="console" />)
    const darkHtml = dark.container.innerHTML
    for (const token of ['bg-white"', 'bg-white ', 'text-ink-900', 'text-ink-600', 'border-ink-100', 'bg-ink-100/40']) {
      expect(darkHtml).not.toContain(token)
    }
    // And the two series colours are the console's, not the canvas's.
    expect(darkHtml).toContain('#FFFFFF')
    expect(darkHtml).toContain('var(--color-gold-400)')
    expect(darkHtml).not.toContain('var(--color-ink-900)')
    dark.unmount()

    const light = render(<SalesPacePanel curve={curve()} />)
    const lightHtml = light.container.innerHTML
    expect(lightHtml).toContain('var(--color-ink-900)')
    expect(lightHtml).toContain('var(--color-gold-800)')
    expect(lightHtml).not.toContain('#131A2A')
    expect(lightHtml).not.toContain('var(--color-gold-400)')
  })

  it('defaults to the organiser tone, so every existing call site is untouched', () => {
    render(<SalesPacePanel curve={curve()} />)
    expect(screen.getByText('How your tickets sold')).toBeInTheDocument()
  })
})
