import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'

/*
 * /ig AND /ig?piece=<id> (the PM's RETURN of 04:05 on 24 November 2026). The page of every post behaves as before: its
 * heading, its words, its title and its read are the ones it had. With one piece named it shows that piece's own nights,
 * its heading and title from the piece, read once for the network the visitor came from; a value that is not a piece's id
 * is the page of every post. The reads are stand ins (their rules are tested in tests/unit/growth/ig-piece.test.ts); the
 * card is the approved marketplace card, stood in here only to read its link.
 */

const h = vi.hoisted(() => ({ every: vi.fn(), piece: vi.fn() }))
vi.mock('@/lib/growth/ig', () => ({ readIgItems: h.every, readIgPiecePage: h.piece }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => <header data-chrome="header" /> }))
vi.mock('@/components/layout/site-footer', () => ({ SiteFooter: () => <footer data-chrome="footer" /> }))
vi.mock('@/components/features/home-market/market-card', () => ({
  MarketEventCard: ({ card, href }: { card: { title: string }; href: string }) => <a href={href}>{card.title}</a>,
}))

const ig = await import('@/app/ig/page')

const PIECE = 'ed0c1dca-0000-4000-8000-000000000001'
const item = (id: string, title: string, href: string) => ({
  card: { id, href: `/events/${id}`, title, date: 'Fri 27 Nov', venue: 'Comedy Republic', price: null, free: false, category: null, photo: null, tonight: false },
  href,
  postId: PIECE,
})
const EVERY_POST = {
  title: 'From our Instagram | EventLinqs',
  description: 'Every event from our latest Instagram posts, newest first. Tap one for its date, venue and where to book.',
  ...noIndexMetadata(),
}

beforeEach(() => {
  h.every.mockReset()
  h.piece.mockReset()
})

describe('/ig without a piece behaves as before', () => {
  for (const query of [{}, { piece: 'not-a-piece' }, { piece: ['also-not', PIECE] }, { utm_source: 'facebook' }]) {
    it(`the page of every post, newest first (${JSON.stringify(query)})`, async () => {
      h.every.mockResolvedValue([item('a', 'Night A', '/events/a?utm_source=instagram&utm_medium=social&utm_campaign=ig&utm_content=p1')])
      render(await ig.default({ searchParams: Promise.resolve(query) }))
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('From our Instagram')
      expect(screen.getByText('Every event from our latest posts, newest first. Tap one for its date, venue and where to book.')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Night A' }).getAttribute('href')).toBe('/events/a?utm_source=instagram&utm_medium=social&utm_campaign=ig&utm_content=p1')
      expect(h.every).toHaveBeenCalledTimes(1)
      expect(h.piece).not.toHaveBeenCalled()
      expect(await ig.generateMetadata({ searchParams: Promise.resolve(query) })).toEqual(EVERY_POST)
    })
  }

  it('keeps its five minute window and its empty and unread words', async () => {
    expect(ig.revalidate).toBe(300)
    h.every.mockResolvedValue([])
    const { unmount } = render(await ig.default({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Nothing from our latest posts is still ahead right now. Everything on is one tap away.')).toBeTruthy()
    unmount()
    h.every.mockRejectedValue(new Error('read failed'))
    render(await ig.default({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Our latest posts could not be loaded just now. Everything on is still one tap away.')).toBeTruthy()
  })
})

describe('/ig?piece=<id> shows that piece and only it', () => {
  it("its own nights, its heading and title from the piece, read for the network the visitor came from", async () => {
    h.piece.mockResolvedValue({
      heading: 'Three shows at Comedy Republic, Friday 27 to Sunday 29 November',
      items: [
        item('main', 'Comedy Republic Main Stage', `/events/main?utm_source=facebook&utm_medium=social&utm_campaign=ig&utm_content=${PIECE}`),
        item('improv', 'Holy Sh!t Improv', `/events/improv?utm_source=facebook&utm_medium=social&utm_campaign=ig&utm_content=${PIECE}`),
      ],
    })
    const query = { piece: PIECE.toUpperCase(), utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'go' }
    render(await ig.default({ searchParams: Promise.resolve(query) }))
    expect(h.piece).toHaveBeenCalledWith(PIECE, 'facebook')
    expect(h.every).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Three shows at Comedy Republic, Friday 27 to Sunday 29 November')
    expect(screen.getByText('The events from this post, in date order. Tap one for its date, venue and where to book.')).toBeTruthy()
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/events/')).map((a) => a.textContent)).toEqual(['Comedy Republic Main Stage', 'Holy Sh!t Improv'])
    expect((await ig.generateMetadata({ searchParams: Promise.resolve(query) })).title).toBe('Three shows at Comedy Republic, Friday 27 to Sunday 29 November | EventLinqs')
  })

  it('a piece with nothing still ahead says so, and one that cannot be read says that', async () => {
    h.piece.mockResolvedValue({ heading: null, items: [] })
    const { unmount } = render(await ig.default({ searchParams: Promise.resolve({ piece: PIECE }) }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('From our post')
    expect(screen.getByText('Nothing from this post is still ahead right now. Everything on is one tap away.')).toBeTruthy()
    unmount()
    h.piece.mockRejectedValue(new Error('read failed'))
    render(await ig.default({ searchParams: Promise.resolve({ piece: PIECE }) }))
    expect(screen.getByText('This post could not be loaded just now. Everything on is still one tap away.')).toBeTruthy()
    expect((await ig.generateMetadata({ searchParams: Promise.resolve({ piece: PIECE }) })).title).toBe('From our post | EventLinqs')
  })
})
