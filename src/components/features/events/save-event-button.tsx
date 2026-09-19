'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trackSaveEvent } from '@/lib/analytics/plausible'

type Variant = 'dark' | 'light'

export function SaveEventButton({
  eventId,
  initiallySaved = false,
  variant = 'dark',
  className = '',
}: {
  eventId: string
  initiallySaved?: boolean
  variant?: Variant
  className?: string
}) {
  const [saved, setSaved] = useState(initiallySaved)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const base = variant === 'dark' ? 'save-event-btn-dark' : 'save-event-btn-light'

  const savedState = saved ? 'bg-gold-500 border-gold-500 text-ink-900' : ''

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Dynamic import keeps Supabase out of every public-route bundle.
    // Cost is paid on first heart-button interaction, not on /events shell load.
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    const nextSaved = !saved
    setSaved(nextSaved)

    startTransition(async () => {
      const { error } = nextSaved
        ? await supabase.from('saved_events').insert({ event_id: eventId, user_id: session.user.id })
        : await supabase.from('saved_events').delete().eq('event_id', eventId).eq('user_id', session.user.id)
      if (error) {
        setSaved(!nextSaved)
        return
      }
      if (nextSaved) {
        trackSaveEvent({ event_id: eventId })
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={saved ? 'Remove from saved' : 'Save event'}
      aria-pressed={saved}
      disabled={isPending}
      /* The 122 shared characters are `save-event-btn` in globals.css
       * (close-out C8B.3, 19 September 2026). This control renders inside
       * every browse card, so the list was written out once per card in the
       * markup and again in the RSC payload. Only the two things that differ
       * - the variant colour and the saved state - stay here. */
      className={`save-event-btn ${base} ${savedState} ${className}`}
    >
      <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
    </button>
  )
}
