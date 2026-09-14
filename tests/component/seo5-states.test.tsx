import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * THE THREE STATES AND THE AVAILABILITY LINE (close-out SEO5 steps 3, 4 and 5).
 *
 * Four of the acceptance tests live here because all four are about what a
 * person SEES, and the only honest way to assert that is to mount the component
 * and read the DOM the way a screen reader would:
 *
 *   availability_reads_inventory_and_is_absent_when_unknown
 *   accessibility_section_hidden_when_empty
 *   sold_out_state_renders_and_disables_the_cta
 *   past_event_state_renders
 *
 * ============================================================================
 * THE ITEM'S PREMISE WAS WRONG ABOUT THREE OF THESE, AND THAT IS RECORDED
 * ============================================================================
 *
 * SEO5 says the sold-out and past states have "never been observed" and asks
 * for them to be rendered "deliberately". They were BUILT, and shipping, before
 * this item: `EventSoldOut` and `EventStateBanner` have been in the tree for
 * months. What was true is that the catalogue has one future event, so nobody
 * had ever LOOKED at them. The same goes for the availability line, which was
 * already computed from capacity minus sold minus reserved rather than from an
 * invented urgency message.
 *
 * So what this file adds is not the states. It is the assertion that they
 * behave, which is what was actually missing: nothing in the repository would
 * have noticed if the sold-out panel started offering a checkout button, or if
 * the availability line started rendering for an event with no capacity set.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
/*
 * The media component is stubbed as a plain element rather than an <img>: the
 * lint rule that bans a raw <img> in this repository is about LCP on shipped
 * surfaces and is correct, and a test has no business arguing with it to render
 * a stand-in nothing asserts against.
 */
vi.mock('@/components/media/EventCardMedia', () => ({
  EventCardMedia: ({ alt }: { alt?: string }) => <span data-testid="event-card-media" aria-label={alt ?? ''} />,
}))
vi.mock('@/app/actions/checkout', () => ({ createReservation: vi.fn() }))

import { AccessibilitySection } from '@/components/features/accessibility/accessibility-section'
import { EventStateBanner } from '@/components/features/events/event-state-banner'
import { EventSoldOut } from '@/components/features/events/event-sold-out'
import { TicketSelector } from '@/components/checkout/ticket-selector'
import { accessibilityItems } from '@/lib/accessibility/fields'

/* ------------------------------------------------------------------------ */
/* availability_reads_inventory_and_is_absent_when_unknown                   */
/* ------------------------------------------------------------------------ */

type SelectorTier = Parameters<typeof TicketSelector>[0]['tiers'][number]

function tier(over: Partial<SelectorTier> = {}): SelectorTier {
  return {
    id: 'tier-lane-c-1',
    event_id: 'event-lane-c',
    name: 'General admission',
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
    ...over,
  } as unknown as SelectorTier
}

/**
 * `Only {available} left` renders as THREE text nodes, so an exact-string
 * `getByText` finds nothing even when the line is on screen. This reads the
 * paragraph the way a person does: whole, and collapsed.
 */
function availabilityLine(): string | null {
  const found = Array.from(document.querySelectorAll('p')).find(p =>
    /^Only\s+-?\d+\s+left$/.test((p.textContent ?? '').trim()),
  )
  return found ? (found.textContent ?? '').trim() : null
}

function mountSelector(tiers: SelectorTier[]) {
  return render(
    <TicketSelector
      eventId="event-lane-c"
      tiers={tiers}
      addons={[]}
      isTicketingSuspended={false}
      currency="AUD"
      eventTimezone="Australia/Melbourne"
    />,
  )
}

describe('availability_reads_inventory_and_is_absent_when_unknown', () => {
  it('names the real remaining count when the room is nearly gone', () => {
    // 100 capacity, 85 sold, 10 held: five left, and the line must say five.
    mountSelector([tier({ total_capacity: 100, sold_count: 85, reserved_count: 10 })])
    expect(availabilityLine()).toBe('Only 5 left')
  })

  it('counts RESERVED stock as gone, because a held seat is not for sale', () => {
    mountSelector([tier({ total_capacity: 100, sold_count: 0, reserved_count: 97 })])
    expect(availabilityLine()).toBe('Only 3 left')
  })

  it('says nothing at all when the room is wide open', () => {
    mountSelector([tier({ total_capacity: 500, sold_count: 10, reserved_count: 0 })])
    expect(availabilityLine()).toBeNull()
  })

  it('never says "Only 0 left", which is a scarcity line that is not a number', () => {
    /*
     * `ticket_tiers.total_capacity` is NOT NULL with no default, verified
     * against TEST on 14 September 2026, so a capacity of 0 is a real answer
     * rather than a missing one and the tier is genuinely sold out. What must
     * not happen either way is the scarcity line rendering "Only 0 left", which
     * is a count no buyer can act on sitting where a real one belongs. The
     * sold-out branch takes precedence and the line stays off.
     */
    mountSelector([tier({ total_capacity: 0, sold_count: 0, reserved_count: 0 })])
    expect(availabilityLine()).toBeNull()
  })

  it('never renders a negative count when the books are over-subscribed', () => {
    mountSelector([tier({ total_capacity: 10, sold_count: 12, reserved_count: 0 })])
    expect(availabilityLine()).toBeNull()
  })
})

