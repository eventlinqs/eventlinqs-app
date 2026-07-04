'use client'

import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import type { ShareChannel } from '@/lib/broadcast/share-codes'

const CHANNEL_LABELS: Partial<Record<ShareChannel, string>> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  email: 'Email',
  sms: 'SMS',
  copy: 'Anywhere (copy link)',
  qr: 'Poster QR',
}

/**
 * The organiser share kit (SPEC 2.2/2.4): one tracked short link per
 * channel, each one tap to copy, plus the one-click A4 QR poster download.
 * Every link here is measured in the reach panel beside it.
 */
export function ShareKit({
  links,
  posterHref,
}: {
  links: { channel: ShareChannel; url: string }[]
  posterHref: string
}) {
  const [copiedChannel, setCopiedChannel] = useState<ShareChannel | null>(null)

  const onCopy = async (channel: ShareChannel, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedChannel(channel)
      window.setTimeout(() => setCopiedChannel((c) => (c === channel ? null : c)), 1800)
    } catch {
      // The row shows the URL; the organiser can select it by hand.
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">Share kit</h2>
          <p className="mt-1 text-sm text-ink-600">
            Each link is tracked per channel, so the numbers above show exactly where your
            buyers come from.
          </p>
        </div>
        <a
          href={posterHref}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download A4 QR poster
        </a>
      </div>
      <ul className="divide-y divide-ink-200/60">
        {links.map(({ channel, url }) => (
          <li key={channel} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">
                {CHANNEL_LABELS[channel] ?? channel}
              </p>
              <p className="truncate text-xs text-ink-600">{url}</p>
            </div>
            <button
              type="button"
              onClick={() => onCopy(channel, url)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100"
            >
              {copiedChannel === channel ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              <span>{copiedChannel === channel ? 'Copied' : 'Copy'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
