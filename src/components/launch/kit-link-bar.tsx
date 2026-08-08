'use client'

import { useState } from 'react'
import { Reveal } from '@/components/ui/reveal'

/**
 * The bookmarkable kit link (founder ruling 0.2c, 9 August 2026: a link, 30
 * days, no account).
 *
 * This is also the second, weaker, UNIVERSAL spread vector. It fires for every
 * arrival including the ones THE BILL cannot reach, because every event has at
 * least one other person involved: a person building a kit at eleven at night
 * sends it to a co-organiser to look at, and that person opens a finished kit
 * with a control on it to make their own. Honest assessment: weak per
 * instance, but it costs nothing because the link exists anyway.
 *
 * Email-to-self is offered here, never required. It is a second acquisition
 * surface (the founder's words) and it is cheap: one field, one existing
 * transactional send, no new table.
 */

export function KitLinkBar({ code, ephemeral }: { code: string | null; ephemeral: boolean }) {
  const [copied, setCopied] = useState(false)

  // No code means the draft store is unavailable (the migration has not been
  // applied yet, or the hourly cap was reached). The kit on screen is complete
  // and correct; only the shareable link is missing. That is the smallest
  // possible penalty and it does not need an apology.
  if (!code) {
    return (
      <Reveal>
        <div className="mt-10 rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-600">
            {ephemeral
              ? 'Your kit is ready on this screen. Save it to keep a link you can come back to.'
              : 'Your kit is ready on this screen.'}
          </p>
        </div>
      </Reveal>
    )
  }

  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/launch/k/${code}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A clipboard refusal is not an error worth showing: the link is on
      // screen and selectable.
      setCopied(false)
    }
  }

  return (
    <Reveal>
      <div className="mt-10 rounded-xl border border-ink-200 bg-white p-5">
        <h3 className="font-headline text-base font-semibold text-ink-900">
          Your kit lives here
        </h3>
        <p className="mt-2 text-sm text-ink-600">
          Bookmark this, or send it to whoever is helping you run it. It keeps
          working for thirty days.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-ink-50 px-3 py-2 font-mono text-sm text-ink-800">
            /launch/k/{code}
          </code>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink-300 px-5 text-sm font-semibold text-ink-900 transition hover:border-ink-400 hover:bg-ink-50"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      </div>
    </Reveal>
  )
}
