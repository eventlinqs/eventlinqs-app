import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'

describe('AdminStatTile', () => {
  it('renders the label and value', () => {
    render(<AdminStatTile label="Pending refunds" value={7} />)
    expect(screen.getByText('Pending refunds')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('renders the hint when provided', () => {
    render(<AdminStatTile label="Redis health" value="12 ms" hint="PING, healthy" />)
    expect(screen.getByText('PING, healthy')).toBeInTheDocument()
  })

  it('shows no status dot when status is omitted', () => {
    const { container } = render(<AdminStatTile label="GMV today" value="$0.00" />)
    expect(container.querySelector('span[aria-hidden]')).toBeNull()
  })

  it.each([
    ['ok', 'bg-emerald-400'],
    ['warn', 'bg-amber-400'],
    ['down', 'bg-rose-500'],
    ['pending', 'bg-white/30'],
  ] as const)('maps the %s status to the %s dot', (status, expectedClass) => {
    const { container } = render(<AdminStatTile label="Stripe API latency" value="Down" status={status} />)
    const dot = container.querySelector('span[aria-hidden]')
    expect(dot).not.toBeNull()
    expect(dot?.className).toContain(expectedClass)
  })
})
