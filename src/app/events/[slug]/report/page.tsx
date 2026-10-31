import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { createAdminClient } from '@/lib/supabase/admin'
import { reportWords } from '@/lib/listings/report-words'
import { reportListing } from './actions'
import { reportableEvent } from './reportable'

/**
 * REPORT OR REMOVE THIS LISTING (the release checklist's I5; the project manager's ruling of 29 October 2026, 14:20).
 * One reason and, if they like, an email; no account. A person reads every report the same day in /admin/today, and a
 * listing comes down only through the event lifecycle that already exists. A plain form post; it works with no
 * script. Never indexed.
 */

export const metadata: Metadata = {
  title: 'Report or remove this listing | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const LABEL = 'block text-sm font-medium text-[var(--text-primary)]'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sent?: string; problem?: string }>
}

export default async function ReportListingPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { sent, problem } = await searchParams
  const event = await reportableEvent(createAdminClient(), slug)
  if (!event) notFound()
  const words = reportWords(event.listing_source)

  return (
    <PageShell>
      <PageHero
        eyebrow={words.eyebrow}
        title={event.title}
        subtitle={words.subtitle}
      />

      <ContentSection surface="base" width="wide" id="report">
        <div className="max-w-xl">
          {sent === '1' ? (
            <div role="status" data-said="sent" className="rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-5 text-[var(--text-primary)]">
              <p>Thank you. Your report has reached us. A person will look at this listing today.</p>
              <p className="mt-3">
                <Link href={`/events/${event.slug}`} className="font-semibold underline">
                  {words.back}
                </Link>
              </p>
            </div>
          ) : (
            <form action={reportListing} className="space-y-5" data-report-listing>
              {problem === undefined ? null : (
                <p role="alert" data-said="problem" className="text-sm text-[var(--color-error,#b91c1c)]">
                  {problem}
                </p>
              )}
              <input type="hidden" name="slug" value={event.slug} />
              {words.organiserLine && (
                <p data-organiser-line className="text-sm text-[var(--text-primary)]">
                  <Link href={words.organiserLine.href} className="font-semibold underline">
                    {words.organiserLine.words}
                  </Link>
                </p>
              )}
              <fieldset>
                <legend className={LABEL}>What is wrong?</legend>
                <div className="mt-2 space-y-1">
                  {words.reasons.map((r) => (
                    <label key={r.key} className="flex min-h-[44px] items-center gap-3 text-sm text-[var(--text-primary)]">
                      <input type="radio" name="reason" value={r.key} required className="h-5 w-5 shrink-0" />
                      {r.words}
                    </label>
                  ))}
                </div>
              </fieldset>
              <FormField
                id="rl-email"
                name="email"
                label="Your email (optional, if you would like a reply)"
                type="email"
                maxLength={254}
                autoComplete="email"
              />

              {/* Left empty by people; a form robot fills it. */}
              <div aria-hidden="true" className="hidden">
                <label htmlFor="rl-website">Leave this empty</label>
                <input id="rl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
                Send the report
              </Button>
              <p className="text-sm text-[var(--text-secondary)]">
                <Link href={`/events/${event.slug}`} className="underline">
                  {words.back}
                </Link>
              </p>
            </form>
          )}
        </div>
      </ContentSection>
    </PageShell>
  )
}
