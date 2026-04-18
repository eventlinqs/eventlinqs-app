import Link from 'next/link'
import { PlusCircle, Palette, UserPlus } from 'lucide-react'

type Action = {
  label: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  badge?: string
}

const ACTIONS: Action[] = [
  {
    label: 'Create event',
    description: 'Publish a new event in minutes.',
    href: '/dashboard/events/create',
    icon: PlusCircle,
  },
  {
    label: 'Customise organiser page',
    description: 'Update your brand, bio, and links.',
    href: '/dashboard/organisation',
    icon: Palette,
  },
  {
    label: 'Invite team member',
    description: 'Add a teammate to manage your events.',
    href: '#',
    icon: UserPlus,
    disabled: true,
    badge: 'Soon',
  },
]

export function QuickActionsPanel() {
  return (
    <section className="rounded-xl border border-ink-100 bg-white">
      <header className="border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">Quick actions</h2>
      </header>
      <ul className="divide-y divide-ink-100">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          const inner = (
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-100 text-gold-600">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink-900">{action.label}</p>
                  {action.badge && (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                      {action.badge}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-ink-600">{action.description}</p>
              </div>
            </div>
          )

          return (
            <li key={action.label}>
              {action.disabled ? (
                <div className="cursor-not-allowed opacity-60">{inner}</div>
              ) : (
                <Link href={action.href} className="block transition-colors hover:bg-ink-100/60">
                  {inner}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
