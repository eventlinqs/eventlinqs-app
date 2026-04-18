'use client'

import { useState } from 'react'

export interface AttendeeDetails {
  ticket_tier_id: string
  tier_name: string
  first_name: string
  last_name: string
  email: string
}

interface AttendeeFormProps {
  tickets: { tier_id: string; tier_name: string; quantity: number }[]
  buyerFirstName: string
  buyerLastName: string
  buyerEmail: string
  attendees: AttendeeDetails[]
  onChange: (attendees: AttendeeDetails[]) => void
}

export function AttendeeForm({
  tickets,
  buyerFirstName,
  buyerLastName,
  buyerEmail,
  attendees,
  onChange,
}: AttendeeFormProps) {
  const [useMyDetails, setUseMyDetails] = useState(false)

  // Expand tickets into individual attendee slots
  const slots: { tier_id: string; tier_name: string; index: number }[] = []
  for (const ticket of tickets) {
    for (let i = 0; i < ticket.quantity; i++) {
      slots.push({ tier_id: ticket.tier_id, tier_name: ticket.tier_name, index: i })
    }
  }

  function fillWithBuyerDetails() {
    const filled = slots.map(slot => ({
      ticket_tier_id: slot.tier_id,
      tier_name: slot.tier_name,
      first_name: buyerFirstName,
      last_name: buyerLastName,
      email: buyerEmail,
    }))
    onChange(filled)
    setUseMyDetails(true)
  }

  function clearFill() {
    const cleared = slots.map(slot => {
      const existing = attendees.find(
        a => a.ticket_tier_id === slot.tier_id
      )
      return {
        ticket_tier_id: slot.tier_id,
        tier_name: slot.tier_name,
        first_name: existing?.first_name ?? '',
        last_name: existing?.last_name ?? '',
        email: existing?.email ?? '',
      }
    })
    onChange(cleared)
    setUseMyDetails(false)
  }

  function updateAttendee(slotIndex: number, field: keyof AttendeeDetails, value: string) {
    const updated = [...attendees]
    if (!updated[slotIndex]) {
      updated[slotIndex] = {
        ticket_tier_id: slots[slotIndex].tier_id,
        tier_name: slots[slotIndex].tier_name,
        first_name: '',
        last_name: '',
        email: '',
      }
    }
    updated[slotIndex] = { ...updated[slotIndex], [field]: value }
    onChange(updated)
  }

  function getAttendee(slotIndex: number): AttendeeDetails {
    return attendees[slotIndex] ?? {
      ticket_tier_id: slots[slotIndex].tier_id,
      tier_name: slots[slotIndex].tier_name,
      first_name: '',
      last_name: '',
      email: '',
    }
  }

  if (slots.length === 0) return null

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-ink-900">Attendee Details</h3>
        {buyerEmail && (
          <button
            type="button"
            onClick={useMyDetails ? clearFill : fillWithBuyerDetails}
            className="text-sm text-gold-500 hover:text-gold-600 font-medium"
          >
            {useMyDetails ? 'Clear' : 'Use my details for all tickets'}
          </button>
        )}
      </div>

      <div className="space-y-6">
        {slots.map((slot, i) => {
          const attendee = getAttendee(i)
          return (
            <div key={`${slot.tier_id}-${i}`} className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium text-ink-600 mb-3">
                {slot.tier_name}
                {slot.index > 0 && ` (Ticket ${slot.index + 1})`}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-400 mb-1">First name</label>
                  <input
                    type="text"
                    value={attendee.first_name}
                    onChange={e => updateAttendee(i, 'first_name', e.target.value)}
                    required
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-400 mb-1">Last name</label>
                  <input
                    type="text"
                    value={attendee.last_name}
                    onChange={e => updateAttendee(i, 'last_name', e.target.value)}
                    required
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-ink-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={attendee.email}
                    onChange={e => updateAttendee(i, 'email', e.target.value)}
                    required
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
