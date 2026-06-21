import Link from 'next/link'
import type { ReactNode } from 'react'
import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'
import { HeroMedia } from '@/components/media'

type Props = {
  title: string
  subtitle?: string
  footer?: ReactNode
  children: ReactNode
}

// Licensed platform photo library (public/images/hero/*, see attribution.json).
const AUTH_BRAND_IMAGE = '/images/hero/afrobeats.jpg'

export function AuthShell({ title, subtitle, footer, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/* Desktop brand panel (lg+ only): a full-bleed platform photograph under a
          navy scrim, with the wordmark and locked taglines. Mirrors Eventbrite's
          photographic desktop auth (2026 competitor mirror) in EventLinqs
          identity. Hidden below lg, where auth stays card-only - matching the
          competitor's mobile auth. */}
      <aside className="relative hidden overflow-hidden bg-navy-950 lg:flex lg:w-[44%] xl:w-1/2">
        <HeroMedia image={AUTH_BRAND_IMAGE} alt="" priority />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(10,14,26,0.88) 0%, rgba(10,14,26,0.55) 50%, rgba(10,14,26,0.82) 100%)',
          }}
        />
        <div className="relative z-10 flex w-full flex-col justify-between p-10 text-white xl:p-14">
          <EventlinqsLogo asLink size="md" />
          <div className="hero-enter max-w-md">
            <h2 className="font-display text-3xl font-bold leading-tight xl:text-4xl">
              Every community. Every event. One platform.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/80">
              The ticketing platform built for every community.
            </p>
          </div>
          <p className="text-xs text-white/55">
            Discover events, sell tickets, and bring your community together.
          </p>
        </div>
      </aside>

      {/* Auth column */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-white px-4 sm:px-6 lg:px-8">
          <span className="lg:hidden">
            <EventlinqsLogo asLink size="md" />
          </span>
          <Link
            href="/events"
            className="text-sm font-medium text-ink-600 transition-colors hover:text-gold-600 lg:ml-auto"
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
    </div>
  )
}
