import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { unsubscribeFromDigestAction } from '@/app/actions/consent'

export const metadata: Metadata = {
  title: 'Unsubscribe | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * Public, no-login unsubscribe for the weekly local digest (Spam Act,
 * Broadcast Layer SPEC 3.2). Withdrawal is a deliberate button press (a
 * server action), never an on-load side effect, so an email scanner
 * prefetch cannot silently unsubscribe anyone. Scoped to the digest only:
 * organiser marketing consents are separate and untouched.
 */
export default async function DigestUnsubscribePage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('marketing_consents')
    .select('status')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  const valid = !!data
  const withdrawn = data?.status === 'withdrawn'

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
                This unsubscribe link could not be found. It may have already been used. If you keep
                getting emails you did not ask for, contact us at hello@eventlinqs.com.
              </p>
            </>
          ) : withdrawn ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">You are unsubscribed</h1>
              <p className="mt-3 text-sm text-ink-600">
                You will no longer receive the weekly local events digest. This does not affect
                your tickets, receipts, or your EventLinqs account.
              </p>
              <Link
                href="/events"
                className="mt-6 inline-block rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                Browse events
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">Unsubscribe from the weekly digest</h1>
              <p className="mt-3 text-sm text-ink-600">
                Stop receiving the weekly local events digest. Your tickets, receipts, and
                EventLinqs account are not affected, and any organiser emails you asked for
                continue separately.
              </p>
              <form action={unsubscribeFromDigestAction.bind(null, token)} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                >
                  Unsubscribe
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
