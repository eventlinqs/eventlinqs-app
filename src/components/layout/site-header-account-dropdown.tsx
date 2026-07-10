'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Bookmark, Building2, LogOut, ShieldCheck, Ticket, User } from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import type { AccountUser } from './site-header-account-button'

interface DropdownUser extends AccountUser {
  email: string
}

interface Props {
  user: DropdownUser
  /** Visual size: `header` (32px desktop avatar) or `drawer` (40px mobile drawer header). */
  size?: 'header' | 'drawer'
  /** Founder/admin only: surface the in-platform Admin entry. Convenience only -
   *  the admin console itself enforces role + 2FA server-side on every route and
   *  privileged action; a non-admin never receives this flag and never sees it. */
  isAdmin?: boolean
}

interface MenuItem {
  label: string
  href: string
  Icon: typeof User
}

const ITEMS: MenuItem[] = [
  { label: 'Account',        href: '/account',          Icon: User },
  { label: 'My tickets',     href: '/tickets',          Icon: Ticket },
  { label: 'Saved events',   href: '/account/saved',    Icon: Bookmark },
  { label: 'For organisers', href: '/organisers',       Icon: Building2 },
]

/**
 * SiteHeaderAccountDropdown (Batch 9.2.1) - solid navy popover that
 * surfaces the account menu and sign-out action.
 *
 * Visual: solid opaque navy `rgb(10,22,40)` (no glassmorphism, per the
 * design system) + gold edge `rgba(212,160,23,0.30)`, 280px wide, 12px
 * padding, slide-down 8px + fade 200ms `cubic-bezier(0.22, 1, 0.36, 1)`
 * open animation. Matches the SiteHeader State B header chrome.
 *
 * Trigger: 32px circular avatar (or 40px in the drawer variant) with the
 * user's initials in white over a navy fill with 1px gold border. Hover
 * lifts 1.05x, focus-visible gold ring with 2px offset against the navy
 * header. Carries the `plausible-event-name=account_avatar_click` class
 * for analytics.
 *
 * Accessibility:
 *   - Trigger: aria-haspopup="menu", aria-expanded reflects open state
 *   - Panel: role="menu", aria-label points to the user's display name
 *   - Each item: role="menuitem", tabIndex=-1 (roving), focusable via Arrow keys
 *   - ArrowDown / ArrowUp navigate, Home / End jump, Enter activates
 *   - Escape closes and returns focus to the trigger
 *   - Click outside closes
 *   - Focus trap inside the dropdown while open (Tab cycles)
 */
export function SiteHeaderAccountDropdown({ user, size = 'header', isAdmin = false }: Props) {
  // The Admin entry is role-gated: shown only when the server resolved this user
  // as an admin. A normal account never gets isAdmin and never sees it, and /admin
  // is blocked server-side (role + 2FA) even if the path is typed directly.
  const items: MenuItem[] = isAdmin
    ? [{ label: 'Admin', href: '/admin', Icon: ShieldCheck }, ...ITEMS]
    : ITEMS
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([])

  const isDrawer = size === 'drawer'

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    setTimeout(() => triggerRef.current?.focus(), 0)
  }, [])

  // Click outside closes.
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return
      setOpen(false)
      setActiveIndex(-1)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  // Escape closes globally.
  useEffect(() => {
    if (!open) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // When opening, focus the first item after the panel mounts.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      setActiveIndex(0)
      itemRefs.current[0]?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [open])

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
    }
  }

  // Total focusable rows: the menu items + 1 sign-out.
  const totalItems = items.length + 1

  function handlePanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = (activeIndex + 1) % totalItems
        setActiveIndex(next)
        itemRefs.current[next]?.focus()
        return
      }
      case 'ArrowUp': {
        e.preventDefault()
        const next = activeIndex <= 0 ? totalItems - 1 : activeIndex - 1
        setActiveIndex(next)
        itemRefs.current[next]?.focus()
        return
      }
      case 'Home': {
        e.preventDefault()
        setActiveIndex(0)
        itemRefs.current[0]?.focus()
        return
      }
      case 'End': {
        e.preventDefault()
        setActiveIndex(totalItems - 1)
        itemRefs.current[totalItems - 1]?.focus()
        return
      }
      case 'Tab': {
        // Focus trap: cycle within the panel.
        const focusables = itemRefs.current.filter(Boolean) as HTMLElement[]
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
        return
      }
      default:
        return
    }
  }

  // Avatar visual; reuses the AccountButton's circle but as a span inside
  // the trigger button rather than a Link, so it can act as a popover
  // trigger.
  const initialsCircle = (
    <span
      aria-hidden
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'font-display font-semibold uppercase tracking-tight text-white',
        isDrawer ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-[11px]',
      ].join(' ')}
      style={{
        backgroundColor: 'var(--color-navy-950)',
        border: '1px solid var(--brand-accent)',
      }}
    >
      {user.initials}
    </span>
  )

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.displayName}`}
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={[
          'plausible-event-name=account_avatar_click',
          'inline-flex items-center gap-3 rounded-full',
          'transition-transform duration-200 motion-reduce:transition-none',
          'hover:scale-[1.05] motion-reduce:hover:scale-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]',
        ].join(' ')}
        style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        {initialsCircle}
        {isDrawer ? (
          <span className="text-sm font-semibold text-ink-900">{user.displayName}</span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label={`Account menu for ${user.displayName}`}
          onKeyDown={handlePanelKeyDown}
          className={[
            'absolute right-0 z-[55] mt-3 w-[280px] origin-top-right rounded-xl p-2',
            'el-fade-slide',
          ].join(' ')}
          style={{
            background: 'rgb(10, 22, 40)',
            border: '1px solid rgba(212, 160, 23, 0.30)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
          }}
        >
          <div className="px-3 py-2">
            <p className="font-display text-sm font-semibold leading-tight text-white">
              {user.displayName}
            </p>
            <p className="mt-0.5 truncate text-xs text-white/70">{user.email}</p>
          </div>

          <div
            aria-hidden
            className="my-1 h-px"
            style={{ background: 'rgba(212, 160, 23, 0.20)' }}
          />

          {items.map((item, idx) => {
            const Icon = item.Icon
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                tabIndex={-1}
                ref={el => { itemRefs.current[idx] = el }}
                prefetch={false}
                onClick={close}
                className={[
                  'flex h-10 items-center gap-3 rounded-md px-3',
                  'text-sm font-medium text-white/90 transition',
                  'hover:bg-[rgba(212,160,23,0.10)] hover:text-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 text-white/70" aria-hidden />
                {item.label}
              </Link>
            )
          })}

          <div
            aria-hidden
            className="my-1 h-px"
            style={{ background: 'rgba(212, 160, 23, 0.20)' }}
          />

          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              tabIndex={-1}
              ref={el => { itemRefs.current[items.length] = el }}
              className={[
                'flex h-10 w-full items-center gap-3 rounded-md px-3 text-left',
                'text-sm font-medium text-white/90 transition',
                'hover:bg-[rgba(212,160,23,0.10)] hover:text-white',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset',
              ].join(' ')}
            >
              <LogOut className="h-4 w-4 text-white/70" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
