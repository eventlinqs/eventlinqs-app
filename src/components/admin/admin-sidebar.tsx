import Link from 'next/link'
import { ADMIN_NAV } from './admin-nav'

/**
 * Persistent admin sidebar (desktop). Sections shown only if the active role
 * carries the matching capability. Every item resolves to a live route. The
 * mobile drawer renders the same list (admin-nav.ts) so the two never drift.
 */
export function AdminSidebar({ capabilities }: { capabilities: readonly string[] }) {
  const items = ADMIN_NAV.filter(i => capabilities.includes(i.capability))

  return (
    <aside className="hidden w-60 shrink-0 border-r border-white/[0.08] bg-[#0A0F1A] lg:block">
      <div className="px-6 py-7">
        <Link href="/admin" className="block">
          <span className="block font-display text-lg font-extrabold tracking-tight">
            EVENTLINQS
          </span>
          <span className="block text-[11px] uppercase tracking-[0.2em] text-white/50">
            Admin console
          </span>
        </Link>
      </div>
      <nav className="px-3" aria-label="Admin sections">
        <ul className="flex flex-col gap-1">
          {items.map(i => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="block rounded-md px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white"
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
