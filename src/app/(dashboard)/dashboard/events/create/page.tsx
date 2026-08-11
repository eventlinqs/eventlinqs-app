import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import { OrgCreateForm } from '../../organisation/create/org-create-form'
import { isFlagEnabled } from '@/lib/flags'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { organisationIdFromParams, resolveOrganisationScope } from '@/lib/organisations/scope'
import type { EventCategory } from '@/types/database'

export default async function CreateEventPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHICH business this event will belong to.
  //
  // This was `.eq('owner_id', user.id).single()`, which returns PGRST116 and
  // `data: null` when the caller owns more than one. So an owner of several
  // businesses was shown the CREATE AN ORGANISATION form on the create-event page,
  // every time, and could not create an event under any of the businesses they
  // already had. The switcher below is what makes "both organisations sell
  // independently" reachable: the event is written with the active organisation's
  // id, so the money follows that business's Stripe account.
  const scope = await resolveOrganisationScope(organisationIdFromParams(await searchParams))
  const org = scope.ok ? scope.active : null

  if (!org) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
            ← My Events
          </Link>
          <h1 className="text-2xl font-bold text-ink-900">Create Event</h1>
        </div>
        <div className="mb-6 rounded-xl border border-gold-400/40 bg-gold-100/50 px-5 py-4">
          <p className="text-sm font-semibold text-ink-900">First, set up your organisation</p>
          <p className="mt-1 text-xs text-ink-600">
            Every event lives under an organisation. Fill this in once and you&rsquo;ll be straight on to creating your event.
          </p>
        </div>
        <OrgCreateForm
          userEmail={user.email ?? ''}
          returnTo="/dashboard/events/create"
          submitLabel="Continue to event details"
        />
      </div>
    )
  }

  const { data: categories } = await supabase
    .from('event_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order') as { data: EventCategory[] | null }

  const { data: venuesWithMaps } = await supabase
    .from('venues')
    .select('id, name, seat_maps(id, name, total_seats)')
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .order('name')

  const venues = (venuesWithMaps ?? []).map(v => ({
    id: v.id,
    name: v.name,
    seat_maps: (v.seat_maps ?? []).filter((m: { id: string; name: string; total_seats: number }) => m),
  }))

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
          ← My Events
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Create Event</h1>
      </div>

      {/* Which business this event will be published and paid under. An owner of
          several must be able to see and change that BEFORE filling the form in,
          not discover it afterwards on the payouts page. */}
      {scope.ok ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard/events/create"
        />
      ) : null}

      <EventForm
        userId={user.id}
        organisationId={org.id}
        categories={categories ?? []}
        venues={venues}
        launchKitEnabled={await isFlagEnabled('launch_kit')}
        lineupEnabled={await isFeatureEnabled('broadcast_artists')}
        magicStartEnabled={await isFlagEnabled('magic_start')}
      />
    </div>
  )
}
