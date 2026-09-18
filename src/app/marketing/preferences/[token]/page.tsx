import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { findSubjectByToken, readSubjectHistory } from '@/lib/consent/ledger'
import {
  consentEventSentence,
  sourceDisclosureSentences,
  suppressionSentence,
} from '@/lib/consent/sentences'
import {
  stopFacilitationByTokenAction,
  unsubscribeEverythingByTokenAction,
} from '@/app/actions/marketing-rights'
import { contactAddress } from '@/lib/email/sender'
import { resolveSend } from '@/lib/consent/resolver'
import { FACILITATED_MARKETING_PURPOSE } from '@/lib/consent/purposes'

export const metadata: Metadata = {
  title: 'Your marketing preferences | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * ONE PAGE THAT ANSWERS BOTH RIGHTS, WITH NO LOGIN.
 *
 * Australian Privacy Principle 7.7 is the right to be told where the details
 * came from, and it is answered above the fold, in sentences, before anything
 * is asked of the person. APP 7.6 is the right to ask that the details are not
 * used to help other organisations market to them, and it is a button, applied
 * at once and free.
 *
 * NOTHING HAPPENS ON LOAD. Every change is a deliberate press, because an email
 * scanner that prefetches a link must not be able to change anybody's
 * preferences, in either direction.
 *
 * The token identifies the address, so nobody has to create an account to
 * exercise a right. An unmatched token says so plainly and gives the address to
 * write to rather than pretending to have worked.
 */
export default async function MarketingPreferencesPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()
  const email = await findSubjectByToken(admin, token)
  const history = email ? await readSubjectHistory(admin, email) : null

  /*
   * WHAT THE RESOLVER SAYS RIGHT NOW, printed on the page.
   *
   * Every press on this page re-renders it, so the person sees the answer
   * change rather than a message claiming it did. The line comes from the same
   * resolver every send path asks, so what it says here and what happens to the
   * next message are the same decision, not two descriptions of one.
   */
  const verdict = email
    ? await resolveSend(admin, {
        email,
        purpose: FACILITATED_MARKETING_PURPOSE,
        channel: 'email',
      })
    : null

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
        {!email || !history ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink-900">
              This link is not valid
            </h1>
            <p className="mt-3 text-sm text-ink-600">
              This preferences link could not be matched to an address. Open the link from any
              EventLinqs message, or write to {contactAddress('privacy')} and we will answer within
              a reasonable period, free.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold text-ink-900">
              Your marketing preferences
            </h1>
            <p className="mt-2 text-sm text-ink-600">
              For {email}. Nothing on this page changes until you press something.
            </p>
            <p
              data-testid="marketing-state"
              className="mt-4 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700"
            >
              {verdict?.permitted
                ? 'Right now, EventLinqs can send you marketing about events near you.'
                : `Right now, EventLinqs sends you no marketing: ${verdict?.reason ?? 'no consent is recorded for this address'}.`}
            </p>

            <section className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Where we got your details</h2>
              <div className="mt-3 space-y-2 text-sm text-ink-600">
                {sourceDisclosureSentences(history.consents).map((sentence) => (
                  <p key={sentence}>{sentence}</p>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">
                Stop us promoting other organisers to you
              </h2>
              <p className="mt-2 text-sm text-ink-600">
                EventLinqs sends marketing about events run by other organisers who sell tickets
                here. You can ask us to stop using your details for that, and keep everything else
                as it is. It takes effect at once and it is free.
              </p>
              <form action={stopFacilitationByTokenAction.bind(null, token)} className="mt-4">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-lg border border-ink-300 bg-white px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-50"
                >
                  Stop using my details for other organisers
                </button>
              </form>
            </section>

            <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Stop everything</h2>
              <p className="mt-2 text-sm text-ink-600">
                One press stops every EventLinqs marketing message, on email and SMS together.
                Your tickets, receipts and account are not affected.
              </p>
              <form action={unsubscribeEverythingByTokenAction.bind(null, token)} className="mt-4">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                >
                  Unsubscribe from everything
                </button>
              </form>
            </section>

            <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Everything we have recorded</h2>
              {history.consents.length === 0 && history.suppressions.length === 0 ? (
                <p className="mt-3 text-sm text-ink-600">
                  There is no marketing record for this address.
                </p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm text-ink-600">
                  {history.consents.map((row) => (
                    <li key={row.id} className="border-l-2 border-gold-400 pl-3">
                      {consentEventSentence(row)}
                    </li>
                  ))}
                  {history.suppressions.map((row) => (
                    <li key={row.id} className="border-l-2 border-ink-300 pl-3">
                      {suppressionSentence(row)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-ink-400">
                Records are kept as evidence of what you were shown and when. They are never
                edited or deleted, which is why a change of mind appears here as a new line.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
