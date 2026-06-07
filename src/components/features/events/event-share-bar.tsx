'use client'

import { useState } from 'react'
import { Copy, Mail, Check } from 'lucide-react'

interface Props {
  eventTitle: string
  eventDate: string
  eventUrl: string
  variant?: 'dark' | 'light'
}

/**
 * EventShareBar - share controls for /events/[slug] (Batch 8.1).
 *
 * WhatsApp-first ordering per the Batch 8.1 brief. Cultural events
 * spread through WhatsApp share more than any other channel in the
 * EventLinqs target communities. The CTA labels stay short so the
 * row fits on a single line at 375 mobile.
 *
 * Order: WhatsApp > Facebook > X > Email > Copy link.
 * Each link uses the platform's standard share-intent URL so the
 * preview comes pre-populated with title + date + URL. Copy link
 * copies just the URL with a brief check-mark confirmation.
 */
export function EventShareBar({ eventTitle, eventDate, eventUrl, variant = 'light' }: Props) {
  const [copied, setCopied] = useState(false)

  const shareText = `${eventTitle} - ${eventDate}`
  const encodedText = encodeURIComponent(shareText)
  const encodedUrl = encodeURIComponent(eventUrl)

  // Background colours below are tuned for AA contrast against the
  // white text label that sits beside each icon. Vanilla WhatsApp /
  // Facebook brand greens / blues do not clear 4.5:1 with white at
  // 14px regular - we use each platform's darker brand variant so the
  // label stays readable, then revert to the canonical colour on
  // hover. The Email button switches to a dark text label on a light
  // surface for the same reason. axe-core 4.11 color-contrast clean.
  const emailTextClass = variant === 'dark' ? 'text-white' : 'text-[var(--text-primary)]'
  const links = [
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
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
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
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
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
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
      href: `mailto:?subject=${encodedText}&body=${encodedText}%20${encodedUrl}`,
      bg: variant === 'dark'
        ? 'bg-white/10 hover:bg-white/20 border border-white/30'
        : 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)] border border-[var(--surface-2)]',
      textClass: emailTextClass,
      icon: <Mail className="h-4 w-4" />,
    },
  ]

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore - the user can long-press the address bar
    }
  }

  const labelClass = variant === 'dark' ? 'text-white' : 'text-[var(--text-primary)]'

  return (
    <div className="flex flex-wrap items-center gap-2">
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
