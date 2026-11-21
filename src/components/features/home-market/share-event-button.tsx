'use client'

import { useState } from 'react'
import { Check, Share } from 'lucide-react'
import { withShareSource } from '@/lib/growth/loops'
import { copyText } from '@/lib/share/copy-text'

/**
 * SHARE A NIGHT FROM ITS CARD (the design engine, section 2: "share (native share sheet, tracked link)"). The event page's
 * own link, marked as a share (withShareSource, the acquisition loop's source mark), handed to the phone's share sheet,
 * or copied where the browser has none, as the event page's share bar does (event-share-bar.tsx). Detection happens at
 * the tap, so the first render is the same on the server and in the browser.
 */
export function ShareEventButton({ title, href, className = '' }: { title: string; href: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const onShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = withShareSource(new URL(href, window.location.origin).toString())
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
      } catch {
        // the sheet was dismissed: nothing to do
      }
      return
    }
    try {
      await copyText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // the address bar still holds the page
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={onShare}
        aria-label={`Share ${title}`}
        className={`save-event-btn save-event-btn-light shadow-[var(--shadow-card)] text-ink-900 ${className}`}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share className="h-4 w-4" aria-hidden />}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  )
}
