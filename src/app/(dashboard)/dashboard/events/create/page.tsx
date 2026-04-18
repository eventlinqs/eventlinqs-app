import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import { OrgCreateForm } from '../../organisation/create/org-create-form'
import type { EventCategory } from '@/types/database'

export default async function CreateEventPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Must have an organisation to create events
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .single()

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
      <EventForm
        userId={user.id}
        organisationId={org.id}
        categories={categories ?? []}
        venues={venues}
      />
    </div>
  )
}
