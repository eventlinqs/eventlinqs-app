'use client'

import { EmptyState } from '@/components/ui/EmptyState'

interface SeatMap {
  id: string
  name: string
  total_seats: number
  created_at: string
}

interface Props {
  venueId: string
  venueName: string
  seatMaps: SeatMap[]
}

// M4 Phase 2: visual seat builder goes here.
// The CSV-import surface was removed for the M4.5 close-out.
// Backend actions (importSeatMapCsv, deleteSeatMap) and DB tables
// remain in place; the user-facing builder will be reintroduced in M4 Phase 2.

export function SeatMapsClient({ venueName, seatMaps }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
          {venueName}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink-900">
          Seat maps
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Reserved seating uses a visual seat-map builder. This builder is part of a later release.
          For now, launch events with general-admission ticket tiers and upgrade when the builder ships.
        </p>
      </div>

      {seatMaps.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">
            Existing seat maps for this venue
          </p>
          {seatMaps.map(map => (
            <div
              key={map.id}
              className="rounded-xl border border-ink-200 bg-white p-5"
            >
              <p className="text-sm font-semibold text-ink-900">{map.name}</p>
              <p className="mt-0.5 text-xs text-ink-400">
                {map.total_seats.toLocaleString()} seats {'\u00B7'}{' '}
                {new Date(map.created_at).toLocaleDateString('en-AU')}
              </p>
            </div>
          ))}
        </div>
      )}

      {seatMaps.length === 0 && (
        <EmptyState
          title="Visual seat builder on the way"
          description="Create reserved-seating sections, rows, and seats with a drag-and-drop canvas. Shipping with the next ticketing release."
          primaryAction={{ label: 'Create a general-admission event', href: '/dashboard/events/create' }}
        />
      )}
    </div>
  )
}
