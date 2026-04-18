import Link from 'next/link'
import type { ReactNode } from 'react'

type Action = { label: string; href: string; variant?: 'primary' | 'ghost' }

type Props = {
  icon: ReactNode
  title: string
  description: string
  primary?: Action
  secondary?: Action
}

export function DashboardEmptyState({ icon, title, description, primary, secondary }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
        {icon}
      </div>
      <h2 className="mt-5 font-display text-lg font-semibold text-ink-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-ink-600">{description}</p>
      {(primary || secondary) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primary && (
            <Link
              href={primary.href}
              className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            >
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
