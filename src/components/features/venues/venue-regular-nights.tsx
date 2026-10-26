import Link from 'next/link'
import type { VenueSeries } from '@/lib/listings/venue-series'
import { lastCheckedInWords, seriesRuleInWords } from '@/lib/listings/series-words'

/**
 * A VENUE'S REGULAR NIGHTS (WI2 Part 3a, docs/walk-in/WI2-PLAN.md section 9):
 * each night with its rule in words, its next dates as links to their own
 * pages, and, for a night EventLinqs listed from public information, that fact
 * and when it was last checked. Built from the page's own section pattern
 * (eyebrow, heading) and the "Open in Maps" control's look, nothing new. The
 * claim and removal links arrive with Part 3b, when their routes exist (Law 5).
 */

/** "Sat 31 Oct" in the night's own zone (Intl's en-AU puts a comma after the weekday; the page's chips do not). */
function dateLabel(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
}

export function VenueRegularNights({ venueName, series }: { venueName: string; series: VenueSeries[] }) {
  if (series.length === 0) return null
  return (
    <div>
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">Regular nights</p>
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Every week at {venueName}</h2>
      </div>
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {series.map((s) => {
          const checked = s.listing_source === 'eventlinqs' ? lastCheckedInWords(s.last_checked_on) : null
          return (
            <li key={s.id} className="rounded-2xl border border-ink-200 bg-white p-5">
              <h3 className="font-display text-lg font-bold text-ink-900">{s.name}</h3>
              <p className="mt-1 text-sm text-ink-700">{seriesRuleInWords(s)}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">Next dates</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {s.next.map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={`/events/${d.slug}`}
                      className="inline-flex min-h-11 items-center rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition-colors hover:border-gold-400 hover:text-[var(--brand-accent-strong)]"
                    >
                      {dateLabel(d.start_date, s.timezone)}
                    </Link>
                  </li>
                ))}
              </ul>
              {s.listing_source === 'eventlinqs' && (
                <p className="mt-4 text-xs text-ink-600">
                  Hosted by {venueName}. Listed by EventLinqs from public information.{checked ? ` ${checked}.` : ''}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
