'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { respondToRequestAction } from '@/app/actions/gigs'
import { PAY_TYPE_LABELS, type BookingRequestRow, type PayType } from '@/lib/marketplace/gigs'

type RequestView = Pick<
  BookingRequestRow,
  'id' | 'kind' | 'subject' | 'note' | 'pay_type' | 'pay_amount_cents' | 'pay_note' | 'proposed_date' | 'event_id' | 'status' | 'created_at'
> & { organisationName: string | null }

function payLine(payType: PayType | null, cents: number | null, note: string | null): string | null {
  if (!payType) return null
  const base =
    payType === 'fixed_fee' && cents
      ? `$${(cents / 100).toFixed(0)} fixed fee`
      : PAY_TYPE_LABELS[payType]
  return note ? `${base} · ${note}` : base
}

/**
 * The performer's booking and mentoring requests: structured, accept or
 * decline, one tap. Accepting a booking with an event attached puts the
 * performer straight onto that lineup.
 */
export function RequestsPanel({ requests }: { requests: RequestView[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function respond(requestId: string, response: 'accepted' | 'declined') {
    startTransition(async () => {
      await respondToRequestAction({ requestId, response })
      router.refresh()
    })
  }

  if (requests.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-ink-600">
        No requests yet. Organisers who want to book you, and performers asking for mentoring,
        land here with a clear ask you accept or decline.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-ink-200/60">
      {requests.map((req) => {
        const pay = payLine(req.pay_type, req.pay_amount_cents, req.pay_note)
        return (
          <li key={req.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-800">
                  {req.kind === 'booking' ? 'Booking request' : 'Mentoring request'}
                  {req.organisationName ? ` · ${req.organisationName}` : ''}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink-900">{req.subject}</p>
                {req.note && <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{req.note}</p>}
                <p className="mt-1 text-xs text-ink-600">
                  {[
                    pay,
                    req.proposed_date
                      ? new Intl.DateTimeFormat('en-AU', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        }).format(new Date(req.proposed_date))
                      : null,
                    req.event_id && req.kind === 'booking' ? 'Accepting adds you to the event lineup' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              {req.status === 'pending' ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => respond(req.id, 'accepted')}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => respond(req.id, 'declined')}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    req.status === 'accepted' ? 'bg-success/15 text-success' : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
