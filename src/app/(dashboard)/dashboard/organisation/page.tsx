import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Organisation } from '@/types/database'

export default async function OrganisationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: org } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .single() as { data: Organisation | null }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100">
          <svg className="h-8 w-8 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-ink-900">No Organisation Yet</h2>
        <p className="mt-2 max-w-sm text-ink-400">
          Create an organisation to start building and selling event tickets.
        </p>
        <Link
          href="/dashboard/organisation/create"
          className="mt-6 rounded-lg bg-gold-500 px-6 py-3 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
        >
          Create Organisation
        </Link>
      </div>
    )
  }

  const [{ count: eventCount }, { count: memberCount }] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('organisation_id', org.id),
    supabase.from('organisation_members').select('*', { count: 'exact', head: true }).eq('organisation_id', org.id),
  ])

  const statusColour: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    deactivated: 'bg-ink-100 text-ink-400',
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{org.name}</h1>
          <p className="mt-1 text-sm text-ink-400">eventlinqs.com/{org.slug}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColour[org.status] ?? 'bg-ink-100 text-ink-400'}`}>
          {org.status}
        </span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wide">Events</p>
          <p className="mt-1 text-3xl font-bold text-ink-900">{eventCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wide">Team Members</p>
          <p className="mt-1 text-3xl font-bold text-ink-900">{memberCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wide">Payouts</p>
          <p className="mt-1 text-sm font-medium text-ink-600">
            {org.stripe_onboarding_complete ? 'Enabled' : 'Setup required'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white divide-y divide-ink-100">
        {org.description && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">About</p>
            <p className="text-sm text-ink-600">{org.description}</p>
          </div>
        )}
        {org.website && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Website</p>
            <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sm text-gold-500 hover:underline">
              {org.website}
            </a>
          </div>
        )}
        {org.email && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Contact</p>
            <p className="text-sm text-ink-600">{org.email}</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-4">
        <Link
          href="/dashboard/events/create"
          className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
        >
          Create Event
        </Link>
        <Link
          href="/dashboard/events"
          className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          View Events
        </Link>
      </div>
    </div>
  )
}
