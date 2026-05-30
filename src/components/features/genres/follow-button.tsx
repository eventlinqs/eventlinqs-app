'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toggleFollow, type FollowableType } from '@/app/actions/follows'

interface FollowButtonProps {
  type: FollowableType
  id: string
  /** What is being followed, e.g. "Techno" or an artist name. Used in labels. */
  name: string
}

/**
 * Follow/unfollow toggle for an artist or a sub-genre. Resolves the current
 * user's follow state on mount via the browser client (RLS scopes follows to
 * the user), so the host page can stay statically rendered. Optimistic, reverts
 * on error, and refreshes the route after a successful change.
 * Token-only styling, 44px touch target.
 */
export function FollowButton({ type, id, name }: FollowButtonProps) {
  const router = useRouter()
  const [following, setFollowing] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    const supabase = createClient()

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (active) setReady(true)
        return
      }
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('followable_type', type)
        .eq('followable_id', id)
        .maybeSingle()
      if (!active) return
      setFollowing(Boolean(data))
      setReady(true)
    }

    void load()
    return () => {
      active = false
    }
  }, [type, id])

  function onClick() {
    setError(null)
    const optimistic = !following
    setFollowing(optimistic)
    startTransition(async () => {
      const result = await toggleFollow(type, id)
      if (result.error) {
        setFollowing(!optimistic)
        setError(result.error)
        return
      }
      if (typeof result.following === 'boolean') {
        setFollowing(result.following)
      }
      router.refresh()
    })
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending || !ready}
        aria-pressed={following}
        aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
        className={
          following
            ? 'inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg border border-ink-200 bg-white text-ink-900 font-medium transition-colors hover:bg-ink-100 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-50'
            : 'inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-[var(--color-navy-950)] text-white font-medium transition-colors hover:bg-ink-800 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-50'
        }
      >
        {following ? 'Following' : 'Follow'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
