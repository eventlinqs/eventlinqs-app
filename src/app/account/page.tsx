import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'

export const metadata: Metadata = {
  title: 'Your account | EventLinqs',
  description: 'Manage your tickets, saved events, and account preferences.',
  robots: { index: false, follow: false },
}

/**
 * /account - minimal stub (Batch 9.1.1).
 *
 * The dual-state header avatar renders /account as the click target. This
 * page is the landing surface for the avatar interaction. The full account
 * dashboard (tickets, saved events, payment methods, preferences) ships in
 * 9.2 alongside the avatar dropdown menu.
 *
 * For 9.1.1 the stub:
 *   - Verifies authentication and redirects to /login if anonymous (no
 *     leaking of an empty account shell to logged-out visitors).
 *   - Shows the user's display name and a short list of placeholder links
 *     to the surfaces the dashboard will own.
 */
export default async function AccountPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    redirect('/login?next=/account')
  }
  const fullName =
    (data.user.user_metadata?.full_name as string | undefined)?.trim() ||
    (data.user.user_metadata?.name as string | undefined)?.trim() ||
    data.user.email ||
    'there'
  const greeting = fullName.split(/\s+/)[0] ?? fullName

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="account-main" className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            Welcome back, {greeting}.
          </h1>
          <p className="mt-3 text-base text-ink-600 sm:text-lg">
            The full account dashboard ships in the next release. For now you can jump
            straight into the surfaces below.
          </p>

          <ul role="list" className="mt-10 divide-y divide-ink-100 border-y border-ink-100">
            {[
              { label: 'For You',              href: '/feed',       hint: 'Events picked from the organisers and scenes you follow.' },
              { label: 'Browse events',        href: '/events',     hint: 'Find your next night out.' },
              { label: 'Become an organiser',  href: '/organisers?via=organiser-invite', hint: 'Run your own events on EventLinqs. Free to start.' },
              { label: 'Event alerts',         href: '/account/notifications', hint: 'Get a push when organisers you follow have something on.' },
              { label: 'Communities',          href: '/communities',   hint: 'Browse 14 communities.' },
              { label: 'Cities',               href: '/cities',     hint: '20 cities, from Sydney to Hobart.' },
              { label: 'Help and support',     href: '/help',       hint: 'Common questions and account help.' },
            ].map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-4 py-5 text-ink-900 transition-colors hover:bg-ink-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                >
                  <span className="flex flex-col">
                    <span className="font-display text-lg font-semibold">{item.label}</span>
                    <span className="text-sm text-ink-600">{item.hint}</span>
                  </span>
                  <span aria-hidden className="text-ink-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
