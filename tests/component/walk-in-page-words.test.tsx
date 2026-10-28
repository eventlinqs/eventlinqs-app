import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'

/*
 * The shared chrome is outside the word ban (Lawal's ruling 1 of 21 October
 * 2026) and is a server component with its own reads, so it is stood in for.
 * Everything between the header and the footer is the real walk-in view.
 */
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => <header data-chrome="header" /> }))
vi.mock('@/components/layout/site-footer', () => ({ SiteFooter: () => <footer data-chrome="footer" /> }))
vi.mock('@/app/actions/event-reminder', () => ({ requestEventReminder: vi.fn(async () => ({ ok: true, message: 'Done.' })) }))
vi.mock('@/app/actions/follow', () => ({
  getFollowState: vi.fn(async () => ({ following: false })),
  toggleFollowOrganiser: vi.fn(),
  toggleFollowArtist: vi.fn(),
  toggleFollowScene: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/events/amcf-2026',
  useSearchParams: () => new URLSearchParams(),
}))

import { WalkInEventView } from '@/components/events/walk-in/walk-in-event-page'
import { parseGuide } from '@/lib/walk-in/guide'

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ links: null }), { status: 200 })) as never
  // The page reads the clock: an ended event shows no Remind me. The fixture ends
  // on 22 November 2026, so without a fixed "now" this file would go red on
  // 23 November with nothing changed. Only Date is faked; React's timers are not.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

/**
 * WI1, LAWAL'S CHANGE 1 OF 21 OCTOBER 2026: "The rendered page test checks for
 * no dollar sign only outside data-text-source="organiser". Lines EventLinqs
 * writes ... carry no dollar sign and no banned word." And ruling 2: "Only text
 * the organiser supplies shows as written, so the AMCF workshop line stays."
 *
 * The fixture is design A's own content, with two organiser lines that would
 * trip the ban if EventLinqs had written them: "Bookings open through AMCF"
 * and "Food stalls from $10".
 */
const guide = parseGuide({
  days: [
    {
      date: '2026-11-20',
      opens: null,
      hours_label: '[10am or 11am, to confirm]',
      closes: '22:00',
      items: [
        { when: 'Opening', what: 'Welcome to Country by the Wurundjeri people of the Kulin Nation' },
        { when: 'All day', what: 'Short films, art and spoken word' },
      ],
      closer: { name: 'Niasha', note: 'Zimbabwean artist' },
    },
    { date: '2026-11-21', opens: '10:00', closes: '22:00', items: [{ when: '9pm', what: 'Elsy Wameyo on the Main Stage' }], closer: { name: 'Elsy Wameyo', note: 'Kenyan artist, Main Stage from 9pm' } },
    { date: '2026-11-22', opens: '10:00', closes: '20:00', items: [], closer: null },
  ],
  at_a_glance: [
    { value: '13th', label: 'year at Fed Square' },
    { value: 'Free', label: 'for every visitor' },
  ],
  highlights: [
    { title: 'Food from across Africa', body: 'Food stalls from $10. Injera, jollof rice, fufu and sweets.' },
    { title: 'Art workshops at The Edge', body: '30 places a session. Bookings open through AMCF.' },
  ],
  program_note: "The full timetable is still to come from AMCF. Times shown are from Fed Square and AMCF's published details.",
  quote_text: 'Thirteen years ago, we started the African Music and Cultural Festival.',
  quote_attribution: 'Fred Alale AM, Chair, AMCF',
  getting_there: 'Corner of Swanston and Flinders Streets.',
  access_notes: 'Lift access to all main areas, accessible toilets and hearing loops.',
  photos_heading: 'From past festivals',
  cover_credit: 'AMCF, past festival',
  photo_credit: 'African Music and Cultural Festival',
})
if (!guide.ok) throw new Error(guide.problems.join('; '))

