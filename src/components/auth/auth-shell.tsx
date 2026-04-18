import Link from 'next/link'
import type { ReactNode } from 'react'
import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'

type Props = {
  title: string
  subtitle?: string
  footer?: ReactNode
  children: ReactNode
}

export function AuthShell({ title, subtitle, footer, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-white px-4 sm:px-6 lg:px-8">
        <EventlinqsLogo asLink size="md" />
        <Link
          href="/events"
          className="text-sm font-medium text-ink-600 transition-colors hover:text-gold-600"
        >
          Browse events
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
              {subtitle && <p className="mt-2 text-sm text-ink-600">{subtitle}</p>}
            </div>
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-ink-600">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
