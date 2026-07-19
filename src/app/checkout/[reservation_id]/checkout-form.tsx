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
import { Button } from '@/components/ui/Button'
import { CartTimer } from '@/components/checkout/cart-timer'
import { CheckoutSummary } from '@/components/checkout/checkout-summary'
import { DiscountCodeInput } from '@/components/checkout/discount-code-input'
import { AttendeeForm } from '@/components/checkout/attendee-form'
import { MarketingConsent } from '@/components/checkout/marketing-consent'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'
import type { AttendeeDetails } from '@/components/checkout/attendee-form'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Shared field styling: 44px+ touch target and 16px text so iOS never
// zoom-jumps the viewport on focus. Gold focus ring per the design system.
const FIELD_CLS =
  'w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500'

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
  organiserName: string
}

function PaymentForm({
  clientSecret: _clientSecret,
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
    // On success, Stripe redirects to return_url - no code runs here
  }

  return (
    <form onSubmit={handlePay} className="rounded-xl border border-ink-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-900 mb-4">Payment</h3>
      <PaymentElement options={{ layout: 'tabs' }} />

      {payError && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {payError}
        </div>
      )}

      {/* Disable until Elements is mounted too: handlePay bails on !elements,
          so an enabled button before that is a silent no-op click. */}
      <Button type="submit" size="lg" disabled={paying || !stripe || !elements} className="mt-6 w-full">
        {paying
          ? 'Processing…'
          : `Pay ${currency.toUpperCase()} ${(totalCents / 100).toFixed(2)}`}
      </Button>

      <p className="mt-3 text-center text-xs text-ink-400">
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
  organiserName,
}: CheckoutFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [expired, setExpired] = useState(false)
  const [fees, setFees] = useState<FeeBreakdown>(initialFees)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [discountCents, setDiscountCents] = useState(0)
  const [_discountCodeId, setDiscountCodeId] = useState<string | null>(null)

  const [buyerEmail, setBuyerEmail] = useState(userEmail)
  const [buyerName, setBuyerName] = useState(
    [userFirstName, userLastName].filter(Boolean).join(' ')
  )
  const [attendees, setAttendees] = useState<AttendeeDetails[]>([])

  // Marketing consent (Spam Act). Both default UNCHECKED. Optional, never gates
  // the purchase.
  const [organiserConsent, setOrganiserConsent] = useState(false)
  const [platformConsent, setPlatformConsent] = useState(false)

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

    // Seat mode: buyer info is used for all seats - no per-seat attendee required
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
        organiser_marketing_consent: organiserConsent,
        platform_updates_consent: platformConsent,
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
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            <svg className="h-8 w-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-bold text-ink-900">Your reservation has expired</h2>
          <p className="mt-2 text-sm text-ink-600">The 10-minute hold on your tickets has ended. They may have been taken by another buyer.</p>
          <Button href="/events" size="lg" className="mt-6 w-full">
            Find tickets again
          </Button>
        </div>
      </div>
    )
  }

  // Once we have a client secret, show Stripe Elements
  if (clientSecret && orderId) {
    return (
      <div className="min-h-screen bg-canvas">
        <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl flex items-center justify-between">
            <span className="text-xl font-bold text-ink-900">EVENTLINQS</span>
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
                  variables: { colorPrimary: '#0A1628', borderRadius: '8px' },
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
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <span className="text-xl font-bold text-ink-900">EVENTLINQS</span>
          <CartTimer expiresAt={expiresAt} onExpired={handleExpired} />
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* gold-800 (brand-accent-strong) not gold-600: gold text on a light
            surface must meet 4.5:1 (Design system, gold tiers). */}
        {!userId && (
          <div className="mb-6 rounded-lg bg-gold-100 border border-gold-200 px-4 py-3 text-sm text-gold-800">
            <a href="/login" className="font-semibold underline">Log in</a> for a faster checkout. Or continue as guest below.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              {/* Buyer info */}
              <div className="rounded-xl border border-ink-200 bg-white p-6">
                <h3 className="text-base font-semibold text-ink-900 mb-4">Your Details</h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="buyer-name" className="block text-xs text-ink-600 mb-1">Full name</label>
                    <input
                      id="buyer-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      required
                      placeholder="Jane Smith"
                      className={FIELD_CLS}
                    />
                  </div>
                  <div>
                    <label htmlFor="buyer-email" className="block text-xs text-ink-600 mb-1">Email</label>
                    <input
                      id="buyer-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={buyerEmail}
                      onChange={e => setBuyerEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className={FIELD_CLS}
                    />
                    <p className="mt-1 text-xs text-ink-400">Confirmation sent to this address</p>
                  </div>
                </div>
              </div>

              {/* Seat slots (seat mode only) */}
              {seatMode && seatSlots && seatSlots.length > 0 && (
                <div className="rounded-xl border border-ink-200 bg-white p-6">
                  <h3 className="text-base font-semibold text-ink-900 mb-4">Your Seats</h3>
                  <ul className="divide-y divide-ink-100">
                    {seatSlots.map(slot => (
                      <li key={slot.seat_id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-ink-600">{slot.label}</span>
                        <span className="font-medium text-ink-900">
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

              {/* Marketing consent (Spam Act): separate, unchecked, optional,
                  never a condition of purchase. */}
              <MarketingConsent
                organiserName={organiserName}
                organiserConsent={organiserConsent}
                platformConsent={platformConsent}
                onOrganiserChange={setOrganiserConsent}
                onPlatformChange={setPlatformConsent}
              />

              {submitError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              {/* Free vs paid: the same canonical gold CTA carries the whole
                  buyer thread (Get tickets -> Checkout -> this), free events
                  just register straight away. */}
              {fees.total_cents === 0 ? (
                <Button type="submit" size="lg" disabled={isPending} className="w-full">
                  {isPending ? 'Registering…' : 'Register for free'}
                </Button>
              ) : (
                <Button type="submit" size="lg" disabled={isPending} className="w-full">
                  {isPending
                    ? 'Processing…'
                    : `Continue to payment - ${currency.toUpperCase()} ${(fees.total_cents / 100).toFixed(2)}`}
                </Button>
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
