'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { processCheckout } from '@/app/actions/checkout'
import { CartTimer } from '@/components/checkout/cart-timer'
import { CheckoutSummary } from '@/components/checkout/checkout-summary'
import { DiscountCodeInput } from '@/components/checkout/discount-code-input'
import { AttendeeForm } from '@/components/checkout/attendee-form'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'
import type { AttendeeDetails } from '@/components/checkout/attendee-form'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface CheckoutFormProps {
  reservationId: string
  expiresAt: string
  eventId: string
  eventTitle: string
  eventDate: string
  venue: string | null
  initialFees: FeeBreakdown
  ticketSlots: { tier_id: string; tier_name: string; quantity: number }[]
  tierIds: string[]
  seatMode?: boolean
  seatSlots?: { seat_id: string; label: string; price_cents: number }[]
  userId: string | null
  userFirstName: string
  userLastName: string
  userEmail: string
  currency: string
}

function PaymentForm({
  clientSecret,
  orderId,
  totalCents,
  currency,
}: {
  clientSecret: string
  orderId: string
  totalCents: number
  currency: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setPaying(true)
    setPayError(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders/${orderId}/confirmation`,
      },
    })

    if (error) {
      setPayError(error.message ?? 'Payment failed. Please try again.')
      setPaying(false)
    }
    // On success, Stripe redirects to return_url — no code runs here
  }

  return (
    <form onSubmit={handlePay} className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Payment</h3>
      <PaymentElement options={{ layout: 'tabs' }} />

      {payError && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {payError}
        </div>
      )}

      <button
        type="submit"
        disabled={paying || !stripe}
        className="mt-6 w-full rounded-lg bg-[#1A1A2E] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-[#2d2d4a] transition-colors"
      >
        {paying
          ? 'Processing…'
          : `Pay ${currency.toUpperCase()} ${(totalCents / 100).toFixed(2)}`}
      </button>

      <p className="mt-3 text-center text-xs text-gray-400">
        Secured by Stripe. Your payment info is never stored on our servers.
      </p>
    </form>
  )
}

export function CheckoutForm({
  reservationId,
  expiresAt,
  eventId,
  eventTitle,
  eventDate,
  venue,
  initialFees,
  ticketSlots,
  tierIds,
  seatMode = false,
  seatSlots = [],
  userId,
  userFirstName,
  userLastName,
  userEmail,
  currency,
}: CheckoutFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [expired, setExpired] = useState(false)
  const [fees, setFees] = useState<FeeBreakdown>(initialFees)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [discountCents, setDiscountCents] = useState(0)
  const [discountCodeId, setDiscountCodeId] = useState<string | null>(null)

  const [buyerEmail, setBuyerEmail] = useState(userEmail)
  const [buyerName, setBuyerName] = useState(
    [userFirstName, userLastName].filter(Boolean).join(' ')
  )
  const [attendees, setAttendees] = useState<AttendeeDetails[]>([])

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function handleExpired() {
    setExpired(true)
  }

  function handleDiscountApply(code: string, dc: number, dcId: string) {
    setDiscountCode(code)
    setDiscountCents(dc)
    setDiscountCodeId(dcId)
    // Recalculate displayed fees (simple: subtract discount from total display)
    setFees(prev => ({
      ...prev,
      discount_cents: dc,
      breakdown_display: {
        ...prev.breakdown_display,
        discount: dc,
        total: Math.max(0, prev.breakdown_display.total - dc),
      },
    }))
  }

  function handleDiscountRemove() {
    setDiscountCode(null)
    setDiscountCents(0)
    setDiscountCodeId(null)
    setFees(initialFees)
  }

  function validateForm(): string | null {
    if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return 'Please enter a valid email address'
    }
    if (!buyerName.trim()) return 'Please enter your name'

    // Seat mode: buyer info is used for all seats — no per-seat attendee required
    if (seatMode) return null

    const totalTickets = ticketSlots.reduce((s, t) => s + t.quantity, 0)
    if (attendees.length < totalTickets) {
      return 'Please fill in details for all attendees'
    }
    for (const a of attendees) {
      if (!a.first_name.trim() || !a.last_name.trim() || !a.email.trim()) {
        return 'Please complete all attendee details'
      }
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const validationError = validateForm()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    startTransition(async () => {
      const result = await processCheckout({
        reservation_id: reservationId,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        attendees: attendees.map(a => ({
          ticket_tier_id: a.ticket_tier_id,
          first_name: a.first_name,
          last_name: a.last_name,
          email: a.email,
        })),
        discount_code: discountCode ?? undefined,
      })

      if (result.error) {
        setSubmitError(result.error)
        return
      }

      if (result.is_free && result.order_id) {
        router.push(`/orders/${result.order_id}/confirmation`)
        return
      }

      if (result.client_secret && result.order_id) {
        setClientSecret(result.client_secret)
        setOrderId(result.order_id)
      }
    })
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Your reservation has expired</h2>
          <p className="mt-2 text-gray-500 text-sm">The 10-minute hold on your tickets has ended. The tickets may have been taken by another buyer.</p>
          <a
            href={`/events`}
            className="mt-6 inline-block rounded-lg bg-[#1A1A2E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#2d2d4a]"
          >
            Try Again
          </a>
        </div>
      </div>
    )
  }

  // Once we have a client secret, show Stripe Elements
  if (clientSecret && orderId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl flex items-center justify-between">
            <span className="text-xl font-bold text-[#1A1A2E]">EVENTLINQS</span>
            <CartTimer expiresAt={expiresAt} onExpired={handleExpired} />
          </div>
        </nav>

        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: { colorPrimary: '#1A1A2E', borderRadius: '8px' },
                },
              }}
            >
              <PaymentForm
                clientSecret={clientSecret}
                orderId={orderId}
                totalCents={fees.total_cents}
                currency={currency}
              />
            </Elements>

            <CheckoutSummary
              fees={fees}
              eventTitle={eventTitle}
              eventDate={eventDate}
              venue={venue}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <span className="text-xl font-bold text-[#1A1A2E]">EVENTLINQS</span>
          <CartTimer expiresAt={expiresAt} onExpired={handleExpired} />
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {!userId && (
          <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            <a href="/login" className="font-medium underline">Log in</a> for a faster checkout. Or continue as guest below.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              {/* Buyer info */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Your Details</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Full name</label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      required
                      placeholder="Jane Smith"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={e => setBuyerEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">Confirmation sent to this address</p>
                  </div>
                </div>
              </div>

              {/* Seat slots (seat mode only) */}
              {seatMode && seatSlots && seatSlots.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Your Seats</h3>
                  <ul className="divide-y divide-gray-100">
                    {seatSlots.map(slot => (
                      <li key={slot.seat_id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-700">{slot.label}</span>
                        <span className="font-medium text-gray-900">
                          {currency.toUpperCase()} {(slot.price_cents / 100).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Attendee details (GA only) */}
              {!seatMode && (
                <AttendeeForm
                  tickets={ticketSlots}
                  buyerFirstName={userFirstName || buyerName.split(' ')[0]}
                  buyerLastName={userLastName || buyerName.split(' ').slice(1).join(' ')}
                  buyerEmail={buyerEmail}
                  attendees={attendees}
                  onChange={setAttendees}
                />
              )}

              {/* Discount code */}
              <DiscountCodeInput
                eventId={eventId}
                userId={userId}
                subtotalCents={fees.subtotal_cents + fees.addon_total_cents}
                tierIds={tierIds}
                appliedCode={discountCode}
                discountCents={discountCents}
                onApply={handleDiscountApply}
                onRemove={handleDiscountRemove}
              />

              {submitError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              {/* For free events — direct register button */}
              {fees.total_cents === 0 ? (
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-lg bg-[#10B981] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-[#059669] transition-colors"
                >
                  {isPending ? 'Registering…' : 'Register for Free'}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-lg bg-[#1A1A2E] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-[#2d2d4a] transition-colors"
                >
                  {isPending
                    ? 'Processing…'
                    : `Continue to Payment — ${currency.toUpperCase()} ${(fees.total_cents / 100).toFixed(2)}`}
                </button>
              )}
            </div>

            {/* Sidebar: order summary */}
            <div>
              <CheckoutSummary
                fees={fees}
                eventTitle={eventTitle}
                eventDate={eventDate}
                venue={venue}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
