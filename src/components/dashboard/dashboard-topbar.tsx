'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, Search, Settings, HelpCircle, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'
import type { User } from '@supabase/supabase-js'

type Props = {
  user: User
  profile: {
    full_name: string | null
    avatar_url: string | null
    role: string
  } | null
}

function initials(full: string | null, email: string): string {
  const name = (full ?? '').trim()
  if (name) {
    const parts = name.split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function DashboardTopbar({ user, profile }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = profile?.full_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? 'Account'
  const avatar = profile?.avatar_url
  const avatarInitials = initials(profile?.full_name ?? null, user.email ?? '')

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-ink-100 bg-white">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <EventlinqsLogo asLink size="md" aria-label="EventLinqs home" />

        <div className="hidden min-w-0 flex-1 max-w-md md:block">
          <label htmlFor="dashboard-search" className="sr-only">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              id="dashboard-search"
              type="search"
              placeholder="Search events, orders, tickets"
              className="h-9 w-full rounded-lg border border-ink-100 bg-canvas pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-8 w-8 rounded-full border border-ink-100 object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white"
                >
                  {avatarInitials}
                </span>
              )}
              <span className="hidden text-sm font-medium text-ink-900 sm:inline">{displayName}</span>
              <svg className="hidden h-4 w-4 text-ink-400 sm:block" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg"
              >
                <div className="border-b border-ink-100 p-4">
                  <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name ?? displayName}</p>
                  <p className="truncate text-xs text-ink-400">{user.email}</p>
                </div>
                <nav className="py-1" role="none">
                  <MenuLink href="/dashboard/organisation" icon={<Settings className="h-4 w-4" />} onClick={() => setMenuOpen(false)}>
                    Account settings
                  </MenuLink>
                  <MenuLink href="/dashboard/payouts" icon={<Wallet className="h-4 w-4" />} onClick={() => setMenuOpen(false)}>
                    Billing
                  </MenuLink>
                  <MenuLink
                    href="/help"
                    icon={<HelpCircle className="h-4 w-4" />}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                  >
                    Help centre
                  </MenuLink>
                </nav>
                <div className="border-t border-ink-100 py-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-900 transition-colors hover:bg-ink-100"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function MenuLink({
  href,
  icon,
  children,
  onClick,
  target,
  rel,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  target?: string
  rel?: string
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-900 transition-colors hover:bg-ink-100"
    >
      <span className="text-ink-600" aria-hidden="true">
        {icon}
      </span>
      {children}
    </Link>
  )
}
