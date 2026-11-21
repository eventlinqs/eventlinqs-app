'use client'

import { useCallback, useState } from 'react'
import { Share2, Check, Link2 } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/plausible'
import { copyText } from '@/lib/share/copy-text'

/**
 * SHARE THE NEWSLETTER (/newsletter/refer). The phone's own share sheet where it has one, the clipboard where it does
 * not, the order the city guide's week share uses (src/components/features/listings/free-week-share-button.tsx).
 * Counted once the share happened (the sheet resolved, or the link was copied), never on a dismissed sheet, through the
 * platform's consent gated analytics. The link carries its source as UTM, so a friend who joins is attributed to a
 * share without a record of who shared.
 */
export function NewsletterShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await copyText(url)
      setCopied(true)
      trackEvent('newsletter_shared', { channel: 'clipboard' })
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // No clipboard: the link stays printed beside the button for the person to copy by hand.
    }
  }, [url])

  const share = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'The EventLinqs newsletter', text: "Your city's best events, twice a week.", url })
        trackEvent('newsletter_shared', { channel: 'share_sheet' })
      } catch {
        // Dismissed by the person: nothing was shared and nothing is counted.
      }
      return
    }
    await copy()
  }, [url, copy])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={share}
        data-newsletter-share
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] transition hover:bg-[var(--brand-accent-strong)]"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share the newsletter
      </button>
      <button
        type="button"
        onClick={copy}
        data-newsletter-copy
        aria-live="polite"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-[1.5px] border-ink-900 px-5 text-sm font-bold text-ink-900 transition-colors hover:bg-[var(--color-ink-100)]"
      >
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  )
}
