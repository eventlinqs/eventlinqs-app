/**
 * THE PM'S PRE-READ OF 15 NOVEMBER 2026, 01:42, ON THE DASHBOARD.
 * D3: at 390 the three stat tiles' labels sit on one line ("Sold", "Upcoming", "Events"); from sm the full words.
 * D4: while the payout banner shows, "Add payout method" is the one gold action: Create event is outlined.
 * D5: the money panel's full-width cards take the compact tiles' padding at 390, with no reserved empty line.
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
vi.mock('@/components/dashboard/greeting-text', () => ({ GreetingText: () => <span>Good evening</span> }))

import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { KpiCard } from '@/components/dashboard/kpi-card'

describe('the dashboard header while a payout method is needed (D4)', () => {
  it('draws Create event outlined, so the banner holds the one gold action', () => {
    const { container } = render(<DashboardHero firstName="" createOutlined />)
    const create = container.querySelector('a[href="/dashboard/events/create"]')
    expect(create?.className).not.toContain('bg-gold-400')
    expect(create?.className).toContain('border-ink-200')
  })

  it('draws Create event gold once the banner has gone', () => {
    const { container } = render(<DashboardHero firstName="" />)
    expect(container.querySelector('a[href="/dashboard/events/create"]')?.className).toContain('bg-gold-400')
  })
})

describe('the KPI card (D3, D5)', () => {
  it('carries a short label for 390 and the full label from sm', () => {
    const { container } = render(<KpiCard compact label="Upcoming events" shortLabel="Upcoming" value="1" testId="u" />)
    const short = container.querySelector('span.sm\\:hidden')
    const full = container.querySelector('span.hidden.sm\\:inline')
    expect(short?.textContent).toBe('Upcoming')
    expect(full?.textContent).toBe('Upcoming events')
  })

  it('a tight card takes the compact padding and reserves no empty line at 390', () => {
    const { container } = render(<KpiCard tight label="Paid out" value="$0.00" detail="Paid after each event ends" testId="p" />)
    const card = container.querySelector('[data-kpi="p"]')
    expect(card?.className).toContain('p-3 sm:p-5')
    const detail = container.querySelector('[data-kpi-detail]')?.parentElement
    expect(detail?.className).not.toMatch(/(^|\s)h-8(\s|$)/)
    expect(detail?.className).toContain('sm:h-8')
  })
})
