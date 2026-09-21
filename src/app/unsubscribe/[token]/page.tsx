import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { unsubscribeFromOrganiserAction } from '@/app/actions/consent'
import { contactAddress } from '@/lib/email/sender'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

export const metadata: Metadata = {
  title: 'Unsubscribe | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * Public, no-login unsubscribe for organiser marketing (Spam Act). Withdrawal is
 * a deliberate button press (a server action), never an on-load side effect, so
 * an email scanner prefetch cannot silently unsubscribe anyone. Scoped to the
 * one organiser; EventLinqs platform updates are not affected.
 */
export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()
  /*
   * THROUGH THE DOOR, because the only thing this page can say about a token it
   * could not look up is FALSE. This read discarded its error until 21 September
   * 2026, so a dropped socket left `data` null, `valid` false, and the page told
   * somebody exercising a statutory right: "This link is not valid ... It may
   * have already been used." They stop, they keep receiving the mail, and they
   * have been told their remedy is spent. A throw reaches the error boundary and
   * says try again, which is true, and the link in their inbox still works.
   *
   * A token that genuinely matches no row still resolves to null and still gets
   * the sentence above, which is the case that sentence was written for.
   */
  const data = await readOrThrow('the organiser unsubscribe token', () =>
    admin
      .from('organiser_marketing_consents')
      .select('status, organisation:organisations(name)')
      .eq('unsubscribe_token', token)
      .maybeSingle(),
  )

  const organisationName =
    (data as { organisation?: { name?: string } | null } | null)?.organisation?.name ?? 'this organiser'
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
                getting emails you did not ask for, contact us at {contactAddress('hello')}.
              </p>
            </>
          ) : withdrawn ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">You are unsubscribed</h1>
              <p className="mt-3 text-sm text-ink-600">
                You will no longer receive marketing emails from {organisationName}. This does not
                affect your tickets, receipts, or your EventLinqs account.
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
              <h1 className="font-display text-2xl font-bold text-ink-900">Unsubscribe from {organisationName}</h1>
              <p className="mt-3 text-sm text-ink-600">
                Stop receiving marketing emails from {organisationName}. Your tickets, receipts, and
                EventLinqs account are not affected, and this does not change any other organiser.
              </p>
              <form action={unsubscribeFromOrganiserAction.bind(null, token)} className="mt-6">
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
