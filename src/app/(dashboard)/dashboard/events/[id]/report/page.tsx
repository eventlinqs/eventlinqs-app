import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchReachSummary } from '@/lib/broadcast/reach'
import { readWalkInNumbers } from '@/lib/walk-in/organiser-numbers'
import { afterEventReport } from '@/lib/walk-in/after-event-report'
import { formatEventDate, formatPlatformDate, formatPlatformDateTime } from '@/lib/dates/event-time'
import { readNightReport, readNightRows } from '@/lib/growth/organiser-report'
import { addedLines, nightFigures, type NightFigures } from '@/lib/growth/organiser-report-math'
import { PROVIDER_NAMES, type BookingProvider } from '@/lib/events/booking-links'

export const metadata: Metadata = {
  title: 'After the event | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/**
 * THE AFTER-EVENT REPORT, ONE PAGE (the locked plan of 27 October 2026, item 20:
 * "Aggregate visitor and referral report to Fred ... A one-page report after the
 * festival"). What people did on the event's page and the channels they arrived
 * by, every figure counted (src/lib/walk-in/after-event-report.ts), on one page
 * an organiser prints or saves as a PDF from the browser and sends on.
 *
 * Behind the same ownership gate as Reach: getOrganiserEvent answers null for
 * anybody who may not act for the event, and the page is then not found.
 *
 * KEPT AFTER THE NIGHT (the engine plan of 28 October 2026, part H): once the
 * night has ended, the hourly sweep keeps one copy of these figures as read
 * (organiser_night_reports, src/lib/growth/organiser-report.ts), and this page
 * shows that copy, dated, so the organiser and Lawal read the same numbers.
 * Before then it reads live, as it always did. Either way it adds the people
 * sent on to the organiser's booking page per site (never called a sale), our
 * own orders where EventLinqs sells the night, and the posts that named it.
 */
export default async function AfterEventReportPage({ params }: Props) {
  const { id } = await params
  const event = await getOrganiserEvent(id)
  if (!event) notFound()

  const shareOn = await isFeatureEnabled('broadcast_share')
  const kept = await readNightReport(id).catch(() => null)
  let figures: NightFigures
  if (kept) {
    figures = kept.figures
  } else {
    const [numbers, reach, rows] = await Promise.all([
      readWalkInNumbers(id),
      shareOn ? fetchReachSummary(id) : Promise.resolve({ totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 }, byChannel: [], linkCount: 0 }),
      event.endDate ? readNightRows({ id, endDate: event.endDate }) : null,
    ])
    figures = nightFigures({
      numbers,
      reach,
      viewers: rows?.viewers ?? 0,
      ownLinkArrivals: rows?.ownLinkArrivals ?? null,
      instagramReach: rows?.instagramReach ?? null,
      presses: rows?.presses ?? [],
      orders: rows?.orders ?? null,
      posts: rows?.posts ?? [],
    })
  }
  const report = afterEventReport(figures.numbers, figures.reach)
  const added = addedLines(figures, {
    siteName: (p) => PROVIDER_NAMES[p as BookingProvider] ?? 'your own booking page',
    dateOf: (iso) => formatPlatformDate(iso),
  })
  const dates = [formatEventDate(event.startDate, event.timezone), event.endDate ? formatEventDate(event.endDate, event.timezone) : null]
    .filter((d, i, all): d is string => d !== null && all.indexOf(d) === i)
    .join(' to ')

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/dashboard/events/${id}`} className="text-sm text-ink-600 hover:text-ink-900">
          ← Back to event
        </Link>
      </div>

      <article data-report className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">After the event</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">{event.title}</h1>
        <p className="mt-1 text-sm text-ink-600">
          {event.organisationName}
          {dates ? ` · ${dates}` : ''}
        </p>

        {report.nothingCounted ? (
          <p className="mt-6 text-sm text-ink-700">Nothing has been counted on this event&apos;s page yet.</p>
        ) : (
          <>
            <dl className="mt-6 divide-y divide-ink-100 border-y border-ink-100">
              {report.headline.map((line) => (
                <div key={line.label} data-line={line.label} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-sm text-ink-700">{line.label}</dt>
                  <dd className="text-lg font-bold tabular-nums text-ink-900">{line.value}</dd>
                </div>
              ))}
            </dl>
            {report.rate && <p className="mt-3 text-sm text-ink-600">{report.rate}.</p>}

            {report.channels.length > 0 && (
              <section aria-label="Where people came from" className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Where people came from</h2>
                <dl className="mt-3 divide-y divide-ink-100 border-y border-ink-100">
                  {report.channels.map((line) => (
                    <div key={line.label} data-channel={line.label} className="flex items-baseline justify-between gap-4 py-2.5">
                      <dt className="text-sm text-ink-700">{line.label}</dt>
                      <dd className="text-base font-semibold tabular-nums text-ink-900">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </>
        )}

        <section aria-label="What happened next" className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">What happened next</h2>
          <ul className="mt-3 space-y-2">
            {added.map((line) => (
              <li key={line} className="text-sm leading-relaxed text-ink-800">
                {line}
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-ink-500">
          {kept ? `As counted on ${formatPlatformDateTime(kept.readAt)}, after the night. ` : ''}Counted by EventLinqs. Each visit is one visitor on one day; each other figure is a press or a sign-up
          recorded on the event&apos;s page. Nothing here is estimated.
        </p>
      </article>

      <p className="mt-4 text-sm text-ink-600 print:hidden">Print this page or save it as a PDF from your browser to send it on.</p>
    </div>
  )
}
