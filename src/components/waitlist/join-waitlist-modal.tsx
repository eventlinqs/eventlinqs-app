'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { joinWaitlist } from '@/app/actions/waitlist'

interface Props {
  isOpen: boolean
  onClose: () => void
  eventId: string
  tierId: string
  tierName: string
  maxPerOrder: number
  userEmail: string | null
}

export function JoinWaitlistModal({
  isOpen,
  onClose,
  eventId,
  tierId,
  tierName,
  maxPerOrder,
  userEmail,
}: Props) {
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successPosition, setSuccessPosition] = useState<number | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const maxQty = Math.min(maxPerOrder, 10)

  // Focus trap: move focus to close button when modal opens
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus()
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Reset state when reopened
  useEffect(() => {
    if (isOpen) {
      setQuantity(1)
      setError(null)
      setSuccessPosition(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await joinWaitlist({ event_id: eventId, ticket_tier_id: tierId, quantity })

    setIsSubmitting(false)

    if (!result.success) {
      if (result.error?.includes('signed in')) {
        // Redirect to login, return to event page after
        router.push(`/login?returnUrl=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      setError(result.error ?? 'Something went wrong. Please try again.')
      return
    }

    setSuccessPosition(result.position ?? null)
    router.refresh()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal — full screen on mobile, centered card on md+ */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-modal-title"
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      >
        <div className="w-full md:w-[480px] bg-white rounded-t-2xl md:rounded-2xl shadow-xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <h2 id="waitlist-modal-title" className="text-lg font-semibold text-gray-900">
              Join Waitlist — {tierName}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close waitlist modal"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-5">
            {successPosition !== null ? (
              /* ── Success state ── */
              <div className="text-center py-4" role="status" aria-live="polite">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">You&apos;re on the waitlist!</h3>
                <p className="mt-2 text-sm text-gray-600">
                  You are <span className="font-bold text-gray-900">#{successPosition}</span> in line for{' '}
                  <span className="font-medium">{tierName}</span>.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  We&apos;ll email you immediately if tickets become available. You have 15 minutes to complete your purchase once notified.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  <a
                    href="/dashboard/my-waitlists"
                    className="block w-full rounded-xl bg-[#1A1A2E] py-3 text-center text-sm font-semibold text-white hover:bg-[#2d2d4a] transition-colors"
                  >
                    View My Waitlists
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="block w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* ── Join form ── */
              <form onSubmit={handleSubmit} noValidate>
                <p className="text-sm text-gray-600 mb-5">
                  This tier is sold out. Join the waitlist and we&apos;ll notify you immediately if a spot opens up.
                </p>

                {/* Quantity */}
                <div className="mb-5">
                  <label htmlFor="waitlist-quantity" className="block text-sm font-medium text-gray-700 mb-1.5">
                    How many tickets do you need?
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      −
                    </button>
                    <span
                      id="waitlist-quantity"
                      aria-live="polite"
                      aria-atomic="true"
                      className="w-12 text-center text-xl font-bold tabular-nums text-gray-900"
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                      disabled={quantity >= maxQty}
                      aria-label="Increase quantity"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      +
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Maximum {maxQty} per order</p>
                </div>

                {/* Email confirmation */}
                {userEmail && (
                  <div className="mb-5 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                    <p className="text-sm text-blue-800">
                      Notifications will be sent to <span className="font-semibold">{userEmail}</span>
                    </p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div
                    role="alert"
                    className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-[#1A1A2E] py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#2d2d4a] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  {isSubmitting ? 'Joining…' : `Join Waitlist — ${quantity} ticket${quantity > 1 ? 's' : ''}`}
                </button>

                <p className="mt-3 text-center text-xs text-gray-400">
                  You&apos;ll have 15 minutes to buy once notified. FIFO — first in, first served.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
