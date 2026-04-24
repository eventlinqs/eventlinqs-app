'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { useRouter } from 'next/navigation'

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

  const base = variant === 'dark'
    ? 'bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white/30'
    : 'bg-white/95 text-ink-700 hover:text-coral-500'

  const savedState = saved ? 'bg-gold-500 border-gold-500 text-ink-900' : ''

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

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
      if (error) setSaved(!nextSaved)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={saved ? 'Remove from saved' : 'Save event'}
      aria-pressed={saved}
      disabled={isPending}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 ${base} ${savedState} ${className}`}
    >
      <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
    </button>
  )
}
