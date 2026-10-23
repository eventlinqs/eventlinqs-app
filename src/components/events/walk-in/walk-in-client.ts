'use client'

import { useCallback, useEffect, useState } from 'react'
import { withShareSource } from '@/lib/growth/loops'
import { reportClientError } from '@/lib/observability/client-error-report'

/**
 * The two things a walk-in page's buttons do in the browser (WI1).
 *
 * COUNT: an add to calendar and a share are recorded as anonymous demand rows
 * on the event through the same beacon a page view uses, so the organiser's
 * numbers come from the slot ledger and nowhere else. `keepalive` lets the row
 * leave even when the click navigates away (the Google Calendar link).
 *
 * SHARE: a tracked short link where the platform can mint one, the page itself
 * where it cannot, through the phone's own share sheet or the clipboard. The
 * same order EventShareBar uses, so a walk-in share is attributed the same way.
 */
export function countOnEvent(eventId: string, action: 'calendar_add' | 'share'): void {
  try {
    void fetch('/api/ledger/demand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId, action }),
      keepalive: true,
    }).catch((error) => {
      reportClientError(error, { where: 'walk-in:count-fetch', eventId, action })
    })
  } catch (error) {
    // A count that cannot leave is a count lost, never a broken button. It is
    // still said: these rows are the organiser's only numbers for a free event.
    reportClientError(error, { where: 'walk-in:count', eventId, action })
  }
}

export function useWalkInShare({
  eventId,
  eventSlug,
  eventTitle,
  eventUrl,
}: {
  eventId: string
  eventSlug: string
  eventTitle: string
  eventUrl: string
}) {
  const [tracked, setTracked] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/broadcast/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Only the channel this button uses: the phone's share sheet or the clipboard.
      body: JSON.stringify({ slug: eventSlug, channels: ['native'] }),
    })
      .then((r) => (r.ok ? r.json() : { links: null }))
      .then((d: { links: Partial<Record<string, string>> | null }) => {
        if (active && d?.links?.native) setTracked(d.links.native)
      })
      .catch((error) => {
        // Sharing still works with the page's own address; the miss is said.
        reportClientError(error, { where: 'walk-in:share-link-mint', eventSlug })
      })
    return () => {
      active = false
    }
  }, [eventSlug])

  // Counted only once the share happened: the sheet resolved, or the link was
  // copied. A dismissed sheet is not a share, and these rows are the figure the
  // WI1 reversal condition is judged on, so a press is never counted as one.
  const share = useCallback(async () => {
    const url = withShareSource(tracked ?? eventUrl)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: eventTitle, url })
        countOnEvent(eventId, 'share')
        return
      } catch (error) {
        // Dismissed by the person: nothing was shared and nothing is counted.
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Any other refusal (a browser that offers the sheet and then cannot
        // open it) falls through to copying the link, so the button still works.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      countOnEvent(eventId, 'share')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // The address bar still holds the link.
    }
  }, [eventId, eventTitle, eventUrl, tracked])

  return { share, copied }
}
