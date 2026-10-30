import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { KnowBeforeYouGo } from '@/components/features/events/know-before-you-go'
import { ExternalTicketsPanel } from '@/components/events/external-tickets-panel'
import { StickyActionBar } from '@/components/features/events/sticky-action-bar'

/*
 * The event detail page, each fact once and no native-ticketing promise on an outside night (the PROJECT MANAGER's
 * 13:10 of 30 October 2026; the master checklist's L2 and L6). Production read the date three times, the address three
 * times, the refund twice and the ticket button twice, and Kate Ceberano's night, sold on geelongartscentre.org.au,
 * promised a QR ticket, automatic refunds and our booking fee. The page's own placement is held by the guard
 * event-page-each-fact-once; these hold the parts.
 */

const CEBERANO_OUT = '/out/kate-ceberano-geelong-arts-centre-2026-10-31'

describe('Know before you go', () => {
  it('says nothing about a QR ticket, a refund or a fee on a night we do not ticket', () => {
    const { container } = render(<KnowBeforeYouGo qrTicket={false} ageMin={18} hasAccessibleSeats={false} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/QR/)
    expect(text).not.toMatch(/refund/i)
    expect(text).not.toMatch(/booking fee/i)
    expect(text).toContain('18+ event. Bring photo ID.')
  })

  it('tells our own ticket holder how the door works', () => {
    const { container } = render(<KnowBeforeYouGo qrTicket ageMin={null} hasAccessibleSeats={false} />)
    expect(container.textContent).toContain('Your QR ticket lives in your email and your account.')
  })

  it('never repeats the date, the address or the refund the page already states', () => {
    const { container } = render(<KnowBeforeYouGo qrTicket ageMin={18} hasAccessibleSeats />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bWhen\b/)
    expect(text).not.toMatch(/Getting there|Open in Maps/)
    expect(text).not.toMatch(/If plans change|refund/i)
  })

  it('renders nothing at all when it has nothing true to add', () => {
    const { container } = render(<KnowBeforeYouGo qrTicket={false} ageMin={null} hasAccessibleSeats={false} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('the outside night has one booking button', () => {
  it('keeps the panel free of a second button when the hero carries the booking link', () => {
    const { container } = render(
      <ExternalTicketsPanel
        destinationUrl={CEBERANO_OUT}
        host="geelongartscentre.org.au"
        label="View tickets at geelongartscentre.org.au"
        bookingInHero
      />,
    )
    expect(container.querySelectorAll('[data-booking-button]')).toHaveLength(0)
    expect(container.querySelectorAll(`a[href="${CEBERANO_OUT}"]`)).toHaveLength(0)
    expect(container.textContent).toContain('geelongartscentre.org.au')
  })

  it('keeps its button where the hero does not carry one', () => {
    const { container } = render(
      <ExternalTicketsPanel destinationUrl={CEBERANO_OUT} host="geelongartscentre.org.au" label="View tickets at geelongartscentre.org.au" />,
    )
    expect(container.querySelectorAll('[data-booking-button]')).toHaveLength(1)
  })

  it('sends the sticky bar to the booking link itself, never to a panel without a button', () => {
    const { container } = render(
      <StickyActionBar
        title="Kate Ceberano"
        dateLabel="Fri 31 Oct"
        venueLabel="Geelong Arts Centre · Geelong"
        priceLabel={null}
        shareUrl="/events/kate-ceberano"
        ctaLabel="View tickets at geelongartscentre.org.au"
        bookingHref={CEBERANO_OUT}
      />,
    )
    const links = [...container.querySelectorAll('a')].filter((a) => a.textContent === 'View tickets at geelongartscentre.org.au')
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toBe(CEBERANO_OUT)
      expect(a.getAttribute('target')).toBe('_blank')
    }
  })
})
