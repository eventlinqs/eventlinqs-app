import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('organisations').select('id').eq('owner_id', user!.id).single(),
  ])

  let upcomingCount = 0
  let totalCount = 0

  if (org) {
    const now = new Date().toISOString()
    const [{ count: upcoming }, { count: total }] = await Promise.all([
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id)
        .eq('status', 'published')
        .gte('start_date', now),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id),
    ])
    upcomingCount = upcoming ?? 0
    totalCount = total ?? 0
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="mt-1 text-gray-600">
          Here&apos;s what&apos;s happening with your events.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Upcoming Events</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{upcomingCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Events</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Account Status</h3>
          <p className="mt-2 text-lg font-semibold text-green-600">Active</p>
        </div>
      </div>
    </div>
  )
}
