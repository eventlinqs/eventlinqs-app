import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCity, isCitySlug } from '@/lib/cities/data'
import { leaveCityWaitlistAction } from '../../actions'

export const metadata: Metadata = {
  title: 'Stop local alerts | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * Public, no-login unsubscribe for local event alerts (Spam Act). Withdrawal is
 * a deliberate button press, never an on-load side effect, so an email-scanner
 * prefetch can never silently remove anyone from their city's list.
 *
 * The route and its tokens are UNCHANGED by the 2026-08-23 nationwide ruling
 * on purpose: these links are already sitting in people's inboxes and every one
 * of them has to keep working.
 */
export default async function WaitlistUnsubscribePage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('city_waitlist_signups')
    .select('city_slug, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  const valid = !!data
  const left = !!data?.unsubscribed_at
  const cityName =
    data && isCitySlug(data.city_slug) ? (getCity(data.city_slug)?.name ?? data.city_slug) : 'your city'

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="text-lg font-bold text-ink-900">EVENTLINQS</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          {!valid ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">This link is not valid</h1>
              <p className="mt-3 text-sm text-ink-600">
                This unsubscribe link could not be found. It may have already been used. If you
                keep getting emails you did not ask for, contact us at hello@eventlinqs.com.
              </p>
            </>
          ) : left ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">You are unsubscribed</h1>
              <p className="mt-3 text-sm text-ink-600">
                You will receive no further {cityName} event alerts. You can sign up again any
                time.
              </p>
              <Link
                href="/waitlist"
                className="mt-6 inline-block rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                Back to local alerts
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">
                Stop {cityName} event alerts
              </h1>
              <p className="mt-3 text-sm text-ink-600">
                Stop all {cityName} event alerts, including any optional updates you ticked.
                Your EventLinqs account, if you have one, is not affected.
              </p>
              <form action={leaveCityWaitlistAction.bind(null, token)} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                >
                  Stop these emails
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
