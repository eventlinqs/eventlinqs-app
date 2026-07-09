'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * The Launch Kit's copy control. The visible "Copy link" / "Copied" text is
 * the accessible name (WCAG 2.5.3 label-in-name), and the toggle doubles as
 * the success confirmation.
 */
export function CopyLinkButton({
  url,
  label = 'Copy link',
  variant = 'light',
}: {
  url: string
  label?: string
  variant?: 'light' | 'dark'
}) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // The URL is visible beside the button; the organiser can select it.
    }
  }

  const styles =
    variant === 'dark'
      ? 'border border-white/30 bg-white/10 text-white hover:border-[var(--brand-accent)] hover:bg-white/15'
      : 'border border-ink-200 bg-white text-ink-900 hover:border-[var(--brand-accent-strong)] hover:bg-ink-50'

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 ${styles}`}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}
