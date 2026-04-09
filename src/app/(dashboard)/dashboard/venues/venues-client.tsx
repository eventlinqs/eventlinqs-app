'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createVenue, updateVenue, deleteVenue, type VenueInput } from './actions'

interface Venue {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  capacity: number | null
  description: string | null
  _seat_map_count?: number
}

interface Props {
  venues: Venue[]
}

const BLANK: VenueInput = {
  name: '',
  address: null,
  city: null,
  state: null,
  country: null,
  postal_code: null,
  capacity: null,
  description: null,
}

function VenueForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: VenueInput & { id?: string }
  onSave: (input: VenueInput) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<VenueInput>({
    name: initial.name,
    address: initial.address,
    city: initial.city,
    state: initial.state,
    country: initial.country,
    postal_code: initial.postal_code,
    capacity: initial.capacity,
    description: initial.description,
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof VenueInput>(k: K, v: VenueInput[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  function submit() {
    if (!form.name.trim()) {
      setError('Venue name is required')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await onSave(form)
      // onSave resolves void on success; parent revalidation closes the form
      void result
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Venue Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Melbourne Convention Centre"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
          <input
            type="text"
            value={form.address ?? ''}
            onChange={e => set('address', e.target.value || null)}
            placeholder="e.g. 1 Convention Centre Place"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={form.city ?? ''}
            onChange={e => set('city', e.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State / Province</label>
          <input
            type="text"
            value={form.state ?? ''}
            onChange={e => set('state', e.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <input
            type="text"
            value={form.country ?? ''}
            onChange={e => set('country', e.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
          <input
            type="text"
            value={form.postal_code ?? ''}
            onChange={e => set('postal_code', e.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Capacity
            <span className="ml-1 text-xs text-gray-400">Optional</span>
          </label>
          <input
            type="number"
            min="1"
            value={form.capacity ?? ''}
            onChange={e => set('capacity', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="e.g. 5000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            rows={3}
            value={form.description ?? ''}
            onChange={e => set('description', e.target.value || null)}
            placeholder="Optional notes about this venue"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Venue'}
        </button>
      </div>
    </div>
  )
}

export function VenuesClient({ venues: initialVenues }: Props) {
  const [venues, setVenues] = useState<Venue[]>(initialVenues)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleCreate(input: VenueInput): Promise<void> {
    return new Promise(resolve => {
      startTransition(async () => {
        const result = await createVenue(input)
        if (!result.error) {
          setShowCreate(false)
          // Optimistic: server revalidatePath will refresh; we rely on Next.js RSC re-render
        }
        resolve()
      })
    })
  }

  function handleUpdate(venueId: string, input: VenueInput): Promise<void> {
    return new Promise(resolve => {
      startTransition(async () => {
        const result = await updateVenue(venueId, input)
        if (!result.error) {
          setVenues(prev =>
            prev.map(v =>
              v.id === venueId ? { ...v, ...input } : v
            )
          )
          setEditingId(null)
        }
        resolve()
      })
    })
  }

  function handleDelete(venueId: string) {
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteVenue(venueId)
      if (result.error) {
        setDeleteError(result.error)
      } else {
        setVenues(prev => prev.filter(v => v.id !== venueId))
        setDeletingId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage reusable venue definitions and seat maps for reserved seating events.
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + New Venue
          </button>
        )}
      </div>

      {showCreate && (
        <VenueForm
          initial={{ ...BLANK }}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {venues.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">No venues yet. Create your first venue to get started.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + New Venue
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {venues.map(venue => (
            <div key={venue.id} className="rounded-xl border border-gray-200 bg-white">
              {editingId === venue.id ? (
                <div className="p-6">
                  <VenueForm
                    initial={{
                      id: venue.id,
                      name: venue.name,
                      address: venue.address,
                      city: venue.city,
                      state: venue.state,
                      country: venue.country,
                      postal_code: venue.postal_code,
                      capacity: venue.capacity,
                      description: venue.description,
                    }}
                    onSave={input => handleUpdate(venue.id, input)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : deletingId === venue.id ? (
                <div className="p-6">
                  <p className="text-sm text-gray-700 mb-4">
                    Are you sure you want to delete <strong>{venue.name}</strong>? This is a soft
                    delete — historical event data is preserved.
                  </p>
                  {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(venue.id)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeletingId(null); setDeleteError(null) }}
                      className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 truncate">{venue.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {[venue.city, venue.state, venue.country].filter(Boolean).join(', ')}
                      {venue.capacity ? ` · Capacity: ${venue.capacity.toLocaleString()}` : ''}
                    </p>
                    {venue.description && (
                      <p className="text-sm text-gray-400 mt-1 line-clamp-2">{venue.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/dashboard/venues/${venue.id}/seat-maps`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Seat Maps
                    </Link>
                    <button
                      type="button"
                      onClick={() => setEditingId(venue.id)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(venue.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
