import type { Metadata } from 'next'
import Link from 'next/link'
import { contactAddress } from '@/lib/email/sender'
import { MarketingRightsForm } from './rights-form'

export const metadata: Metadata = {
  title: 'Marketing preferences | EventLinqs',
  description:
    'Ask EventLinqs to stop using your details to promote other organisers, and find out where we got them.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * THE RIGHTS PAGE WITH NO TOKEN, LINKED FROM THE PRIVACY POLICY.
 *
 * The token version of this page (opened from any message) answers both rights
 * outright. This one is for somebody who arrives from the privacy policy with
 * no message in front of them, and it is deliberately asymmetric:
 *
 *   STOPPING is offered here and applied at once, because a stop request can
 *   only ever reduce what we send. Asking a person to prove who they are before
 *   we will stop marketing to them would be an obstacle in front of a right.
 *
 *   TELLING YOU WHAT WE HOLD is not offered to an unverified visitor, because
 *   answering it would confirm to a stranger that an address is on our list,
 *   which is a disclosure in itself. The two ways to get that answer are named
 *   plainly instead, and both are free.
 */
export default function MarketingPreferencesEntryPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="text-lg font-bold text-ink-900">
            EVENTLINQS
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-ink-900">Marketing preferences</h1>
        <p className="mt-2 text-sm text-ink-600">
          Two things you can ask us for at any time, free, with no account and no explanation.
        </p>

        <section className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">
            Stop us promoting other organisers to you
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            EventLinqs sends marketing about events run by other organisers who sell tickets here.
            Tell us the address and we stop using it for that from the moment you press the button.
          </p>
          <MarketingRightsForm />
        </section>

        <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">Ask where we got your details</h2>
          <p className="mt-2 text-sm text-ink-600">
            Open the preferences link at the bottom of any EventLinqs message and the answer is on
            the page straight away, with every record we hold for that address.
          </p>
          <p className="mt-2 text-sm text-ink-600">
            If you have no message to hand, write to {contactAddress('privacy')} and we will answer
            within a reasonable period, free. We ask you to do it that way for one reason: telling
            anybody who types an address what we hold about it would itself be handing out somebody
            else&apos;s information.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">Stop everything</h2>
          <p className="mt-2 text-sm text-ink-600">
            Every EventLinqs marketing message carries a one click unsubscribe that stops all of
            them, on email and SMS together. Use the link in any message, or ask us at{' '}
            {contactAddress('privacy')}.
          </p>
        </section>
      </div>
    </div>
  )
}
