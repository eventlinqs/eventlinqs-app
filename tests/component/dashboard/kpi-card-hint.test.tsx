/**
 * A KPI CARD WITH A NUMBER ON IT IS NOT AN EMPTY CARD.
 *
 * FOUND BY READING A DRIVEN SCREENSHOT rather than the drive's own report, at
 * 390 on 20 September 2026. The organiser's home screen said, in three lines:
 *
 *     TOTAL EVENTS
 *     1
 *     Create your first event
 *
 * The hint branch was `hasSparkline ? <Sparkline/> : <hint/>`, and the two
 * cards that never carry a sparkline, Upcoming events and Total events, print
 * their hint unconditionally. Every organiser with events has been told to
 * create their first one.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard } from '@/components/dashboard/kpi-card'

describe('the empty hint appears only on an empty card', () => {
  it('is WITHHELD when the card carries a value and no sparkline', () => {
    render(<KpiCard label="Total events" value="1" emptyHint="Create your first event" />)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.queryByText('Create your first event')).toBeNull()
  })

  it('is SHOWN when the card is genuinely at zero', () => {
    render(<KpiCard label="Total events" value="0" emptyHint="Create your first event" />)
    expect(screen.getByText('Create your first event')).toBeTruthy()
  })

  it('is withheld when a zero-valued card still has a sparkline to draw', () => {
    render(
      <KpiCard
        label="Revenue (30d)"
        value="0"
        sparkline={[0, 1, 2, 3]}
        emptyHint="Revenue will appear here"
      />,
    )
    expect(screen.queryByText('Revenue will appear here')).toBeNull()
  })

  it('falls back to a generic hint when an empty card names none', () => {
    render(<KpiCard label="Total events" value="0" />)
    expect(screen.getByText('No data yet')).toBeTruthy()
  })

  it('exposes its figure to a drive when given a testId, and nothing when not', () => {
    const { container, rerender } = render(
      <KpiCard label="Tickets sold (30d)" value="540" delta={{ value: 0 }} testId="tickets-30" />,
    )
    const card = container.querySelector('[data-kpi="tickets-30"]')
    expect(card?.getAttribute('data-kpi-value')).toBe('540')
    expect(card?.getAttribute('data-kpi-delta')).toBe('0')

    rerender(<KpiCard label="Tickets sold (30d)" value="540" />)
    expect(container.querySelector('[data-kpi]')).toBeNull()
  })
})
