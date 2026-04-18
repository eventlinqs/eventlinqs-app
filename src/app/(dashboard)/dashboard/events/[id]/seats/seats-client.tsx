'use client'

import { useState, useTransition } from 'react'
import { holdSeat, releaseSeat } from './actions'

interface Seat {
  id: string
  row_label: string
  seat_number: string
  seat_type: string
  status: string
  held_reason: string | null
  seat_map_section_id: string | null
}

interface Section {
  id: string
  name: string
  color: string
}

interface Props {
  eventId: string
  seats: Seat[]
  sections: Section[]
}

const STATUS_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  available: { label: 'Available', bg: 'bg-green-100', text: 'text-green-700' },
  held: { label: 'Held', bg: 'bg-amber-100', text: 'text-amber-700' },
  reserved: { label: 'Reserved', bg: 'bg-gold-100', text: 'text-gold-600' },
  sold: { label: 'Sold', bg: 'bg-ink-100', text: 'text-ink-600' },
  blocked: { label: 'Blocked', bg: 'bg-red-100', text: 'text-red-700' },
  accessible: { label: 'Accessible', bg: 'bg-teal-100', text: 'text-teal-700' },
}

const HOLD_REASONS = ['comp', 'vip', 'accessibility', 'sponsor', 'media', 'artist', 'staff']

export function SeatsManagementClient({ eventId, seats, sections }: Props) {
  const [seatList, setSeatList] = useState<Seat[]>(seats)
  const [holdingId, setHoldingId] = useState<string | null>(null)
  const [holdReason, setHoldReason] = useState('comp')
  const [holdNotes, setHoldNotes] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const sectionColorMap = new Map(sections.map(s => [s.id, s.color]))

  const displayed = seatList.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false
    if (sectionFilter !== 'all' && s.seat_map_section_id !== sectionFilter) return false
    return true
  })

  // Group by row
  const rows = Array.from(
    displayed.reduce((map, s) => {
      const key = `${s.seat_map_section_id ?? 'none'}::${s.row_label}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
      return map
    }, new Map<string, Seat[]>())
  )

  function doHold(seatId: string) {
    setError(null)
    startTransition(async () => {
      const result = await holdSeat(eventId, seatId, holdReason, holdNotes)
      if (result.error) {
        setError(result.error)
      } else {
        setSeatList(prev =>
          prev.map(s => s.id === seatId ? { ...s, status: 'held', held_reason: holdReason } : s)
        )
        setHoldingId(null)
        setHoldNotes('')
      }
    })
  }

  function doRelease(seatId: string) {
    setError(null)
    startTransition(async () => {
      const result = await releaseSeat(eventId, seatId)
      if (result.error) {
        setError(result.error)
      } else {
        setSeatList(prev =>
          prev.map(s => s.id === seatId ? { ...s, status: 'available', held_reason: null } : s)
        )
      }
    })
  }

  const stats = {
    total: seatList.length,
    available: seatList.filter(s => s.status === 'available').length,
    held: seatList.filter(s => s.status === 'held').length,
    reserved: seatList.filter(s => s.status === 'reserved').length,
    sold: seatList.filter(s => s.status === 'sold').length,
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total', value: stats.total, color: 'text-ink-900' },
          { label: 'Available', value: stats.available, color: 'text-green-700' },
          { label: 'Held', value: stats.held, color: 'text-amber-700' },
          { label: 'Reserved', value: stats.reserved, color: 'text-gold-600' },
          { label: 'Sold', value: stats.sold, color: 'text-ink-600' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-ink-200 bg-white p-4 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-ink-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1">Status</label>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm focus:border-gold-400 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="held">Held</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
          </select>
        </div>
        {sections.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">Section</label>
            <select
              value={sectionFilter}
              onChange={e => setSectionFilter(e.target.value)}
              className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm focus:border-gold-400 focus:outline-none"
            >
              <option value="all">All sections</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
          No seats match the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(([key, rowSeats]) => {
            const [sectionId, rowLabel] = key.split('::')
            const sectionName = sections.find(s => s.id === sectionId)?.name
            const sectionColor = sectionColorMap.get(sectionId) ?? '#9CA3AF'

            return (
              <div key={key} className="rounded-xl border border-ink-200 bg-white overflow-hidden">
                <div
                  className="px-4 py-2 flex items-center gap-2"
                  style={{ borderLeft: `4px solid ${sectionColor}` }}
                >
                  <span className="text-xs font-semibold text-ink-600">
                    {sectionName ? `${sectionName} · ` : ''}Row {rowLabel}
                  </span>
                  <span className="text-xs text-ink-400">{rowSeats.length} seats</span>
                </div>
                <div className="divide-y divide-ink-100">
                  {rowSeats.map(seat => {
                    const statusInfo = STATUS_LABEL[seat.status] ?? STATUS_LABEL.available
                    const isHolding = holdingId === seat.id

                    return (
                      <div key={seat.id}>
                        <div className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-ink-900 min-w-[60px]">
                              Seat {seat.seat_number}
                            </span>
                            {seat.seat_type !== 'standard' && (
                              <span className="text-xs text-ink-400 capitalize">{seat.seat_type}</span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                              {statusInfo.label}
                            </span>
                            {seat.status === 'held' && seat.held_reason && (
                              <span className="text-xs text-ink-400 capitalize">{seat.held_reason}</span>
                            )}
                          </div>

                          <div className="flex shrink-0 gap-2">
                            {seat.status === 'available' && (
                              <button
                                type="button"
                                onClick={() => setHoldingId(isHolding ? null : seat.id)}
                                className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                Hold
                              </button>
                            )}
                            {seat.status === 'held' && (
                              <button
                                type="button"
                                onClick={() => doRelease(seat.id)}
                                disabled={isPending}
                                className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100 disabled:opacity-50 transition-colors"
                              >
                                Release
                              </button>
                            )}
                          </div>
                        </div>

                        {isHolding && (
                          <div className="px-4 pb-3 flex flex-wrap items-end gap-2 bg-amber-50 border-t border-amber-100">
                            <div>
                              <label className="block text-xs font-medium text-ink-600 mb-1 mt-2">Reason</label>
                              <select
                                value={holdReason}
                                onChange={e => setHoldReason(e.target.value)}
                                className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs focus:border-gold-400 focus:outline-none"
                              >
                                {HOLD_REASONS.map(r => (
                                  <option key={r} value={r} className="capitalize">{r}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 min-w-32">
                              <label className="block text-xs font-medium text-ink-600 mb-1 mt-2">Notes (optional)</label>
                              <input
                                type="text"
                                value={holdNotes}
                                onChange={e => setHoldNotes(e.target.value)}
                                placeholder="e.g. Reserved for sponsor"
                                className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs focus:border-gold-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => doHold(seat.id)}
                                disabled={isPending}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                              >
                                {isPending ? 'Holding…' : 'Confirm Hold'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setHoldingId(null); setHoldNotes('') }}
                                className="rounded-lg px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-100 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