const event = {
  id: '7f3a2c1e-0b4d-4e5f-9a6b-1c2d3e4f5a6b',
  slug: 'amcf-2026',
  title: 'African Music and Cultural Festival 2026',
  summary: 'Three days of African music, food and dance in the heart of Melbourne. Free for everyone, all weekend.',
  description: null,
  status: 'published',
  visibility: 'public',
  entry_mode: 'walk_in',
  listing_source: 'organiser',
  timezone: 'Australia/Melbourne',
  start_date: '2026-11-19T23:00:00Z',
  end_date: '2026-11-22T09:00:00Z',
  created_at: '2026-10-21T00:00:00Z',
  event_type: 'in_person',
  venue_name: 'Fed Square',
  venue_address: 'Swanston St and Flinders St',
  venue_city: 'Melbourne',
  venue_state: 'VIC',
  venue_postal_code: '3000',
  venue_country: 'AU',
  venue_latitude: -37.818,
  venue_longitude: 144.969,
  city_primary: 'melbourne',
  cover_image_url: 'https://cdn.example.com/amcf.avif',
  cover_image_alt: 'Women dancing in the crowd at Fed Square',
  gallery_urls: [{ url: 'https://cdn.example.com/food.avif', alt: 'Food' }, { url: 'https://cdn.example.com/drums.avif', alt: 'Drums' }],
  is_age_restricted: false,
  age_restriction_min: null,
  ticket_tiers: [],
  category: { id: 'c', name: 'Festival', slug: 'festival' },
  organisation: {
    id: 'o',
    name: 'African Music and Cultural Festival',
    slug: 'amcf',
    website: 'https://amcf.org.au',
    instagram_handle: 'AMCFOZ',
    short_name: 'AMCF',
  },
} as never

function drawn() {
  return render(
    <WalkInEventView
      event={event}
      guide={guide.ok ? guide.guide : (null as never)}
      remindMeOn
      now={Date.now()}
      baseUrl="https://www.eventlinqs.com.au"
      hero={{ image: 'https://cdn.example.com/amcf.avif', alt: 'Women dancing in the crowd at Fed Square' }}
    />,
  )
}

/** All rendered text outside organiser-supplied text, the chrome and scripts. */
function eventlinqsWords(root: HTMLElement): string {
  const out: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.dataset.textSource === 'organiser') return
    if (node.dataset.chrome) return
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(root)
  return out.join(' ')
}

const ALLOWED = ['Free entry, no ticket needed', 'Free, no ticket needed', 'Free · No ticket needed', 'No ticket needed']

