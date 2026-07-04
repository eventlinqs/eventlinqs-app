'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { claimArtistInviteAction } from '@/app/actions/lineup'

/** The one deliberate press that claims a guest-performer invite. */
export function ClaimInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const claim = () => {
    setError(null)
    startTransition(async () => {
      const res = await claimArtistInviteAction(token)
      if (res.ok) {
        router.replace('/artist/dashboard?claimed=1')
      } else {
        setError(res.error ?? 'Could not claim the invite.')
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={claim}
        disabled={isPending}
        className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Claiming' : 'Claim your artist profile'}
      </button>
      {error && (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
