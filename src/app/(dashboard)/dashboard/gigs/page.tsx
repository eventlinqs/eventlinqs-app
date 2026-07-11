import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchOrganisationGigs, PERFORMANCE_TYPE_LABELS } from '@/lib/marketplace/gigs'
import { PostGigForm } from '@/components/marketplace/post-gig-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your gigs | EventLinqs',
  robots: { index: false, follow: false },
}

/**
 * Organiser gig management: post a gig, see applications per gig. Posting is
 * organiser-verified accounts only (an ACTIVE organisation).
 */
export default async function OrganiserGigsPage() {
  if (!(await isFeatureEnabled('gig_board'))) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/gigs')

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organisations')
    .select('id, name, status')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!org || org.status !== 'active') {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-ink-900">Your gigs</h1>
        <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
          <p className="text-sm text-ink-600">
            Posting gigs needs an approved organiser account. Finish your organiser setup and
            this board opens up: post a slot, and performers apply with their real ticket-sales
            numbers attached.
          </p>
          <Link
            href="/organisers/signup"
            className="mt-4 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
          >
            Become an organiser
          </Link>
        </div>
      </div>
    )
  }

  const [gigs, eventsResult] = await Promise.all([
    fetchOrganisationGigs(admin, org.id as string),
    admin
      .from('events')
      .select('id, title')
      .eq('organisation_id', org.id)
      .eq('status', 'published')
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(50),
  ])
  const events = (eventsResult.data ?? []) as { id: string; title: string }[]

  const { data: citiesData } = await admin.from('cities').select('slug, name').order('tier').order('name')
  const cities = (citiesData ?? []) as { slug: string; name: string }[]

  // Application counts per gig, one query.
  const gigIds = gigs.map((g) => g.id)
  const counts = new Map<string, number>()
  if (gigIds.length > 0) {
    const { data: apps } = await admin
      .from('gig_applications')
      .select('gig_id')
      .in('gig_id', gigIds)
      .neq('status', 'withdrawn')
    for (const a of (apps ?? []) as { gig_id: string }[]) {
      counts.set(a.gig_id, (counts.get(a.gig_id) ?? 0) + 1)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Your gigs</h1>
        <span className="text-sm text-ink-400">·</span>
        <span className="text-sm text-ink-600">{org.name as string}</span>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_460px]">
        <div className="order-2 xl:order-1">
          <div className="rounded-xl border border-ink-200 bg-white">
            <div className="border-b border-ink-200 px-5 py-4">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                Posted gigs
              </h2>
            </div>
            {gigs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-600">
                No gigs posted yet. Post one on the right; performers in that city and type are
                told the moment it lands.
              </p>
            ) : (
              <ul className="divide-y divide-ink-200/60">
                {gigs.map((gig) => (
                  <li key={gig.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/gigs/${gig.id}`}
                          className="text-sm font-semibold text-ink-900 hover:underline"
                        >
                          {gig.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-600">
                          {PERFORMANCE_TYPE_LABELS[gig.performance_type]} ·{' '}
                          {new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(
                            new Date(gig.event_date),
                          )}{' '}
                          · {gig.status}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/gigs/${gig.id}`}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100"
                      >
                        {counts.get(gig.id) ?? 0}{' '}
                        {(counts.get(gig.id) ?? 0) === 1 ? 'applicant' : 'applicants'}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="order-1 xl:order-2">
          <PostGigForm cities={cities} events={events} />
        </div>
      </div>
    </div>
  )
}
