'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Megaphone, Send, Settings, Ticket, Users, Wallet, Workflow, type LucideIcon } from 'lucide-react'
import { activeHref, type AdminNavGroupKey, type AdminNavGroupLinks } from './admin-nav'

/**
 * The admin's one navigation by workflow (Lawal, 15 November 2026, 20:52, item 2), drawn the same in the desktop sidebar
 * and the mobile drawer: a heading per group with its icon, its pages under it, the page you are on marked in gold.
 */
const ICONS: Record<AdminNavGroupKey, LucideIcon> = {
  today: CalendarDays,
  events: Ticket,
  organisers: Users,
  outreach: Send,
  social: Megaphone,
  automation: Workflow,
  money: Wallet,
  settings: Settings,
}

export function AdminNavGroups({ groups, onFollow }: { groups: AdminNavGroupLinks[]; onFollow?: () => void }) {
  const pathname = usePathname() ?? ''
  const active = activeHref(pathname, groups.flatMap((g) => g.items))
  return (
    <ul className="flex flex-col gap-5">
      {groups.map((g) => {
        const Icon = ICONS[g.key]
        return (
          <li key={g.key} data-nav-group={g.key}>
            <p className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {g.label}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {g.items.map((i) => {
                const on = i.href === active
                return (
                  <li key={i.href}>
                    <Link prefetch={false}
                      href={i.href}
                      onClick={onFollow}
                      aria-current={on ? 'page' : undefined}
                      className={`flex min-h-[40px] items-center rounded-md px-3 text-sm transition ${
                        on
                          ? 'bg-[var(--brand-accent)]/15 font-semibold text-[var(--brand-accent-strong)]'
                          : 'text-[var(--admin-soft)] hover:bg-[var(--admin-tint-strong)] hover:text-[var(--admin-ink)]'
                      }`}
                    >
                      {i.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
