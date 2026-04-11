'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { joinSquad } from '@/app/actions/squads'
import type { SquadStatus, SquadMemberStatus } from '@/types/database'

interface SquadJoinPanelProps {
  squadId: string
  shareToken: string
  eventSlug: string
  status: SquadStatus
  isExpired: boolean
  isFull: boolean
  remainingSpots: number
  currentUserMemberId: string | null
  currentUserMemberStatus: SquadMemberStatus | null
  isLoggedIn: boolean
  pricePerSpotCents: number
  currency: string
  eventTitle: string
}

function formatPrice(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export function SquadJoinPanel({
  squadId: _squadId,
  shareToken,
  eventSlug,
  status,
  isExpired,
  isFull,
  remainingSpots: _remainingSpots,
  currentUserMemberId,
  currentUserMemberStatus,
  isLoggedIn,
  pricePerSpotCents,
  currency,
  eventTitle,
}: SquadJoinPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)
  const [joinedMemberId, setJoinedMemberId] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  // ── Determine which state to render ───────────────────────────────────────

  // 1. Squad no longer active
  if (status === 'completed' || isExpired || status === 'expired') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
        <p className="font-semibold text-gray-700">
          {status === 'completed' ? '🎉 This squad is complete!' : '⏰ This squad has expired'}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {status === 'completed'
            ? 'All spots are filled and everyone has their ticket.'
            : 'The squad window has closed and unfilled spots were released.'}
        </p>
        <Link
          href={`/events/${eventSlug}`}
          className="mt-4 inline-block rounded-xl bg-[#1A1A2E] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4a] transition-colors"
        >
          Browse tickets for this event
        </Link>
      </div>
    )
  }

  if (status === 'cancelled') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
        <p className="font-semibold text-gray-700">This squad has been cancelled</p>
        <p className="mt-1 text-sm text-gray-500">The squad leader cancelled this group booking.</p>
        <Link
          href={`/events/${eventSlug}`}
          className="mt-4 inline-block rounded-xl bg-[#1A1A2E] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4a] transition-colors"
        >
          Get your own tickets
        </Link>
      </div>
    )
  }

  // 2. Squad is full
  if (isFull) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
        <p className="font-semibold text-gray-700">Squad is full</p>
        <p className="mt-1 text-sm text-gray-500">All spots have been claimed for this squad.</p>
        <Link
          href={`/events/${eventSlug}`}
          className="mt-4 inline-block rounded-xl bg-[#1A1A2E] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4a] transition-colors"
        >
          Get your own tickets
        </Link>
      </div>
    )
  }

  // 3. Current user already in squad and has paid — show "Pay your share" or status
  if (currentUserMemberStatus === 'paid') {
    return (
      <div className="
        fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-4
        pb-[max(1rem,env(safe-area-inset-bottom))]
        md:static md:rounded-2xl md:border md:border-gray-200 md:shadow-sm
      ">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
            ✓
          </div>
          <div>
            <p className="font-semibold text-gray-900">You&apos;re in!</p>
            <p className="text-sm text-gray-500">Your payment is confirmed. Watch for your ticket email.</p>
          </div>
        </div>
      </div>
    )
  }

  // 4. Current user already joined but not paid yet — show Pay CTA
  if (currentUserMemberStatus === 'invited' && currentUserMemberId && !joined) {
    return (
      <div className="
        fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-4
        pb-[max(1rem,env(safe-area-inset-bottom))]
        md:static md:rounded-2xl md:border md:border-gray-200 md:shadow-sm md:p-5
      ">
        <p className="text-sm text-gray-600 mb-3">
          You&apos;ve claimed a spot — pay your share to lock it in.
        </p>
        <Link
          href={`/squad/${shareToken}/pay/${currentUserMemberId}`}
          className="block w-full h-12 rounded-xl bg-[#4A90D9] text-white font-semibold text-base
                     flex items-center justify-center hover:bg-[#3478C5] transition-colors"
        >
          Pay your share — {formatPrice(pricePerSpotCents, currency)}
        </Link>
      </div>
    )
  }

  // 5. Not logged in — prompt login
  if (!isLoggedIn && !showForm) {
    return (
      <div className="
        fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-4
        pb-[max(1rem,env(safe-area-inset-bottom))]
        md:static md:rounded-2xl md:border md:border-gray-200 md:shadow-sm md:p-5
      ">
        <p className="text-sm text-gray-600 mb-4">
          Join the squad for <strong>{eventTitle}</strong> — everyone pays their own share.
        </p>
        <div className="space-y-2">
          <Link
            href={`/login?next=/squad/${shareToken}`}
            className="block w-full h-12 rounded-xl bg-[#1A1A2E] text-white font-semibold text-sm
                       flex items-center justify-center hover:bg-[#2d2d4a] transition-colors"
          >
            Sign in to join
          </Link>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="block w-full h-12 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm
                       flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            Continue as guest
          </button>
        </div>
      </div>
    )
  }

  // 6. Join success
  if (joined && joinedMemberId) {
    return (
      <div className="
        fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-4
        pb-[max(1rem,env(safe-area-inset-bottom))]
        md:static md:rounded-2xl md:border md:border-gray-200 md:shadow-sm md:p-5
      ">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-4">
          <p className="font-semibold text-emerald-800">You&apos;re in the squad!</p>
          <p className="text-sm text-emerald-700 mt-1">Pay your share to lock in your spot.</p>
        </div>
        <Link
          href={`/squad/${shareToken}/pay/${joinedMemberId}`}
          className="block w-full h-12 rounded-xl bg-[#4A90D9] text-white font-semibold text-base
                     flex items-center justify-center hover:bg-[#3478C5] transition-colors"
        >
          Pay your share — {formatPrice(pricePerSpotCents, currency)}
        </Link>
      </div>
    )
  }

  // 7. Join form (guest or logged-in joining for first time)
  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await joinSquad({
        share_token: shareToken,
        attendee_first_name: firstName.trim(),
        attendee_last_name: lastName.trim(),
        attendee_email: email.trim(),
        guest_email: !isLoggedIn ? email.trim() : undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setJoinedMemberId(result.member_id ?? null)
      setJoined(true)
      router.refresh()
    })
  }

  const showJoinFormInline = isLoggedIn || showForm

  if (!showJoinFormInline) return null

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-4
      pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto
      md:static md:rounded-2xl md:border md:border-gray-200 md:shadow-sm md:p-5 md:max-h-none
    ">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-gray-900">Join this squad</p>
        {!isLoggedIn && (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleJoin} noValidate>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="join-first" className="block text-sm font-medium text-gray-700 mb-1">
              First name <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="join-first"
              type="text"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900
                         focus:border-[#4A90D9] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
              placeholder="Your first name"
            />
          </div>
          <div>
            <label htmlFor="join-last" className="block text-sm font-medium text-gray-700 mb-1">
              Last name <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="join-last"
              type="text"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900
                         focus:border-[#4A90D9] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
              placeholder="Your last name"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="join-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input
            id="join-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900
                       focus:border-[#4A90D9] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-12 rounded-xl bg-[#4A90D9] text-white font-semibold text-base
                     disabled:opacity-50 hover:bg-[#3478C5] transition-colors"
        >
          {isPending ? 'Joining…' : `Join Squad — ${formatPrice(pricePerSpotCents, currency)}`}
        </button>
      </form>
    </div>
  )
}
