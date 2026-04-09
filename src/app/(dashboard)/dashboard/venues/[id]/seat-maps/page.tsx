import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SeatMapsClient } from './seat-maps-client'

type Props = {
  params: Promise<{ id: string }>
}

export default async function SeatMapsPage({ params }: Props) {
  const { id: venueId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .select('id, name')
    .eq('id', venueId)
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .single()

  if (venueError || !venue) notFound()

  const { data: seatMaps, error: mapsError } = await supabase
    .from('seat_maps')
    .select('id, name, total_seats, created_at')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (mapsError) {
    console.error('[seat-maps/page] failed to load seat maps:', mapsError)
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/venues" className="text-sm text-gray-500 hover:text-gray-700">
          ← Venues
        </Link>
      </div>
      <SeatMapsClient
        venueId={venueId}
        venueName={venue.name}
        seatMaps={seatMaps ?? []}
      />
    </div>
  )
}