/* ------------------------------------------------------------------------ */
/* accessibility_section_hidden_when_empty                                   */
/* ------------------------------------------------------------------------ */

describe('accessibility_section_hidden_when_empty', () => {
  it('produces no DOM at all when the organiser has said nothing', () => {
    const { container } = render(
      <AccessibilitySection info={accessibilityItems({}, 'event')} subject="event" />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Accessibility')).not.toBeInTheDocument()
  })

  it('produces no DOM when every flag is false, which is an untouched row', () => {
    const { container } = render(
      <AccessibilitySection
        info={accessibilityItems(
          { wheelchair_accessible: false, hearing_loop: false, accessibility_notes: '' },
          'event',
        )}
        subject="event"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the heading and only the stated features once something is true', () => {
    render(
      <AccessibilitySection
        info={accessibilityItems(
          { wheelchair_accessible: true, companion_card_accepted: true, hearing_loop: false },
          'event',
        )}
        subject="event"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Accessibility' })).toBeInTheDocument()
    expect(screen.getByText('Wheelchair accessible')).toBeInTheDocument()
    expect(screen.getByText('Companion Card accepted')).toBeInTheDocument()
    expect(screen.queryByText('Hearing loop')).not.toBeInTheDocument()
  })

  it('says that silence is silence, not a refusal', () => {
    render(
      <AccessibilitySection
        info={accessibilityItems({ wheelchair_accessible: true }, 'event')}
        subject="event"
      />,
    )
    expect(
      screen.getByText(/has not been told to us rather than ruled out/),
    ).toBeInTheDocument()
  })

  it('renders the venue wording on a venue', () => {
    render(
      <AccessibilitySection
        info={accessibilityItems({ step_free_access: true }, 'venue')}
        subject="venue"
      />,
    )
    expect(screen.getByText(/What this venue has told us about access/)).toBeInTheDocument()
  })

  it('renders free-text notes and a contact when they are the only thing said', () => {
    render(
      <AccessibilitySection
        info={accessibilityItems(
          { accessibility_notes: 'Ring the bell at the laneway door.', accessibility_contact: '03 9000 0000' },
          'event',
        )}
        subject="event"
      />,
    )
    expect(screen.getByText('Ring the bell at the laneway door.')).toBeInTheDocument()
    expect(screen.getByText('03 9000 0000')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------------ */
/* sold_out_state_renders_and_disables_the_cta                               */
/* ------------------------------------------------------------------------ */

describe('sold_out_state_renders_and_disables_the_cta', () => {
  function mountSoldOut() {
    return render(
      <EventSoldOut
        event={{ id: 'event-lane-c', slug: 'lane-c-proof-night', title: 'Lane C proof night' }}
        primaryTierId="tier-lane-c-1"
        relatedEvents={[]}
      />,
    )
  }

  it('says the event is sold out', () => {
    mountSoldOut()
    // Said more than once on purpose (a heading and a sentence), so the
    // assertion is that it is said at all rather than said exactly once.
    expect(screen.getAllByText(/sold out/i).length).toBeGreaterThan(0)
  })

  it('offers no checkout control of any kind', () => {
    /*
     * THE POINT OF THIS ASSERTION. The defect it exists to catch is a sold-out
     * panel that still renders a buy path, which is the Law 5 dead end on the
     * money surface: the buyer clicks, and the server refuses. So every button
     * and link in the panel is swept rather than one being named, because the
     * next version of this defect will use a control that does not exist yet.
     */
    mountSoldOut()
    const controls = [
      ...screen.queryAllByRole('button'),
      ...screen.queryAllByRole('link'),
    ]
    for (const control of controls) {
      expect(control.textContent ?? '').not.toMatch(/buy|checkout|get tickets|add to cart/i)
    }
  })

  it('offers the waitlist instead, which is the recovery path', () => {
    mountSoldOut()
    expect(screen.getByRole('button', { name: /waitlist|notify|join/i })).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------------ */
/* past_event_state_renders                                                  */
/* ------------------------------------------------------------------------ */

describe('past_event_state_renders', () => {
  it('states that the event has ended, as a status rather than an alert', () => {
    render(<EventStateBanner state="past" organiserHandle="lane-c-organiser" />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('This event has ended.')
  })

  it('offers a way onwards, which is the whole reason the page still exists', () => {
    render(<EventStateBanner state="past" organiserHandle="lane-c-organiser" />)
    expect(screen.getByRole('link', { name: /upcoming events from this organiser/i })).toHaveAttribute(
      'href',
      '/organisers/lane-c-organiser',
    )
  })

  it('still offers a way onwards when there is no organiser handle to link to', () => {
    render(<EventStateBanner state="past" organiserHandle={null} />)
    expect(screen.getByRole('link', { name: /browse upcoming events/i })).toHaveAttribute(
      'href',
      '/events',
    )
  })

  it('is distinct from cancelled, which is an alert and mentions refunds', () => {
    render(<EventStateBanner state="cancelled" />)
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('This event has been cancelled.')
    expect(banner).toHaveTextContent(/refund/i)
  })
})
