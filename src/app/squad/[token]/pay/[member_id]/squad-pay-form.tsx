'use client'

import { useState, useEffect, useTransition } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { createSquadMemberPaymentIntent } from '@/app/actions/squad-checkout'

interface SquadPayFormProps {
  memberId: string
  squadToken: string
  memberName: string
  memberEmail: string
  pricePerSpotCents: number
  currency: string
  publishableKey: string
}

function formatPrice(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

// ── Inner form rendered inside Stripe <Elements> ──────────────────────────────

function InnerPayForm({
  memberId: _memberId,
  pricePerSpotCents,
  currency,
  squadToken,
}: {
  memberId: string
  pricePerSpotCents: number
  currency: string
  squadToken: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const returnUrl = `${appUrl}/squad/${squadToken}?payment=complete`

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setError(null)

    startTransition(async () => {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message ?? 'Payment failed')
        return
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
      })

      if (confirmError) {
        setError(confirmError.message ?? 'Payment could not be processed. Please try again.')
      }
      // On success Stripe redirects to returnUrl - no code runs here
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isPending}
        className="
          mt-5 w-full h-12 rounded-xl bg-[#1A1A2E] text-white font-semibold text-base
          disabled:opacity-50 hover:bg-[#2d2d4a] transition-colors
          flex items-center justify-center gap-2
        "
      >
        {isPending ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Processing…
          </>
        ) : (
          `Pay ${formatPrice(pricePerSpotCents, currency)}`
        )}
      </button>

      <p className="mt-3 text-center text-xs text-ink-400">
        Secured by Stripe. Your payment info is never stored on our servers.
      </p>
    </form>
  )
}

// ── Outer shell: creates payment intent then mounts Elements ─────────────────

export function SquadPayForm({
  memberId,
  squadToken,
  memberEmail: _memberEmail,
  pricePerSpotCents,
  currency,
  publishableKey,
}: SquadPayFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    createSquadMemberPaymentIntent(memberId).then(result => {
      if (cancelled) return
      if (result.error) {
        setLoadError(result.error)
      } else if (result.client_secret) {
        setClientSecret(result.client_secret)
      }
      setIsLoading(false)
    }).catch(err => {
      if (cancelled) return
      console.error('[squad-pay-form] createSquadMemberPaymentIntent error:', err)
      setLoadError('Failed to initialise payment. Please try again.')
      setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [memberId])

  const stripePromise = loadStripe(publishableKey)

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-[#4A90D9]" />
        <p className="mt-3 text-sm text-ink-400">Loading payment form…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
        {loadError}
      </div>
    )
  }

  if (!clientSecret) return null

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#4A90D9',
            colorBackground: '#ffffff',
            borderRadius: '8px',
          },
        },
      }}
    >
      <InnerPayForm
        memberId={memberId}
        pricePerSpotCents={pricePerSpotCents}
        currency={currency}
        squadToken={squadToken}
      />
    </Elements>
  )
}
