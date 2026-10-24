'use client'

import { useCallback, useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/plausible'

/**
 * SHARE THE CITY GUIDE'S WEEK (WI2 Part 2). The phone's own share sheet where
 * it has one, the clipboard where it does not, the order WI1's walk-in share
 * uses (src/components/events/walk-in/walk-in-client.ts).
 *
 * COUNTED once the share happened (the sheet resolved, or the link was copied),
 * never on a dismissed sheet. WI1 counts a share as a row keyed by one event; a
 * city page is not an event, so it is counted through the platform's
 * consent-gated analytics instead (docs/walk-in/WI2-PLAN.md section 8a).
 */
export function FreeWeekShareButton({ url, title, citySlug }: { url: string; title: string; citySlug: string }) {
  const [copied, setCopied] = useState(false)

  const share = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        trackEvent('free_week_shared', { city: citySlug, channel: 'share_sheet' })
      } catch {
        // Dismissed by the person: nothing was shared and nothing is counted.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      trackEvent('free_week_shared', { city: citySlug, channel: 'clipboard' })
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // No clipboard either: the page's address bar still holds the link.
    }
  }, [url, title, citySlug])

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-ink-900 px-5 text-sm font-bold text-ink-900 transition-colors hover:bg-[var(--color-ink-100)]"
      aria-live="polite"
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
      {copied ? 'Link copied' : 'Share this week'}
    </button>
  )
}
