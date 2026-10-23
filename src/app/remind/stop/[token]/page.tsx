import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { reminderEventTitle, stopReminderByToken } from '@/lib/walk-in/reminder-store'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reminders stopped | EventLinqs',
  robots: { index: false, follow: false },
}

/**
 * STOP REMIND ME FOR ONE EVENT (WI1). The link at the foot of each Remind me
 * email.
 *
 * It stops on opening, with no login and no question, as the recovery stop page
 * does: the person asked for two messages about one event and is saying no
 * more. ACMA: an unsubscribe "cannot require extra personal information"
 * (https://www.acma.gov.au/avoid-sending-spam, as recorded in migration
 * 20261003000010). It takes effect at once rather than within five working days.
 * A mangled or unknown link answers with a page, never a server error.
 */
export default async function StopRemindersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [outcome, title] = await Promise.all([stopReminderByToken(token), reminderEventTitle(token)])

  const heading =
    outcome === 'unknown' ? 'This link is not one we recognise' : 'Reminders stopped'
  const body =
    outcome === 'unknown'
      ? 'Nothing was changed. Check that the whole link from your email was opened, and try it again.'
      : `You will get no more reminders${title ? ` for ${title}` : ''}. Nothing else was ever coming.`

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader staticSafe />
      <main id="main-content" className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <h1 className="font-headline text-2xl font-bold text-ink-900">{heading}</h1>
        <p className="mt-3 text-ink-600">{body}</p>
        <Link
          href="/events"
          className="mt-8 inline-flex min-h-11 items-center rounded-full border-[1.5px] border-ink-900 px-6 text-sm font-bold text-ink-900 hover:bg-[var(--color-ink-100)]"
        >
          Browse events
        </Link>
      </main>
      <SiteFooter />
    </div>
  )
}
