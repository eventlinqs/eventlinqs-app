'use client'

import { useMemo, useState } from 'react'
import { filterAttendees, type AttendeeRow } from '@/lib/reporting/types'

interface AttendeeTableProps {
  attendees: AttendeeRow[]
  ticketTypes: string[]
}

const PAGE_SIZE = 50

function formatPurchaseDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AttendeeTable({ attendees, ticketTypes }: AttendeeTableProps) {
  const [search, setSearch] = useState('')
  const [ticketType, setTicketType] = useState('all')
  const [checkIn, setCheckIn] = useState<'all' | 'checked_in' | 'not_checked_in'>('all')
  const [page, setPage] = useState(0)

  const filtered = useMemo(
    () => filterAttendees(attendees, { search, ticketType, checkIn }),
    [attendees, search, ticketType, checkIn]
  )

  const hasFilters = search.trim() !== '' || ticketType !== 'all' || checkIn !== 'all'
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function resetFilters() {
    setSearch('')
    setTicketType('all')
    setCheckIn('all')
    setPage(0)
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="attendee-search" className="sr-only">
            Search attendees by name or email
          </label>
          <input
            id="attendee-search"
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search by name or email"
            className="min-h-[44px] w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <div>
          <label htmlFor="attendee-tier" className="sr-only">
            Filter by ticket type
          </label>
          <select
            id="attendee-tier"
            value={ticketType}
            onChange={e => {
              setTicketType(e.target.value)
              setPage(0)
            }}
            className="min-h-[44px] w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 sm:w-auto"
          >
            <option value="all">All ticket types</option>
            {ticketTypes.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="attendee-checkin" className="sr-only">
            Filter by check-in status
          </label>
          <select
            id="attendee-checkin"
            value={checkIn}
            onChange={e => {
              setCheckIn(e.target.value as 'all' | 'checked_in' | 'not_checked_in')
              setPage(0)
            }}
            className="min-h-[44px] w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 sm:w-auto"
          >
            <option value="all">All check-in</option>
            <option value="checked_in">Checked in</option>
            <option value="not_checked_in">Not checked in</option>
          </select>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-ink-600" aria-live="polite">
        <span>
          Showing {filtered.length} of {attendees.length} {attendees.length === 1 ? 'attendee' : 'attendees'}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[44px] font-medium text-gold-800 underline hover:text-gold-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white p-12 text-center">
          <p className="text-sm text-ink-600">
            {attendees.length === 0
              ? 'No attendees yet. Buyers appear here as soon as they purchase.'
              : 'No attendees match your filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wider text-ink-600">
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Ticket type</th>
                <th scope="col" className="px-4 py-3">Order ref</th>
                <th scope="col" className="px-4 py-3">Purchase date</th>
                <th scope="col" className="px-4 py-3">Check-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {visible.map(a => (
                <tr key={a.ticketCode} className="transition-colors hover:bg-ink-100">
                  <td className="px-4 py-3 font-medium text-ink-900">{a.name}</td>
                  <td className="px-4 py-3 text-ink-600">{a.email}</td>
                  <td className="px-4 py-3 text-ink-600">{a.ticketType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-600">{a.orderRef}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-600">{formatPurchaseDate(a.purchaseDate)}</td>
                  <td className="px-4 py-3">
                    {a.checkedIn ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-ink-900">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                        Checked in
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" aria-hidden="true" />
                        Not checked in
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-4 py-2 font-medium text-ink-900 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-ink-600">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-4 py-2 font-medium text-ink-900 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
