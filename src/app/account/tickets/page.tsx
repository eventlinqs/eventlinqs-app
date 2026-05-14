import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'

export const metadata: Metadata = {
  title: 'My tickets | EventLinqs',
  description: 'Tickets you have purchased on EventLinqs.',
  robots: { index: false, follow: false },
}

/**
 * /account/tickets stub (Batch 9.2.1).
 *
 * The avatar dropdown surfaces this route as a top-level destination. The
 * full tickets dashboard ships in M5/M7 alongside the orders pipeline; this
 * stub keeps the destination resolvable so the dropdown link does not 404
 * pre-launch.
 */
export default async function TicketsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login?next=/account/tickets')

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent-strong)]">
            Your account
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            My tickets
          </h1>
          <p className="mt-3 text-base text-ink-600 sm:text-lg">
            Your purchased tickets will appear here. The full ticket wallet ships with the next release.
          </p>
          <div className="mt-10 rounded-2xl border border-ink-100 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">
              No tickets yet. Browse upcoming events and grab your first ticket.
            </p>
            <Link
              href="/events"
              prefetch={false}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-[var(--color-navy-950)] px-6 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Browse events
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
