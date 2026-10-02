import type { Metadata } from 'next'
import Link from 'next/link'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'
import { isHubspotContactId } from '@/lib/outreach/unsubscribe'
import { OutreachUnsubscribeForm } from './outreach-unsubscribe-form'

export const metadata: Metadata = {
  title: 'Unsubscribe | EventLinqs',
  ...noIndexMetadata(),
}

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }

/**
 * THE UNSUBSCRIBE PAGE FOR THE FOUNDER'S ONE TO ONE OUTREACH EMAILS.
 *
 * Linked from the footer of every outreach message as
 * https://www.eventlinqs.com.au/unsubscribe/outreach?id=<HubSpot contact id>.
 * A static segment, so it wins over the sibling /unsubscribe/[token] for this
 * one path and leaves every token in that family untouched.
 *
 * LOADING THIS PAGE DOES NOTHING. It reads no database and writes no row, so a
 * mail security scanner that fetches every link in a message cannot unsubscribe
 * anybody, and no value of `id` can make it answer 500: a malformed or missing
 * id is not an error, it simply means the person is asked for their address.
 * The unsubscribe is recorded only by the deliberate press
 * (src/app/actions/outreach-unsubscribe.ts).
 *
 * The rules this page follows and their sources (ACMA, Yahoo, HubSpot, Klaviyo,
 * all fetched 2026-10-03) are in src/lib/outreach/unsubscribe.ts.
 */
export default async function OutreachUnsubscribePage({ searchParams }: Props) {
  const { id } = await searchParams
  // An id repeated in the URL arrives as an array; it is not one usable id.
  const contactId = isHubspotContactId(id) ? id : null

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="text-lg font-bold text-ink-900">EVENTLINQS</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-sm">
          <OutreachUnsubscribeForm contactId={contactId} />
        </div>
      </main>
    </div>
  )
}
