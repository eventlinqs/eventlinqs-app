// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SiteHeaderAccountDropdown } from '@/components/layout/site-header-account-dropdown'

// signOut is a server action; stub it so importing the client component in jsdom
// does not pull server-only modules.
vi.mock('@/app/actions/auth', () => ({ signOut: vi.fn() }))

const USER = { initials: 'LA', displayName: 'Lawal Adams', email: 'lawal@example.com' }

afterEach(cleanup)

// The menu items render inside the panel, which opens on the avatar trigger
// (the only button before the panel is open).
function openMenu() {
  fireEvent.click(screen.getByRole('button'))
}

describe('account menu Admin entry is role-gated (single login)', () => {
  test('admin: an Admin entry is present and points at /admin', () => {
    render(<SiteHeaderAccountDropdown user={USER} isAdmin />)
    openMenu()
    const admin = screen.getByRole('menuitem', { name: 'Admin' })
    expect(admin.getAttribute('href')).toBe('/admin')
  })

  test('non-admin: NO Admin entry at all (normal items still render)', () => {
    render(<SiteHeaderAccountDropdown user={USER} isAdmin={false} />)
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull()
    // sanity: the normal account menu still works
    expect(screen.getByRole('menuitem', { name: 'Account' })).toBeTruthy()
  })

  test('default (no isAdmin prop): treated as non-admin, no Admin entry', () => {
    render(<SiteHeaderAccountDropdown user={USER} />)
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull()
  })
})
