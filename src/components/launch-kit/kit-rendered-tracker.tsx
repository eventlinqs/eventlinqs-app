'use client'

import { useEffect, useRef } from 'react'
import { trackKitRendered } from '@/lib/analytics/plausible'

/**
 * Fires the kit_rendered activation metric once per mount of the live Launch
 * Kit screen. just_published distinguishes the delivery moment (arriving from
 * publish) from a return visit, so the activation funnel reads cleanly.
 */
export function KitRenderedTracker({
  eventId,
  justPublished,
}: {
  eventId: string
  justPublished: boolean
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackKitRendered({ event_id: eventId, just_published: justPublished ? 1 : 0 })
  }, [eventId, justPublished])
  return null
}
