'use client'

import { useEffect, useState } from 'react'
import { Copy, Mail, Check, Share2 } from 'lucide-react'
import { buildAttributedUrl } from '@/lib/growth/referrals'
import type { ShareChannel } from '@/lib/broadcast/share-codes'

interface Props {
  eventTitle: string
  eventDate: string
  eventUrl: string
  /** Event slug for tracked short-link minting (Broadcast Layer 2.3). */
  eventSlug?: string
  variant?: 'dark' | 'light'
}

/**
 * EventShareBar - share controls for /events/[slug] (Batch 8.1, upgraded by
 * the Broadcast Layer SPEC 2.2/2.3).
 *
 * WhatsApp-first ordering per the Batch 8.1 brief. Community events
 * spread through WhatsApp share more than any other channel in the
 * EventLinqs target communities. The CTA labels stay short so the
 * row fits on a single line at 375 mobile.
 *
 * Order: Share (native, when available) > WhatsApp > Facebook > X > Email >
 * Copy link.
 *
 * Every channel shares a TRACKED short link (/s/[code], one per channel)
 * minted post-paint through /api/broadcast/share-link, so the organiser's
 * reach panel can show clicks and sales by channel. When minting fails or
 * the broadcast_share flag is off, each channel falls back to the
 * attributed long URL: sharing never breaks. The signed-in sharer's
 * personalised referral code rides the fallback URL exactly as before.
 */
export function EventShareBar({ eventTitle, eventDate, eventUrl, eventSlug, variant = 'light' }: Props) {
  const [copied, setCopied] = useState(false)
  const [sharedNative, setSharedNative] = useState(false)

  // Fallback: the attributed long URL (source = share-a-ticket), upgraded
  // with the signed-in user's referral code post-paint.
  const [fallbackUrl, setFallbackUrl] = useState(() =>
    buildAttributedUrl(eventUrl, { source: 'share-a-ticket' }),
  )
  // Tracked short links per channel, minted post-paint.
  const [trackedLinks, setTrackedLinks] = useState<Partial<Record<ShareChannel, string>>>({})

  useEffect(() => {
    let active = true
    fetch('/api/me/ref')
      .then((r) => (r.ok ? r.json() : { refCode: null }))
      .then((d: { refCode: string | null }) => {
        if (active && d?.refCode) {
          setFallbackUrl(buildAttributedUrl(eventUrl, { refCode: d.refCode, source: 'share-a-ticket' }))
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [eventUrl])

  useEffect(() => {
    if (!eventSlug) return
    let active = true
    fetch('/api/broadcast/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: eventSlug }),
    })
      .then((r) => (r.ok ? r.json() : { links: null }))
      .then((d: { links: Partial<Record<ShareChannel, string>> | null }) => {
        if (active && d?.links) setTrackedLinks(d.links)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [eventSlug])

  const urlFor = (channel: ShareChannel): string => trackedLinks[channel] ?? fallbackUrl

  const shareText = `${eventTitle} - ${eventDate}`
  const encodedText = encodeURIComponent(shareText)

  // Background colours below are tuned for AA contrast against the
  // white text label that sits beside each icon. Vanilla WhatsApp /
  // Facebook brand greens / blues do not clear 4.5:1 with white at
  // 14px regular - we use each platform's darker brand variant so the
  // label stays readable, then revert to the canonical colour on
  // hover. The Email button switches to a dark text label on a light
  // surface for the same reason. axe-core 4.11 color-contrast clean.
  const emailTextClass = variant === 'dark' ? 'text-white' : 'text-[var(--text-primary)]'
  const links: { label: string; channel: ShareChannel; href: string; bg: string; textClass: string; icon: React.ReactNode }[] = [
    {
      label: 'WhatsApp',
      channel: 'whatsapp',
      href: `https://wa.me/?text=${encodedText}%20${encodeURIComponent(urlFor('whatsapp'))}`,
      bg: 'bg-[#075E54] hover:bg-[#128C7E]',
      textClass: 'text-white',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.027 22.001c-1.946 0-3.79-.61-5.342-1.738L4 21l1.766-2.605C4.633 16.85 4 14.974 4 13c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8c-.005 0-.001 0 .027 1.001zm9.973-9.001C22 6.477 17.523 2 12 2S2 6.477 2 12c0 1.892.526 3.66 1.438 5.168L2 22l4.962-1.452C8.428 21.476 10.16 22 12 22h.001c5.523 0 9.999-4.477 9.999-10z"/>
        </svg>
      ),
    },
    {
      label: 'Facebook',
      channel: 'facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlFor('facebook'))}`,
      bg: 'bg-[#0C5DCF] hover:bg-[#0A4FAB]',
      textClass: 'text-white',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
    {
      label: 'X',
      channel: 'x',
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodeURIComponent(urlFor('x'))}`,
      bg: 'bg-black hover:bg-neutral-800',
      textClass: 'text-white',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
    },
    {
      label: 'Email',
      channel: 'email',
      href: `mailto:?subject=${encodedText}&body=${encodedText}%20${encodeURIComponent(urlFor('email'))}`,
      bg: variant === 'dark'
        ? 'bg-white/10 hover:bg-white/20 border border-white/30'
        : 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)] border border-[var(--surface-2)]',
      textClass: emailTextClass,
      icon: <Mail className="h-4 w-4" />,
    },
  ]

  // Native share sheet when the platform has one (the mobile PWA case per
  // SPEC 2.2), clipboard fallback otherwise. Detection happens at click time,
  // the house pattern (see ConfirmationActions), so no effect state is
  // needed and hydration stays deterministic.
  const onNativeShare = async () => {
    const url = urlFor('native')
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: eventTitle, text: shareText, url })
      } catch {
        // Dismissed the sheet - nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setSharedNative(true)
      window.setTimeout(() => setSharedNative(false), 1800)
    } catch {
      // ignore - the user can long-press the address bar
    }
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(urlFor('copy'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore - the user can long-press the address bar
    }
  }

  const labelClass = variant === 'dark' ? 'text-white' : 'text-[var(--text-primary)]'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onNativeShare}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-transparent bg-[var(--color-ink-900)] px-4 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent)]"
      >
        {sharedNative ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        <span>{sharedNative ? 'Copied' : 'Share'}</span>
      </button>
      {links.map(l => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share via ${l.label}`}
          className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all hover:-translate-y-0.5 ${l.bg} ${l.textClass}`}
        >
          {l.icon}
          <span className="hidden sm:inline">{l.label}</span>
        </a>
      ))}
      {/* No aria-label here: visible "Copy link" / "Copied" text IS
       *  the accessible name. WCAG SC 2.5.3 (label-in-name) requires
       *  the visible text to appear inside the accessible name in
       *  order; the previous "Copy event link" aria-label broke the
       *  rule because "event" wasn't visible. The toggling text
       *  doubles as the success confirmation. */}
      <button
        type="button"
        onClick={onCopy}
        className={`inline-flex h-11 items-center gap-2 rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-4 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)] ${labelClass}`}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span>{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  )
}
