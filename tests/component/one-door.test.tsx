/**
 * ONE DOOR, TWO PATHS (Lawal's ruling of 8 November 2026, 16:13, builds 1 and 2).
 *
 * /start asks one question and offers both paths: selling on EventLinqs goes to the organiser sign up, carrying where the
 * organiser came from; already selling elsewhere goes to the listing form, carrying the city a guide named. Every
 * organiser entry that used to choose a path for the visitor (the header's Get Started, the footer's Sell tickets, a city
 * guide's hosting block, /organisers' closing band) now leads to the door. And nothing an organiser reads promises a
 * human review: publishEvent publishes in the same request once the automatic checks pass.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'

vi.mock('@/components/layout/PageShell', () => ({
  PageShell: ({ children }: { children: unknown }) => children,
}))

const { default: StartPage } = await import('@/app/start/page')
const { FOUNDING_TERMS } = await import('@/lib/payments/founding-waiver')
const { FOR_ORGANISERS } = await import('@/components/layout/site-footer')

async function door(params: Record<string, string> = {}) {
  render(await StartPage({ searchParams: Promise.resolve(params) }))
  const sell = screen.getByRole('link', { name: 'Start selling' })
  const list = screen.getByRole('link', { name: 'List your event' })
  return { sell: sell.getAttribute('href'), list: list.getAttribute('href') }
}

const read = (rel: string) => readFileSync(rel, 'utf8').replace(/\r\n/g, '\n')

describe('/start: one question, both paths', () => {
  it('asks the one question and shows both paths side by side', async () => {
    await door()
    expect(screen.getByRole('heading', { level: 1, name: 'How are you selling tickets?' })).toBeInTheDocument()
    const paths = document.querySelectorAll('[data-door-path]')
    expect([...paths].map((p) => p.getAttribute('data-door-path'))).toEqual(['sell', 'list'])
    expect(within(paths[0] as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent('Your own ticket page, checkout and payouts')
    expect(within(paths[1] as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent('List your event free')
  })

  it('renders the organiser offer from its one module, never typed', async () => {
    await door()
    expect(screen.getByText(FOUNDING_TERMS.initial)).toBeInTheDocument()
    expect(read('src/app/start/page.tsx')).not.toMatch(/six months|6 months/i)
  })

  it('sends a visitor with no source to the sign up as the door, and to the listing form', async () => {
    expect(await door()).toEqual({ sell: '/organisers/signup?src=door', list: '/submit-event#submit' })
  })

  it('carries the city a guide named on to the listing form, and the source on to the sign up', async () => {
    expect(await door({ city: 'canberra', src: 'city-guide' })).toEqual({
      sell: '/organisers/signup?src=city-guide',
      list: '/submit-event?city=canberra#submit',
    })
  })

  it('drops a city or a source that is not a plain slug rather than carrying it into a link', async () => {
    expect(await door({ city: 'x"><script>', src: 'a b' })).toEqual({ sell: '/organisers/signup?src=door', list: '/submit-event#submit' })
  })
})

describe('every organiser entry leads to the door', () => {
  it("the footer's Sell tickets", () => {
    expect(FOR_ORGANISERS.find((l) => l.label === 'Sell tickets')?.href).toBe('/start?src=footer')
  })

  it("home's List your event, and Start selling tickets on the category and pricing pages, each with its source", () => {
    expect(read('src/components/features/home/home-hero.tsx')).toContain('href="/start?src=home"')
    expect(read('src/components/templates/CategoryLandingPage.tsx')).toContain('href="/start?src=category"')
    expect(read('src/components/templates/PricingPage.tsx')).toContain('href="/start?src=pricing"')
  })

  it("the header's Get Started stays the account sign up for everyone, and that page offers a host the door", () => {
    // /signup opens 'Create your account' for a ticket buyer; sending it to 'How are you selling tickets?' would ask a
    // buyer a seller's question (Eventbrite keeps Sign Up apart from Create Events in its header, read 9 November).
    const header = read('src/components/layout/site-header-client.tsx')
    expect(header.match(/<Button href="\/signup"/g)?.length).toBe(2)
    const signup = read('src/app/(auth)/signup/page.tsx')
    expect(signup).toContain('Hosting an event?')
    expect(signup).toContain('href="/start?src=signup"')
  })

  it("/organisers' closing band offers one button to the door, not two paths chosen for the visitor", () => {
    const page = read('src/components/templates/OrganisersLandingPage.tsx')
    expect(page).toContain("href={withSignupSource('/start')}")
    expect(page).not.toMatch(/href="\/submit-event"/)
  })
})

describe('no human review is promised anywhere an organiser reads (build 2)', () => {
  const REVIEW = /submit (it )?for (review|publishing)|approved the same|same business day|reviewed against our content|once approved/i
  for (const rel of ['src/components/templates/OrganisersLandingPage.tsx', 'src/lib/help-content.ts', 'src/app/start/page.tsx']) {
    it(rel, () => {
      expect(read(rel)).not.toMatch(REVIEW)
    })
  }
})
