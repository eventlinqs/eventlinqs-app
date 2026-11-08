'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus } from 'lucide-react'
import {
  getFollowState,
  toggleFollowOrganiser,
  toggleFollowArtist,
  toggleFollowScene,
  toggleFollowVenue,
  type FollowResult,
} from '@/app/actions/follow'

type FollowType = 'organiser' | 'artist' | 'subgenre' | 'venue'
type Variant = 'solid' | 'outline'

/**
 * <FollowButton> - the shared follow control for the Attendee Demand Graph.
 *
 * Modelled on SaveEventButton: it resolves its own follow-state on mount via a
 * server action (so the host page never has to go dynamic - a public ISR page
 * stays ISR, the button hydrates and asks for state client-side), then toggles
 * optimistically and reconciles with the server result. Anonymous users are
 * sent to /login?redirect=<current path>, exactly like SaveEventButton, never a
 * silent no-op.
 *
 * Accessible: a real <button> with aria-pressed reflecting the follow state and
 * an h-11 (44px) minimum target. Inherits the existing button token language
 * (navy / gold) - no new colour or size primitive.
 */
export function FollowButton({
  type,
  id,
  label = 'Follow',
  variant = 'solid',
  className = '',
  fromEventId,
  compactLabel,
}: {
  type: FollowType
  /** organisation id (organiser), artist id (artist), or scene slug (subgenre). */
  id: string
  /** The noun shown beside the verb is omitted; copy stays "Follow"/"Following". */
  label?: string
  variant?: Variant
  className?: string
  /** WI1. The event page this button sits on, so a follow counts on that event. */
  fromEventId?: string
  /**
   * WI1. A shorter visible label below lg, where locked design A's phone board
   * draws plain "Follow" beside a long organiser name. The accessible name stays
   * `label`, which contains it (WCAG 2.5.3, label in name).
   */
  compactLabel?: string
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(false)
  // TAPPABLE FROM FIRST PAINT (every-tap on live, 3 November 2026, 22:20: 'Follow AMCF: DEAD TAP'): the button used to be
  // disabled until the follow state below came back, 2.1 to 2.8 s after load on live, looking enabled all the while.
  // Now a tap always answers at once: signed out (known from that read) it says so and opens sign in; otherwise the
  // optimistic flip shows, and the server's answer settles it.
  const [signedOut, setSignedOut] = useState(false)
  const [toSignIn, setToSignIn] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Resolve current follow-state on mount. requiresAuth (anonymous) simply
  // leaves the button in the "Follow" state - the click handler sends them to
  // login. A real network/db error also leaves the default, never a broken UI.
  useEffect(() => {
    let active = true
    getFollowState({ type, id })
      .then((res: FollowResult) => {
        if (!active) return
        setFollowing(Boolean(res.following))
        setSignedOut(res.requiresAuth === true)
      })
      .catch((error: unknown) => {
        // The default stands (Follow); the tap then asks the server itself, so nothing here is guessed.
        console.warn('[follow] the follow state could not be read:', error instanceof Error ? error.message : error)
      })
    return () => {
      active = false
    }
  }, [type, id])

  const runToggle = async (): Promise<FollowResult> => {
    if (type === 'organiser') return toggleFollowOrganiser(id, fromEventId)
    if (type === 'artist') return toggleFollowArtist(id)
    if (type === 'venue') return toggleFollowVenue(id)
    return toggleFollowScene(id)
  }

  const toLogin = () => {
    setToSignIn(true)
    const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
    router.push(`/login?redirect=${encodeURIComponent(path)}`)
  }

  const handleClick = () => {
    if (isPending || toSignIn) return
    if (signedOut) {
      toLogin()
      return
    }
    const next = !following
    setFollowing(next) // optimistic

    startTransition(async () => {
      const res = await runToggle()
      if (res.requiresAuth) {
        setFollowing(false)
        toLogin()
        return
      }
      // Settle on the server truth (covers the error rollback too).
      setFollowing(Boolean(res.following))
    })
  }

  const base =
    'inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold ' +
    'transition-[transform,box-shadow,background-color,border-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed'

  // Following = solid gold confirmation; not-following = navy solid or outline.
  const followingState =
    'border border-[var(--color-gold-400)] bg-[var(--color-gold-400)] text-[var(--color-ink-900)] hover:brightness-105'

  const idleSolid =
    'border border-[var(--color-ink-900)] bg-[var(--color-ink-900)] text-white hover:bg-[var(--color-navy-950)]'
  const idleOutline =
    'border border-[var(--surface-2)] bg-[var(--surface-0)] text-[var(--text-primary)] hover:border-[var(--brand-accent)]/50'

  const idle = variant === 'outline' ? idleOutline : idleSolid
  const state = following ? followingState : idle

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={following}
      aria-label={toSignIn ? 'Sign in to follow' : following ? `Following. ${label} again to unfollow.` : label}
      disabled={isPending}
      className={`${base} ${state} ${className}`}
    >
      {toSignIn ? (
        <>Sign in to follow</>
      ) : following ? (
        <>
          <Check className="h-4 w-4" aria-hidden />
          Following
        </>
      ) : (
        <>
          <Plus className="h-4 w-4" aria-hidden />
          {compactLabel ? (
            <>
              <span className="lg:hidden">{compactLabel}</span>
              <span className="hidden lg:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </>
      )}
    </button>
  )
}
