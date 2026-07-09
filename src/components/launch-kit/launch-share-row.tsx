'use client'

import { useState } from 'react'
import { Check, Copy, Mail } from 'lucide-react'
import type { ShareChannel } from '@/lib/broadcast/share-codes'

/**
 * LaunchShareRow - one-tap tracked sharing for the Launch Kit.
 *
 * Every button opens the platform's standard share intent carrying the
 * organiser's TRACKED short link for that exact channel, so every click and
 * sale it drives lands in the reach panel attributed to the right channel.
 * Instagram has no web share intent, so its button copies the tracked link
 * with a hint; Copy link copies the general-purpose tracked link.
 *
 * Channel button colours are the darker AA-contrast brand variants used by
 * EventShareBar (the platform's share-colour source of truth).
 */

interface Props {
  links: Partial<Record<ShareChannel, string>>
  shareText: string
}

export function LaunchShareRow({ links, shareText }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const encodedText = encodeURIComponent(shareText)

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(c => (c === key ? null : c)), 1800)
    } catch {
      // The reach panel lists every link with its own copy control as backup.
    }
  }

  const intents: {
    key: ShareChannel
    label: string
    bg: string
    textClass: string
    icon: React.ReactNode
    href?: (url: string) => string
  }[] = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      bg: 'bg-[#075E54] hover:bg-[#128C7E]',
      textClass: 'text-white',
      href: url => `https://wa.me/?text=${encodedText}%20${encodeURIComponent(url)}`,
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.027 22.001c-1.946 0-3.79-.61-5.342-1.738L4 21l1.766-2.605C4.633 16.85 4 14.974 4 13c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8c-.005 0-.001 0 .027 1.001zm9.973-9.001C22 6.477 17.523 2 12 2S2 6.477 2 12c0 1.892.526 3.66 1.438 5.168L2 22l4.962-1.452C8.428 21.476 10.16 22 12 22h.001c5.523 0 9.999-4.477 9.999-10z" />
        </svg>
      ),
    },
    {
      key: 'instagram',
      label: 'Instagram',
      bg: 'bg-[#B32E87] hover:bg-[#9A2773]',
      textClass: 'text-white',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      ),
    },
    {
      key: 'facebook',
      label: 'Facebook',
      bg: 'bg-[#0C5DCF] hover:bg-[#0A4FAB]',
      textClass: 'text-white',
      href: url => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      key: 'x',
      label: 'X',
      bg: 'bg-black hover:bg-neutral-800',
      textClass: 'text-white',
      href: url => `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodeURIComponent(url)}`,
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      bg: 'bg-[#00568C] hover:bg-[#004a78]',
      textClass: 'text-white',
      href: url => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
        </svg>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      bg: 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)] border border-[var(--surface-2)]',
      textClass: 'text-[var(--text-primary)]',
      href: url => `mailto:?subject=${encodedText}&body=${encodedText}%20${encodeURIComponent(url)}`,
      icon: <Mail className="h-4 w-4" aria-hidden />,
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {intents.map(intent => {
        const url = links[intent.key]
        if (!url) return null
        if (!intent.href) {
          // Copy-based channel (Instagram): the link goes to the clipboard,
          // ready to paste into a story, bio, or DM.
          return (
            <button
              key={intent.key}
              type="button"
              onClick={() => copy(intent.key, url)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 ${intent.bg} ${intent.textClass}`}
            >
              {copiedKey === intent.key ? <Check className="h-4 w-4" aria-hidden /> : intent.icon}
              <span className="hidden sm:inline">
                {copiedKey === intent.key ? 'Link copied' : intent.label}
              </span>
              <span className="sm:hidden">{copiedKey === intent.key ? 'Copied' : intent.label}</span>
            </button>
          )
        }
        return (
          <a
            key={intent.key}
            href={intent.href(url)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Share via ${intent.label}`}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 ${intent.bg} ${intent.textClass}`}
          >
            {intent.icon}
            <span>{intent.label}</span>
          </a>
        )
      })}
      {links.copy && (
        <button
          type="button"
          onClick={() => copy('copy', links.copy!)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)]"
        >
          {copiedKey === 'copy' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <span>{copiedKey === 'copy' ? 'Copied' : 'Copy link'}</span>
        </button>
      )}
    </div>
  )
}
