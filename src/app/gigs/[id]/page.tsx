import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, Clock, MapPin, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistAttribution } from '@/lib/broadcast/artists'
import {
  fetchGigById,
  PAY_TYPE_LABELS,
  PERFORMANCE_TYPE_LABELS,
} from '@/lib/marketplace/gigs'
import { fetchArtistCredits, fetchShowcaseArtistForOwner } from '@/lib/marketplace/showcase'
import { formatMoney } from '@/lib/money/format'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { GigApplyForm } from '@/components/marketplace/gig-apply-form'
import { ReportControl } from '@/components/marketplace/report-control'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!(await isFeatureEnabled('gig_board'))) return { title: 'Not found | EventLinqs' }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: 'Not found | EventLinqs' }
  const gig = await fetchGigById(createAdminClient(), id)
  if (!gig || gig.status === 'removed') return { title: 'Not found | EventLinqs' }
  return {
    title: `${gig.title} | Gigs | EventLinqs`,
    description: gig.description.slice(0, 155) || `${gig.title}: an open gig on EventLinqs.`,
    robots: { index: false, follow: true },
  }
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Gig detail + the application panel. The panel shows the performer exactly
 * what travels with their application (profile, measured draw, credits,
 * showcase links): applications carry PROOF, not promises.
 */
export default async function GigDetailPage({ params }: Props) {
  if (!(await isFeatureEnabled('gig_board'))) notFound()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const admin = createAdminClient()
  const gig = await fetchGigById(admin, id)
  if (!gig || gig.status === 'removed') notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const artist = user ? await fetchShowcaseArtistForOwner(admin, user.id) : null
  const [draw, credits, existingApplication] = artist
    ? await Promise.all([
        fetchArtistAttribution(admin, artist.id),
        fetchArtistCredits(admin, artist.id, 4),
        admin
          .from('gig_applications')
          .select('id, status')
          .eq('gig_id', gig.id)
          .eq('artist_id', artist.id)
          .maybeSingle()
          .then((r) => r.data as { id: string; status: string } | null),
      ])
    : [null, [], null]

  const { data: city } = await admin.from('cities').select('name').eq('slug', gig.city_slug).maybeSingle()
  const cityName = (city?.name as string | undefined) ?? gig.city_slug
  const deadlinePassed = new Date(gig.application_deadline) < new Date()
  const open = gig.status === 'open' && !deadlinePassed

  const payDisplay =
    gig.pay_type === 'fixed_fee' && gig.pay_amount_cents
      ? `${formatMoney(gig.pay_amount_cents, 'AUD')} fixed fee`
      : PAY_TYPE_LABELS[gig.pay_type]

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <Link href="/gigs" className="text-sm font-medium text-ink-600 hover:text-ink-900">
            ← All gigs
          </Link>

          <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
            {/* The gig */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
                {PERFORMANCE_TYPE_LABELS[gig.performance_type]} gig
              </p>
              <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                {gig.title}
              </h1>
              <p className="mt-2 text-base text-ink-600">Posted by {gig.organisation_name}</p>

              <dl className="mt-6 space-y-3 rounded-xl border border-ink-200 bg-white p-5 text-sm">
                <div className="flex items-center gap-3">
                  <dt className="sr-only">Performance date</dt>
                  <CalendarDays className="h-4 w-4 shrink-0 text-gold-800" aria-hidden />
                  <dd className="text-ink-900">{formatDateTime(gig.event_date)}</dd>
                </div>
                <div className="flex items-center gap-3">
                  <dt className="sr-only">Location</dt>
                  <MapPin className="h-4 w-4 shrink-0 text-gold-800" aria-hidden />
                  <dd className="text-ink-900">
                    {gig.venue_name ? `${gig.venue_name}, ${cityName}` : cityName}
                  </dd>
                </div>
                <div className="flex items-center gap-3">
                  <dt className="sr-only">Pay</dt>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-gold-800" aria-hidden />
                  <dd className="font-semibold text-ink-900">
                    {payDisplay}
                    {gig.pay_note ? <span className="font-normal text-ink-600"> · {gig.pay_note}</span> : null}
                  </dd>
                </div>
                <div className="flex items-center gap-3">
                  <dt className="sr-only">Application deadline</dt>
                  <Clock className="h-4 w-4 shrink-0 text-gold-800" aria-hidden />
                  <dd className={deadlinePassed ? 'text-error' : 'text-ink-900'}>
                    Applications close {formatDateTime(gig.application_deadline)}
                  </dd>
                </div>
              </dl>

              {gig.description && (
                <div className="mt-6">
                  <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                    About this gig
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-ink-700">
                    {gig.description}
                  </p>
                </div>
              )}

              <div className="mt-8">
                <ReportControl targetType="gig" targetId={gig.id} />
              </div>
            </div>

            {/* The application panel */}
            <aside className="h-fit rounded-2xl border border-ink-200 bg-white p-6">
              <h2 className="font-display text-lg font-bold text-ink-900">
                {open ? 'Apply for this gig' : 'Applications closed'}
              </h2>

              {!open ? (
                <p className="mt-3 text-sm text-ink-600">
                  This gig is no longer taking applications.
                </p>
              ) : !user ? (
                <>
                  <p className="mt-3 text-sm text-ink-600">
                    Sign in and your performer profile applies for you: your shows, your
                    following, and the tickets your sharing sold, attached automatically.
                  </p>
                  <Link
                    href={`/login?redirect=/gigs/${gig.id}`}
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                  >
                    Sign in to apply
                  </Link>
                </>
              ) : !artist ? (
                <>
                  <p className="mt-3 text-sm text-ink-600">
                    You need a performer profile to apply. It takes a minute, and it carries
                    your numbers to every gig you go for.
                  </p>
                  <Link
                    href="/artist/dashboard"
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                  >
                    Set up your profile
                  </Link>
                </>
              ) : existingApplication && existingApplication.status !== 'withdrawn' ? (
                <p role="status" className="mt-3 rounded-lg bg-success/15 px-3 py-2 text-sm text-success">
                  You applied to this gig. The organiser has your profile and numbers.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm text-ink-600">
                    This is what travels with your application, automatically:
                  </p>
                  <div className="mt-4 space-y-3 rounded-xl bg-ink-100 p-4 text-sm">
                    <p className="font-semibold text-ink-900">{artist.name}</p>
                    {draw && (
                      <p className="text-ink-700">
                        <span className="font-bold text-ink-900">{draw.totals.tickets}</span> tickets
                        sold through your links across{' '}
                        <span className="font-bold text-ink-900">{draw.shows.length}</span>{' '}
                        {draw.shows.length === 1 ? 'show' : 'shows'}, measured, never estimated.
                      </p>
                    )}
                    {credits.length > 0 && (
                      <p className="text-ink-700">
                        Recent: {credits.map((c) => c.title).slice(0, 3).join(' · ')}
                      </p>
                    )}
                    {artist.showcase_embeds.length > 0 && (
                      <p className="text-ink-700">
                        {artist.showcase_embeds.length}{' '}
                        {artist.showcase_embeds.length === 1 ? 'showcase video' : 'showcase videos'}
                      </p>
                    )}
                    <Link
                      href={`/artists/${artist.slug}`}
                      className="inline-block text-xs font-semibold text-gold-800 hover:underline"
                    >
                      View your public profile
                    </Link>
                  </div>
                  <GigApplyForm gigId={gig.id} />
                </>
              )}
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
