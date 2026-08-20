import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThinCategoriesNote } from '@/components/features/home/thin-categories-note'

// next/link needs no router here: a plain anchor is enough to assert the href
// the user would actually follow.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

// Reveal wraps its children in an IntersectionObserver-driven container that
// jsdom has no observer for. The children are what is under test.
vi.mock('@/components/ui/reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

/**
 * THE HOMEPAGE MUST SAY SOMETHING TRUE WHEN A CATEGORY IS THIN.
 *
 * Founder ruling 16 August 2026 (docs/roast/RAIL-MIN-RULING-2026-08-16.md).
 * RAIL_MIN stands, so a category with one or two events gets no rail. What was
 * NOT acceptable was the silence: "no rail" and "no events" produced the
 * identical screen.
 *
 * These tests exist because the visible branch of this component cannot be
 * photographed on a dense preview: at real density it renders nothing at all,
 * which is by design. So the branch that only appears on a thin catalogue is
 * proven here instead of being asserted from the source.
 */
describe('the thin-categories note', () => {
  const thin = [
    { label: 'Comedy', count: 2, href: '/events?category=comedy' },
    { label: 'Sport', count: 1, href: '/events?category=sports' },
  ]

  it('names every thin category, with its REAL count', () => {
    render(<ThinCategoriesNote categories={thin} />)
    expect(screen.getByText('Comedy')).toBeInTheDocument()
    expect(screen.getByText('2 events')).toBeInTheDocument()
    expect(screen.getByText('Sport')).toBeInTheDocument()
    // Singular, because "1 events" is the tell that a count is decorative.
    expect(screen.getByText('1 event')).toBeInTheDocument()
  })

  it('links each one to the listing its rail would have linked to', () => {
    render(<ThinCategoriesNote categories={thin} />)
    const links = screen.getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/events?category=comedy',
      '/events?category=sports',
    ])
  })

  it('says WHY there is no rail, in the reader words rather than ours', () => {
    render(<ThinCategoriesNote categories={thin} />)
    expect(screen.getByRole('heading', { name: /on now, in smaller numbers/i })).toBeInTheDocument()
    expect(screen.getByText(/a rail needs three events/i)).toBeInTheDocument()
    expect(screen.getByText(/on sale now/i)).toBeInTheDocument()
  })

  it('renders NOTHING when no category is thin, so it disappears at density', () => {
    const { container } = render(<ThinCategoriesNote categories={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('carries no exclamation mark and no dash of either kind (copy law)', () => {
    const { container } = render(<ThinCategoriesNote categories={thin} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/!/)
    expect(text).not.toMatch(/—|–/)
  })
})
