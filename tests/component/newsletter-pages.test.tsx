import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'

/*
 * THE NEWSLETTER'S PAGES (the PM's order of 21 November 2026, about 03:30; /newsletter, /newsletter/city and
 * /newsletter/refer answered 404 on production at 14:58 that day while every edition linked two of them). The shared
 * chrome suspends and is not what this file is about, so it is stood in for, as in weekend-landing-page.test.tsx.
 */
vi.mock('@/components/layout/PageShell', () => ({ PageShell: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => <header data-chrome="header" /> }))
vi.mock('@/components/layout/site-footer', () => ({ SiteFooter: () => <footer data-chrome="footer" /> }))
vi.mock('@/components/media/HeroMedia', () => ({ HeroMedia: ({ image }: { image: string }) => <span data-hero data-src={image} /> }))
vi.mock('@/components/media/CityTileImage', () => ({ CityTileImage: ({ src, alt }: { src: string; alt: string }) => <span data-tile data-src={src} aria-label={alt} /> }))
vi.mock('@/app/newsletter/city/actions', () => ({ changeNewsletterCityAction: vi.fn() }))
const row = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => row() }) }) }) }),
}))
vi.mock('@/lib/supabase/env', async (original) => ({ ...(await original<object>()), getSupabaseServiceRoleKey: () => 'service-role' }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://www.eventlinqs.com.au' }))

const { default: NewsletterPage } = await import('@/app/newsletter/page')
const { default: ManagePage } = await import('@/app/newsletter/city/page')
const { default: ReferPage } = await import('@/app/newsletter/refer/page')

const TOKEN = '0c3f5b8e-2d41-4a7b-9e10-5f6a7b8c9d0e'
const CITIES = ['melbourne', 'geelong', 'ballarat', 'bendigo']
const manage = async (sp: Record<string, string>) => render(await ManagePage({ searchParams: Promise.resolve(sp) }))

beforeEach(() => {
  row.mockReset()
  // The licensed spine's photographs live in the project's storage, so its URL is needed to name them.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
})

describe('/newsletter', () => {
  it('names both editions and gives each of the four cities its photograph, its guide and the one step subscribe', async () => {
    const { container } = render(await NewsletterPage())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Your city's best events, in your inbox")
    expect(container.querySelector('[data-edition="THE WEEK"]')?.textContent).toContain('Every Wednesday, 7am')
    expect(container.querySelector('[data-edition="THE WEEKEND"]')?.textContent).toContain('Every Friday, 7am')
    for (const slug of CITIES) {
      const card = container.querySelector(`[data-city="${slug}"]`) as HTMLElement
      expect(card).not.toBeNull()
      expect(card.querySelector('[data-tile]')?.getAttribute('data-src')).toBeTruthy()
      expect(card.querySelector(`a[href="/city/${slug}"]`)).not.toBeNull()
      expect(within(card).getByRole('button', { name: 'Subscribe' })).toBeTruthy()
    }
    expect(container.querySelector('a[href="/newsletter/city"]')).not.toBeNull()
    expect(container.querySelector('a[href="/newsletter/refer"]')).not.toBeNull()
    expect(container.textContent).not.toMatch(/[–—!]/)
  })

  it("a city's subscribe posts to the existing one step API with its city and the honeypot", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, subscribed: true, welcome: 'sent' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(await NewsletterPage())
    const card = container.querySelector('[data-city="ballarat"]') as HTMLElement
    fireEvent.change(within(card).getByPlaceholderText('you@example.com'), { target: { value: 'reader@example.com' } })
    fireEvent.submit(card.querySelector('form') as HTMLFormElement)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/newsletter/subscribe')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'reader@example.com', source: 'city', city: 'Ballarat', website: '' })
    vi.unstubAllGlobals()
  })
})

describe('/newsletter/city', () => {
  it("with a subscriber's token: their masked address, their city, one press to switch to each other city, and leave", async () => {
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'geelong', status: 'granted' }, error: null })
    const { container } = await manage({ t: TOKEN })
    expect(container.textContent).toContain('r***@example.com')
    expect(container.textContent).not.toContain('reader@example.com')
    expect(container.querySelector('[data-city="geelong"]')?.textContent).toContain('Your city now')
    for (const slug of ['melbourne', 'ballarat', 'bendigo']) {
      const b = container.querySelector(`[data-city="${slug}"] button[name="city"]`) as HTMLButtonElement
      expect(b.value).toBe(slug)
    }
    expect(container.querySelector(`input[type="hidden"][name="t"]`)?.getAttribute('value')).toBe(TOKEN)
    expect(container.querySelector(`a[href="/unsubscribe/digest/${TOKEN}"]`)).not.toBeNull()
    expect(container.querySelector('[data-city="bendigo"]')?.textContent).toContain("Get Bendigo's best events weekly. One email a week, the events worth your time.")
  })

  it('says what was saved', async () => {
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'bendigo', status: 'granted' }, error: null })
    const { container } = await manage({ t: TOKEN, saved: 'bendigo' })
    expect(container.querySelector('[data-manage-saved]')?.textContent).toBe('Saved. Your next edition is for Bendigo.')
  })

  for (const [label, sp, answer] of [
    ['no token', {}, null],
    ['a malformed token', { t: 'zzzz' }, null],
    ['a token that names no one', { t: TOKEN }, { data: null, error: null }],
    ['a reader who left', { t: TOKEN }, { data: { email: 'r@example.com', city_slug: 'geelong', status: 'withdrawn' }, error: null }],
  ] as const) {
    it(`with ${label}: the one step subscribe for each city and the signed in path, never a dead end`, async () => {
      if (answer) row.mockReturnValue(answer)
      const { container } = await manage(sp as Record<string, string>)
      expect(container.querySelector('[data-manage="subscribe"]')).not.toBeNull()
      for (const slug of CITIES) expect(container.querySelector(`[data-city="${slug}"] form`)).not.toBeNull()
      expect(container.querySelector('a[href="/account/notifications"]')).not.toBeNull()
      expect(container.querySelector('a[href="/newsletter"]')).not.toBeNull()
      if (label !== 'no token' && label !== 'a reader who left') expect(container.querySelector('[data-manage-error]')).not.toBeNull()
    })
  }
})

describe('/newsletter/refer', () => {
  it('one link with its source, the share sheet and a copy, and no reward offered', () => {
    const { container } = render(ReferPage())
    expect(container.querySelector('[data-share-url]')?.textContent).toBe('https://www.eventlinqs.com.au/newsletter?utm_source=friend&utm_medium=share&utm_campaign=newsletter_refer')
    expect(container.querySelector('[data-newsletter-share]')).not.toBeNull()
    expect(container.querySelector('[data-newsletter-copy]')).not.toBeNull()
    expect(container.textContent).toContain('Melbourne, Geelong, Ballarat and Bendigo')
    expect(container.textContent).not.toMatch(/reward|earn|prize|win\b|[–—!]/i)
  })
})
