'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, Share2 } from 'lucide-react'

/**
 * StickyActionBar — appears after scrolling past the event hero.
 *
 * Glassmorphism bar pinned to viewport top. Shows compact event title,
 * date, venue, price range and a primary "Get tickets" action that scrolls
 * to the ticket selector by anchor.
 */

interface Props {
  title: string
  dateLabel: string
  venueLabel: string | null
  priceLabel: string | null
  /** CSS selector to smooth-scroll to when CTA is clicked. */
  ticketAnchor?: string
  /** Pixels past which the bar reveals. */
  threshold?: number
  /** Share URL (copied to clipboard when share tapped). */
  shareUrl: string
}

export function StickyActionBar({
  title,
  dateLabel,
  venueLabel,
  priceLabel,
  ticketAnchor = '#tickets',
  threshold = 420,
  shareUrl,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState(false)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setShared(true)
        setTimeout(() => setShared(false), 1600)
      }
    } catch {
      // user cancelled share
    }
  }

  const handleTicketsClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.querySelector(ticketAnchor)
    if (el) {
      e.preventDefault()
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className="border-b border-ink-900/10 bg-white/85 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold leading-tight text-ink-900 line-clamp-1">
              {title}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400 line-clamp-1">
              {dateLabel}
              {venueLabel ? ` · ${venueLabel}` : ''}
            </p>
          </div>

          <div className="hidden md:flex md:items-center md:gap-3">
            {priceLabel && (
              <span className="font-display text-sm font-bold text-gold-600">{priceLabel}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share event"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 transition-colors hover:border-gold-400 hover:text-gold-600"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSaved(s => !s)}
              aria-label={saved ? 'Remove from saved' : 'Save event'}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                saved
                  ? 'border-gold-500 bg-gold-500/15 text-gold-600'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-gold-400 hover:text-gold-600'
              }`}
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-gold-500' : ''}`} />
            </button>
            <Link
              href={ticketAnchor}
              onClick={handleTicketsClick}
              className="inline-flex items-center rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-gold-600 hover:-translate-y-0.5"
            >
              Get tickets
            </Link>
          </div>
        </div>
        {shared && (
          <p className="mx-auto max-w-7xl px-4 pb-1 text-[11px] text-gold-600 sm:px-6 lg:px-8">
            Link copied to clipboard
          </p>
        )}
      </div>
    </div>
  )
}