describe('a walk-in page, read as rendered', () => {
  it('EventLinqs writes no ticket or book word but "No ticket needed", and no dollar sign', () => {
    const { container } = drawn()
    let words = eventlinqsWords(container)
    for (const phrase of ALLOWED) words = words.split(phrase).join(' ')
    expect(words).not.toMatch(/\btickets?\b/i)
    expect(words).not.toMatch(/\bbook(s|ed|ing|ings)?\b/i)
    expect(eventlinqsWords(container)).not.toMatch(/\$/)
  })

  it('the organiser text shows exactly as written, dollar sign and booking included', () => {
    const { container } = drawn()
    const organiser = Array.from(container.querySelectorAll('[data-text-source="organiser"]'))
      .map((n) => n.textContent)
      .join(' | ')
    expect(organiser).toContain('Food stalls from $10.')
    expect(organiser).toContain('Bookings open through AMCF.')
  })

  it('says the words design A sets: Free entry, No ticket needed, the entry line and Remind me', () => {
    const { container } = drawn()
    const text = container.textContent ?? ''
    expect(text).toContain('No ticket needed')
    expect(text).toContain('Entry is free on all three days. Just come along.')
    expect(text).toContain('The weekend, day by day')
    expect(text).toContain('All three days')
    expect(text).toContain('Get the program when it lands')
    expect(text).toContain('We send the full timetable when AMCF releases it, one reminder the day before, and a short note if it is called off. Nothing else.')
    expect(text).toContain('Follow AMCF')
    expect(text).toContain('@AMCFOZ')
  })

  it('renders no ticket selector, no checkout and no Get tickets control', () => {
    const { container } = drawn()
    expect(container.textContent).not.toMatch(/Get tickets|Checkout|Select tickets/)
    expect(container.querySelector('#tickets')).toBeNull()
  })

  it('carries the honeypot, hidden from people, from the tab order and from assistive technology', () => {
    const { container } = drawn()
    const trap = container.querySelector('input[name="remind_extra_note"]') as HTMLInputElement | null
    expect(trap).not.toBeNull()
    expect(trap!.tabIndex).toBe(-1)
    expect(trap!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(trap!.autocomplete).toBe('off')
  })

  it('the structured data says free at price 0 and names no ticket', () => {
    const { container } = drawn()
    const block = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => s.textContent ?? '')
      .find((t) => t.includes('"offers"'))
    expect(block).toBeTruthy()
    const payload = JSON.parse(block!)
    expect(Number(payload.offers[0].price)).toBe(0)
    expect(payload.isAccessibleForFree).toBe(true)
    expect(block).not.toMatch(/\b(tickets?|book\w*)\b/i)
  })

  it('on a listing EventLinqs wrote, its lines are marked as ours and its names stay the event\'s own', () => {
    const ours = { ...(event as Record<string, unknown>), listing_source: 'eventlinqs' } as never
    const { container } = render(
      <WalkInEventView
        event={ours}
        guide={guide.ok ? guide.guide : (null as never)}
        remindMeOn
        now={Date.now()}
        baseUrl="https://www.eventlinqs.com.au"
        hero={{ image: 'https://cdn.example.com/amcf.avif', alt: '' }}
      />,
    )
    const ourLines = Array.from(container.querySelectorAll('[data-text-source="eventlinqs"]')).map((n) => n.textContent ?? '')
    expect(ourLines.join(' ')).toContain('Three days of African music, food and dance')
    expect(container.querySelector('h1')?.getAttribute('data-text-source')).toBe('organiser')
  })

  it('with Remind me switched off there is no email box and no Remind me button', () => {
    const { container } = render(
      <WalkInEventView
        event={event}
        guide={guide.ok ? guide.guide : (null as never)}
        remindMeOn={false}
        now={Date.now()}
        baseUrl="https://www.eventlinqs.com.au"
        hero={{ image: 'https://cdn.example.com/amcf.avif', alt: '' }}
      />,
    )
    expect(container.querySelector('input[type="email"]')).toBeNull()
    expect(container.textContent).not.toContain('Remind me')
    expect(container.textContent).toContain('Add to calendar')
  })

  it('offers Add to calendar on a phone too, outside the desktop panel (found driving AMCF at 390, 27 October 2026)', () => {
    const { container } = drawn()
    const phone = container.querySelector('[data-testid="phone-calendar"]')
    expect(phone).not.toBeNull()
    expect(phone!.closest('aside')).toBeNull()
    expect(phone!.className).toContain('lg:hidden')
    expect(phone!.textContent).toContain('Add to calendar')
  })
})

describe('the one button that leaves, on a curated listing (WI3)', () => {
  const pages = { websiteUrl: 'https://www.fedsquare.com/', checkedUrl: 'https://someguide.example/amcf' }
  const drawWith = (listingSource: string, withPages: typeof pages | Record<string, never>) =>
    render(
      <WalkInEventView
        event={{ ...(event as Record<string, unknown>), listing_source: listingSource } as never}
        guide={guide.ok ? guide.guide : (null as never)}
        remindMeOn={false}
        now={Date.now()}
        baseUrl="https://www.eventlinqs.com.au"
        hero={{ image: 'https://cdn.example.com/amcf.avif', alt: '' }}
        pages={withPages}
      />,
    )

  it("draws one button to the host's own site, named for the host, on the phone and in the panel", () => {
    const { container } = drawWith('eventlinqs', pages)
    const links = Array.from(container.querySelectorAll('[data-outbound] a'))
    expect(links.length).toBe(2)
    for (const a of links) {
      // B2: every leaving button goes through /out, which counts the press and follows only this event's own pages.
      expect(a.getAttribute('href')).toBe('/out/amcf-2026?to=https%3A%2F%2Fwww.fedsquare.com%2F')
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
      expect(a.textContent).toMatch(/^See it on .+'s page$/)
    }
    expect(container.textContent).toContain('Opens fedsquare.com')
  })

  it("draws none on an organiser's own event, which is its own page here", () => {
    const { container } = drawWith('organiser', pages)
    expect(container.querySelector('[data-outbound]')).toBeNull()
  })

  it('draws none, never a dead one, where the listing holds no page', () => {
    const { container } = drawWith('eventlinqs', {})
    expect(container.querySelector('[data-outbound]')).toBeNull()
  })
})
