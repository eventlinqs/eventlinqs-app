'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import type { SeatBlock } from '@/lib/seating/generate'
import { SeatMapBuilder } from './seat-map-builder'

interface SeatMap {
  id: string
  name: string
  total_seats: number
  created_at: string
  /** GeneratedLayout JSONB; `blocks` is the editable builder source. */
  layout: { blocks?: SeatBlock[] } | null
}

interface Props {
  venueId: string
  venueName: string
  seatMaps: SeatMap[]
}

/**
 * Venue seating charts: list, create, edit. A saved chart is a reusable
 * template for every future event at this venue; attaching it to an event
 * copies the seats, so later template edits never touch a live event's
 * inventory. Charts imported by the legacy CSV path (no builder blocks)
 * remain usable on events but reopen as a fresh canvas.
 */
export function SeatMapsClient({ venueId, venueName, seatMaps }: Props) {
  const [editing, setEditing] = useState<{ id: string | null; name: string; blocks: SeatBlock[] } | null>(null)

  if (editing) {
    return (
      <div className="space-y-4">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
            {venueName}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900">
            {editing.id ? 'Edit seating chart' : 'New seating chart'}
          </h1>
        </div>
        <SeatMapBuilder
          venueId={venueId}
          seatMapId={editing.id}
          initialName={editing.name}
          initialBlocks={editing.blocks}
          onClose={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
            {venueName}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900">
            Seating charts
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-600">
            Build your room once: sections of rows, tables, and standing zones,
            with your own numbering. Saved charts are reusable on every event at
            this venue, and editing a chart never touches events already on sale.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ id: null, name: 'Seating chart', blocks: [] })}
          className="h-11 rounded-control bg-gold-500 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
        >
          New seating chart
        </button>
      </div>

      {seatMaps.length > 0 ? (
        <div className="space-y-3">
          {seatMaps.map(map => (
            <div
              key={map.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-ink-200 bg-white p-5"
            >
              <div>
                <p className="text-sm font-semibold text-ink-900">{map.name}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {map.total_seats.toLocaleString()} seats {'·'}{' '}
                  {new Date(map.created_at).toLocaleDateString('en-AU')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditing({ id: map.id, name: map.name, blocks: map.layout?.blocks ?? [] })
                }
                className="h-10 rounded-control border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 hover:border-ink-900"
              >
                Edit chart
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No seating charts yet"
          description="Draw your room once: rows, tables, standing zones, accessible seats and your own numbering. Then attach it to any event at this venue."
          primaryAction={{ label: 'Build your first chart', onClick: () => setEditing({ id: null, name: 'Seating chart', blocks: [] }) }}
        />
      )}
    </div>
  )
}
