'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { AuthResponse } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { joinWaitlist } from '@/app/actions/waitlist'

/**
 * EventSoldOut - full sold-out UX for an event detail page.
 *
 * Renders where the ticket selector would normally appear. Keeps the
 * surrounding event detail (hero, about, venue) intact. Integration:
 *
 *   {soldOut
 *     ? <EventSoldOut event={...} primaryTierId={...} relatedEvents={...} />
 *     : <TicketSelector ... />}
 */

export interface EventSoldOutRelated {
  id: string
  slug: string
  title: string
  start_date: string
  venue_city: string | null
  venue_country: string | null
  cover_image_url: string | null
  category_name?: string | null
  from_price_cents?: number | null
  currency?: string | null
}

export interface EventSoldOutProps {
  event: {
    id: string
    slug: string
    title: string
  }
  /** First visible tier ID on the event. Used as the target of the waitlist join. */
  primaryTierId: string | null
  relatedEvents: EventSoldOutRelated[]
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'ok'; position: number }
  | { kind: 'needs-login'; email: string }
  | { kind: 'error'; message: string }

export function EventSoldOut({ event, primaryTierId, relatedEvents }: EventSoldOutProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [state, setState] = useState<SubmitState>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then((res: AuthResponse) => {
      const mail = res.data.user?.email ?? null
      setAuthEmail(mail)
      if (mail) setEmail(mail)
    })
  }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setState({ kind: 'error', message: 'Enter your email to join the waitlist' })
      return
    }
    if (!primaryTierId) {
      setState({ kind: 'error', message: 'Waitlist is not open for this event yet' })
      return
    }

    // Unauthenticated flow - bounce to login with a return path to this event
    if (!authEmail) {
      const next = encodeURIComponent(`/events/${event.slug}?waitlist=1`)
      router.push(`/login?email=${encodeURIComponent(trimmed)}&next=${next}`)
      return
    }

    startTransition(async () => {
      const result = await joinWaitlist({
        event_id: event.id,
        ticket_tier_id: primaryTierId,
        quantity: 1,
      })
      if (!result.success) {
        setState({ kind: 'error', message: result.error ?? 'Failed to join the waitlist. Please try again.' })
        return
      }
      setState({ kind: 'ok', position: result.position ?? 0 })
    })
  }

  return (
    <section aria-labelledby="sold-out-heading" className="space-y-10">
      {/* Primary sold-out panel */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col items-start gap-4">
          <span className="inline-flex items-center rounded-md bg-gold-500 px-3 py-1.5 text-xs md:text-sm font-extrabold uppercase tracking-widest text-ink-900">
            Sold out
          </span>

          <h2 id="sold-out-heading" className="text-2xl md:text-3xl font-extrabold text-ink-900 leading-tight">
            This event is sold out
          </h2>

          <p className="text-sm md:text-base text-ink-600 max-w-xl">
            Join the waitlist and we will notify you the moment a ticket becomes available.
          </p>

          {state.kind === 'ok' ? (
            <div className="w-full rounded-xl border border-gold-500/30 bg-gold-100 px-4 py-4 text-sm text-ink-900">
              <p className="font-semibold">You are on the waitlist.</p>
              <p className="mt-1 text-ink-600">
                {state.position > 0
                  ? `Your current position is #${state.position}. We will email you if a ticket becomes available.`
                  : 'We will email you if a ticket becomes available.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="w-full flex flex-col sm:flex-row gap-2 mt-2">
              <label htmlFor="sold-out-email" className="sr-only">Email</label>
              <input
                id="sold-out-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 min-w-0 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition"
                disabled={isPending}
              />
              <button
                type="submit"
                disabled={isPending}
                className="shrink-0 rounded-lg bg-gold-500 hover:bg-gold-600 px-5 py-3 text-sm font-semibold text-ink-900 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed transition-colors shadow-sm hover:shadow-md"
              >
                {isPending ? 'Joining…' : 'Join waitlist'}
              </button>
            </form>
          )}

          {state.kind === 'error' && (
            <p role="alert" className="text-sm text-error">{state.message}</p>
          )}

          {!authEmail && state.kind !== 'ok' && (
            <p className="text-xs text-ink-400">
              You will be asked to sign in so we can match any ticket releases to your account.
            </p>
          )}
        </div>
      </div>

      {/* Related events */}
      {relatedEvents.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <h3 className="text-lg font-bold text-ink-900">Or browse similar events</h3>
            <Link
              href="/events"
              className="text-xs font-semibold text-ink-600 hover:text-ink-900 hover:underline decoration-gold-500 decoration-2 underline-offset-4 transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedEvents.slice(0, 3).map((e) => (
              <RelatedCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function RelatedCard({ event }: { event: EventSoldOutRelated }) {
  const dateLabel = new Date(event.start_date).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const locationLabel = [event.venue_city, event.venue_country].filter(Boolean).join(', ') || null
  const priceLabel =
    event.from_price_cents != null && event.currency
      ? event.from_price_cents === 0
        ? 'Free'
        : `From ${event.currency.toUpperCase()} ${(event.from_price_cents / 100).toFixed(2)}`
      : null

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block overflow-hidden rounded-xl border border-ink-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-gold-500/40"
    >
      <div className="relative aspect-[16/10] bg-ink-100 overflow-hidden">
        {event.cover_image_url ? (
          <Image
            src={event.cover_image_url}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-400">
            No image
          </div>
        )}
        {event.category_name && (
          <span className="absolute left-2 top-2 rounded-md bg-ink-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
            {event.category_name}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">
          {dateLabel}
        </p>
        <h4 className="mt-1 text-sm font-bold text-ink-900 line-clamp-2 leading-snug">
          {event.title}
        </h4>
        {locationLabel && (
          <p className="mt-1 text-xs text-ink-600 line-clamp-1">{locationLabel}</p>
        )}
        {priceLabel && (
          <p className="mt-2 text-xs font-semibold text-ink-900">{priceLabel}</p>
        )}
      </div>
    </Link>
  )
}
