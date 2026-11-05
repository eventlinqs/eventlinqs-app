import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/*
 * EVERY TAP ANSWERS AT ONCE (the CONTROLLER's 14:10 of 3 November 2026; acceptance-live's every-tap on
 * www.eventlinqs.com.au at 22:20 opened two faults): 'Open search: the page changes in 321 ms' (the overlay's chunk lands
 * after a first tap, and nothing on the button answered before it), and 'Follow AMCF: DEAD TAP' (the button was disabled
 * 2.1 to 2.8 s after load while it read the follow state, looking enabled). Each control now answers on the tap itself.
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => '/events/amcf-2026' }))
// The overlay arrives by its own import on the first tap; this test is about the tap answering BEFORE it, so the overlay is
// a stub here. A real one loaded after the test's end and failed CI on the train of 5 November 2026: 'EnvironmentTeardownError:
// Cannot load '/src/lib/analytics/measurement-off.ts' imported from .../plausible.ts after the environment was torn down'.
vi.mock('@/components/layout/header-search-overlay', () => ({ HeaderSearchOverlay: () => null }))

let resolveState: (v: { following: boolean; requiresAuth?: boolean }) => void = () => {}
vi.mock('@/app/actions/follow', () => ({
  getFollowState: () => new Promise((r) => { resolveState = r }),
  toggleFollowOrganiser: vi.fn(async () => ({ following: false, requiresAuth: true })),
  toggleFollowArtist: vi.fn(),
  toggleFollowScene: vi.fn(),
}))

import { HeaderSearchTrigger } from '@/components/layout/header-search-trigger'
import { FollowButton } from '@/components/features/follow/follow-button'

describe('the search button answers on the tap, before its overlay arrives', () => {
  it.each(['mobile-icon', 'desktop-pill'] as const)('%s: aria-expanded and its open look on the tap itself', (variant) => {
    render(<HeaderSearchTrigger variant={variant} />)
    const button = screen.getByRole('button', { name: 'Open search' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.className).toMatch(/bg-white\/1[05]/)
  })
})

describe('the Follow button is tappable from first paint and answers at once', () => {
  it('is enabled before its follow state comes back', () => {
    render(<FollowButton type="organiser" id="01e36975-f4e0-4f43-98ca-040ac0630e0c" label="Follow AMCF" />)
    expect((screen.getByRole('button', { name: 'Follow AMCF' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('signed out (known from the state read), a tap says so at once and opens sign in', async () => {
    push.mockClear()
    render(<FollowButton type="organiser" id="01e36975-f4e0-4f43-98ca-040ac0630e0c" label="Follow AMCF" />)
    await act(async () => { resolveState({ following: false, requiresAuth: true }) })
    fireEvent.click(screen.getByRole('button', { name: 'Follow AMCF' }))
    expect(screen.getByRole('button', { name: 'Sign in to follow' })).toBeTruthy()
    expect(push).toHaveBeenCalledWith('/login?redirect=%2F')
  })

  it('before the state is known, a tap flips at once (the optimistic answer), then the server settles it', async () => {
    push.mockClear()
    render(<FollowButton type="organiser" id="01e36975-f4e0-4f43-98ca-040ac0630e0c" label="Follow AMCF" />)
    const button = screen.getByRole('button', { name: 'Follow AMCF' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})
