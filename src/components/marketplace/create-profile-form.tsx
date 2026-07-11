'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOwnArtistProfileAction } from '@/app/actions/showcase'

/** Self-serve performer profile creation: the marketplace on-ramp. */
export function CreateProfileForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          const res = await createOwnArtistProfileAction({ name })
          if (res.ok) router.refresh()
          else setError(res.error ?? 'Could not create your profile.')
        })
      }}
      className="mt-6 space-y-3 rounded-xl border border-ink-200 bg-white p-6"
    >
      <label htmlFor="perf-name" className="block text-sm font-semibold text-ink-900">
        Your performer name
      </label>
      <input
        id="perf-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={2}
        maxLength={120}
        placeholder="The name on the poster"
        className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Creating' : 'Create my performer profile'}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
    </form>
  )
}
