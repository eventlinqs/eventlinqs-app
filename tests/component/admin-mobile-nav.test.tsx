import type { ReactNode, MouseEvent } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminMobileNav } from '@/components/admin/admin-mobile-nav'

// next/link needs no router in these tests: render a plain anchor and prevent
// the default navigation jsdom cannot perform, while still firing the passed
// onClick (which closes the drawer).
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: ReactNode; href: string; onClick?: (e: MouseEvent) => void }) => (
    <a
      href={href}
      onClick={e => {
        e.preventDefault()
        onClick?.(e)
      }}
    >
      {children}
    </a>
  ),
}))

const items = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Events', href: '/admin/events' },
]

describe('AdminMobileNav', () => {
  it('is closed initially and shows the hamburger', () => {
    render(<AdminMobileNav items={items} />)
    expect(screen.getByRole('button', { name: /open admin menu/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on the hamburger and renders exactly the capability-filtered links', async () => {
    const user = userEvent.setup()
    render(<AdminMobileNav items={items} />)
    await user.click(screen.getByRole('button', { name: /open admin menu/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument()
    // A route not granted to this viewer is never passed in, so it is absent.
    expect(screen.queryByRole('link', { name: 'Payouts' })).toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<AdminMobileNav items={items} />)
    await user.click(screen.getByRole('button', { name: /open admin menu/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on a backdrop click', async () => {
    const user = userEvent.setup()
    render(<AdminMobileNav items={items} />)
    await user.click(screen.getByRole('button', { name: /open admin menu/i }))

    // Two elements carry "Close admin menu": the backdrop (first) and the X.
    const closers = screen.getAllByRole('button', { name: /close admin menu/i })
    await user.click(closers[0])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when a nav link is followed', async () => {
    const user = userEvent.setup()
    render(<AdminMobileNav items={items} />)
    await user.click(screen.getByRole('button', { name: /open admin menu/i }))

    await user.click(screen.getByRole('link', { name: 'Events' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
