'use client'

import { useCallback, useRef, useState } from 'react'
import type { AuthResponse } from '@supabase/supabase-js'
import { JoinWaitlistModal } from './join-waitlist-modal'

interface Props {
  eventId: string
  tierId: string
  tierName: string
  maxPerOrder: number
}

export function JoinWaitlistButton({ eventId, tierId, tierName, maxPerOrder }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const identityStarted = useRef(false)

  /**
   * Resolve who is signed in, at most once, and never before someone shows an
   * intent to use this control.
   *
   * WHY NOT ON MOUNT. This used to run in a `useEffect`, so every sold-out tier
   * on an event page pulled the Supabase browser client the moment the page
   * hydrated. Measured on the preview: 54,778 bytes of script, downloaded on a
   * page where the value it fetches is not rendered anywhere - the only thing
   * `userEmail` feeds is a "notifications will be sent to..." line INSIDE the
   * modal, which is closed. That one chunk is what pushed the event-detail
   * route past its 491,520-byte script budget; without it the same page
   * measures 479,906.
   *
   * WHY INTENT AND NOT JUST CLICK. Firing only on click would put a network
   * fetch between the tap and the modal. Pointer-enter, focus and touch-start
   * all start it early enough that it has normally resolved by the time the
   * modal renders, and the click path starts it too so a synthetic or
   * programmatic click is never left without it. A late answer is harmless:
   * `userEmail` is read from props on every render, so the line appears when it
   * arrives rather than being missed.
   */
  const resolveIdentity = useCallback(() => {
    if (identityStarted.current) return
    identityStarted.current = true
    import('@/lib/supabase/client')
      .then(({ createClient }) => createClient().auth.getUser())
      .then((res: AuthResponse) => setUserEmail(res.data.user?.email ?? null))
      .catch(() => {
        // Best-effort personalisation. A blocked chunk or a failed auth call
        // must not stop anyone joining a waitlist, so the modal opens either
        // way and simply does not name an address.
      })
  }, [])

  return (
    <>
      <button
        type="button"
        onPointerEnter={resolveIdentity}
        onFocus={resolveIdentity}
        onTouchStart={resolveIdentity}
        onClick={() => {
          resolveIdentity()
          setIsModalOpen(true)
        }}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 min-h-[44px]"
        aria-label={`Join waitlist for ${tierName}`}
      >
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Join Waitlist
      </button>

      <JoinWaitlistModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        eventId={eventId}
        tierId={tierId}
        tierName={tierName}
        maxPerOrder={maxPerOrder}
        userEmail={userEmail}
      />
    </>
  )
}
