'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  LayoutDashboard,
  PanelLeft,
  PlusCircle,
  Settings,
  Ticket,
  Users,
  Wallet,
  HelpCircle,
} from 'lucide-react'

type Item = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  match?: (pathname: string) => boolean
  organiserOnly?: boolean
  emphasis?: 'gold'
  badge?: string
  external?: boolean
}

const ITEMS: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dashboard' },
  { href: '/dashboard/events', label: 'My events', icon: Calendar, organiserOnly: true },
  {
    href: '/dashboard/events/create',
    label: 'Create event',
    icon: PlusCircle,
    organiserOnly: true,
    emphasis: 'gold',
  },
  { href: '/dashboard/tickets', label: 'My tickets', icon: Ticket },
  { href: '/dashboard/my-waitlists', label: 'Waitlists', icon: Hourglass },
  { href: '/dashboard/my-squads', label: 'Squads', icon: Users },
  { href: '/dashboard/insights', label: 'Insights', icon: BarChart3, organiserOnly: true, badge: 'Soon' },
  { href: '/dashboard/payouts', label: 'Payouts', icon: Wallet, organiserOnly: true, badge: 'Soon' },
  { href: '/dashboard/organisation', label: 'Organisation', icon: Settings, organiserOnly: true },
  { href: '/help', label: 'Help', icon: HelpCircle, external: true },
]

type Props = {
  profile: { role?: string } | null
  initialCollapsed?: boolean
}

const COOKIE_KEY = 'el_sidebar_collapsed'

export function DashboardSidebar({ profile, initialCollapsed = false }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed)

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      document.cookie = `${COOKIE_KEY}=${next ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
      return next
    })
  }

  const isOrganiser =
    profile?.role === 'organiser' || profile?.role === 'admin' || profile?.role === 'super_admin'

  const visibleItems = ITEMS.filter((item) => !item.organiserOnly || isOrganiser)

  return (
    <aside
      aria-label="Dashboard navigation"
      className={[
        'sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 border-r border-ink-100 bg-white transition-[width] duration-200 ease-out md:block',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      <div className="flex h-full flex-col">
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon
              const active = item.match ? item.match(pathname) : pathname.startsWith(item.href)
              const isGold = item.emphasis === 'gold'

              const base = [
                'group relative flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
                collapsed ? 'justify-center px-0' : '',
              ].filter(Boolean).join(' ')

              const stateCls = active
                ? 'bg-ink-100 text-ink-900 font-semibold before:absolute before:left-0 before:top-1.5 before:h-7 before:w-1 before:rounded-r before:bg-gold-500'
                : isGold
                  ? 'bg-gold-100/70 text-ink-900 hover:bg-gold-100'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={[base, stateCls].join(' ')}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      className={[
                        'h-[18px] w-[18px] shrink-0',
                        isGold ? 'text-gold-600' : '',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                    {!collapsed && (
                      <span className="flex flex-1 items-center justify-between gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-600 group-hover:bg-white">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-ink-100 p-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            className={[
              'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
              collapsed ? 'justify-center px-0' : '',
            ].join(' ')}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeft className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1 text-left">Collapse</span>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
