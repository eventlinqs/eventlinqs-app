import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'

export const metadata: Metadata = {
  title: 'Saved events | EventLinqs',
  description: 'Events you have saved on EventLinqs.',
  robots: { index: false, follow: false },
}

/**
 * /account/saved stub (Batch 9.2.1).
 *
 * Companion to /account/tickets. Surfaces the saved-events shelf via the
 * avatar dropdown without a 404. Full saved-events pipeline ships with M7.
 */
export default async function SavedPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login?next=/account/saved')

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent-strong)]">
            Your account
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            Saved events
          </h1>
          <p className="mt-3 text-base text-ink-600 sm:text-lg">
            Events you save for later will appear here. Tap the heart on any event card to add it to your shelf.
          </p>
          <div className="mt-10 rounded-2xl border border-ink-100 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">No saved events yet. Find something worth remembering.</p>
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
