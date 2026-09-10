import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addressForToken, suppress } from '@/lib/fillrate/read'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reminders stopped',
  robots: { index: false, follow: false },
}

/**
 * ONE CLICK, AND IT IS DONE BY THE TIME THE PAGE PAINTS. Close-out D2:
 * "Working one click unsubscribe and the same sender identity as the
 * confirmation email."
 *
 * WHY THE STOP HAPPENS ON THE GET RATHER THAN BEHIND A BUTTON. A page that says
 * "click here to confirm you want to unsubscribe" is a second click, and the
 * Spam Act 2003 (Cth) requires the unsubscribe facility to be functional and
 * low cost to use. A person who is annoyed enough to press the link has already
 * decided. Making them decide twice is how a complaint becomes a spam report,
 * and a spam report costs the sending domain that also carries every buyer's
 * ticket.
 *
 * WHY IT IS SAFE TO ACT ON A GET, which is normally the wrong shape. The action
 * is idempotent (an upsert on one address), it removes rather than creates, and
 * it is not destructive: nothing a person owns is lost and the suppression can
 * only ever reduce what we send. Link scanners in mail clients pre-fetching this
 * URL therefore produce exactly the outcome the recipient asked for, which is
 * the opposite of the usual argument against acting on a GET.
 *
 * The route is noindex, because a page keyed on somebody's private token has no
 * business in a search index.
 */
export default async function StopRemindersPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const address = await addressForToken(token)
  if (!address) {
    /*
     * A LINK THAT NAMES NOBODY IS NOT FOUND, and it says nothing else. Telling a
     * visitor whether a token exists would turn this page into a way of asking
     * whether an address is on the platform.
     */
    notFound()
  }

  await suppress(address, 'unsubscribed')

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-7xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-ink-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="type-eyebrow mb-3 text-brand-accent-strong">EventLinqs</p>
        <h1 className="type-h3 mb-4 text-ink-900">Those reminders have stopped</h1>
        <p className="type-body mb-2 text-ink-800">
          We will not send any more reminders about a booking you did not finish, to this address.
        </p>
        <p className="type-small mb-8 text-ink-600">
          This does not affect anything you have already bought. Order confirmations, tickets and
          anything an organiser sends you about an event you are going to all carry on as normal.
        </p>
        <Link
          href="/events"
          className="inline-flex min-h-[44px] items-center rounded-xl bg-ink-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          Browse what is on
        </Link>
      </div>
    </main>
  )
}
