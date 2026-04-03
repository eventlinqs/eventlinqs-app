import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
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
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Organisation Required</h2>
        <p className="mt-2 max-w-sm text-gray-500">
          You need to create an organisation before you can create events.
        </p>
        <Link
          href="/dashboard/organisation/create"
          className="mt-6 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Create Organisation
        </Link>
      </div>
    )
  }

  const { data: categories } = await supabase
    .from('event_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order') as { data: EventCategory[] | null }

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/events" className="text-sm text-gray-500 hover:text-gray-700">
          ← My Events
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create Event</h1>
      </div>
      <EventForm
        userId={user.id}
        organisationId={org.id}
        categories={categories ?? []}
      />
    </div>
  )
}
