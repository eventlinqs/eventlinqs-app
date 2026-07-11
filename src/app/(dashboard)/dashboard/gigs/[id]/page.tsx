import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistAttribution } from '@/lib/broadcast/artists'
import {
  fetchGigApplications,
  fetchGigById,
  PERFORMANCE_TYPE_LABELS,
} from '@/lib/marketplace/gigs'
import { fetchShowcaseArtistBySlug } from '@/lib/marketplace/showcase'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { ApplicantActions } from '@/components/marketplace/applicant-actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gig applicants | EventLinqs',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ id: string }> }

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-ink-100 text-ink-700',
  shortlisted: 'bg-gold-100 text-gold-800',
  declined: 'bg-error/10 text-error',
  withdrawn: 'bg-ink-100 text-ink-500',
  booked: 'bg-success/15 text-success',
}

/**
 * The organiser's applicant review: every applicant side by side with the
 * PROOF attached: live draw numbers, credits, and showcase, resolved from
 * the artist layer at render time so they can never be stale or inflated.
 */
export default async function GigApplicantsPage({ params }: Props) {
  if (!(await isFeatureEnabled('gig_board'))) notFound()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/gigs')

  const admin = createAdminClient()
  const gig = await fetchGigById(admin, id)
  if (!gig) notFound()

  const { data: org } = await admin
    .from('organisations')
    .select('id')
    .eq('id', gig.organisation_id)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!org) notFound()

  const applications = await fetchGigApplications(admin, gig.id)
  const visible = applications.filter((a) => a.status !== 'withdrawn')

  // Live proof per applicant: draw totals and showcase, resolved now.
  const enriched = await Promise.all(
    visible.map(async (app) => {
      const [draw, showcase] = await Promise.all([
        fetchArtistAttribution(admin, app.artist_id),
        fetchShowcaseArtistBySlug(admin, app.artist.slug),
      ])
      return { app, draw, showcase }
    }),
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/dashboard/gigs" className="text-sm text-ink-600 hover:text-ink-900">
          ← Your gigs
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Applicants</h1>
        <span className="text-sm text-ink-400">·</span>
        <span className="text-sm text-ink-600">
          {gig.title} ({PERFORMANCE_TYPE_LABELS[gig.performance_type]})
        </span>
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white px-5 py-8">
          <p className="text-sm text-ink-600">
            No applications yet. Performers in {gig.city_slug} doing this type were alerted when
            you posted; applications land here with their numbers attached.
          </p>
        </div>
      ) : (
        <ul role="list" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {enriched.map(({ app, draw, showcase }) => (
            <li key={app.id} className="rounded-xl border border-ink-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <OrganiserAvatar src={app.artist.image_url} name={app.artist.name} size="md" />
                  <div>
                    <Link
                      href={`/artists/${app.artist.slug}`}
                      className="font-display text-base font-bold text-ink-900 hover:underline"
                    >
                      {app.artist.name}
                    </Link>
                    <p className="text-xs text-ink-600">
                      Applied{' '}
                      {new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(
                        new Date(app.created_at),
                      )}
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[app.status] ?? STATUS_TONE.submitted}`}
                >
                  {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                </span>
              </div>

              {/* The proof block: measured draw, never estimated. */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-ink-100 p-3 text-center">
                <div>
                  <p className="text-lg font-bold text-ink-900">{draw.totals.tickets}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                    Tickets driven
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold text-ink-900">{draw.totals.clicks}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                    Link clicks
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold text-ink-900">{draw.shows.length}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                    Shows tracked
                  </p>
                </div>
              </div>

              {app.note && (
                <p className="mt-3 whitespace-pre-line rounded-lg border border-ink-200/70 bg-white px-3 py-2 text-sm text-ink-700">
                  {app.note}
                </p>
              )}

              {showcase && showcase.showcase_embeds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {showcase.showcase_embeds.map((embed) => (
                    <a
                      key={embed.embedUrl}
                      href={embed.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-full border border-ink-200 bg-white px-3 text-xs font-semibold capitalize text-ink-900 hover:border-gold-800"
                    >
                      Watch on {embed.provider}
                    </a>
                  ))}
                </div>
              )}

              <ApplicantActions
                applicationId={app.id}
                gigId={gig.id}
                artistId={app.artist_id}
                artistName={app.artist.name}
                status={app.status}
                gigTitle={gig.title}
                eventId={gig.event_id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
