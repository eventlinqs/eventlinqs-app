'use client'

import { useState } from 'react'

/* The two press styles of /admin/social (its BUTTON and QUIET), so the admin presses read as one system. */
const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET =
  'inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white'

/**
 * One held message in Lawal's daily queue: copy it, open where it goes in its own app, send it there by hand, then press
 * Sent (a plain server-action form, ./actions.ts markSentAction). Copying is the only thing done in the browser.
 */
export function DailyQueueItem({
  touchId,
  body,
  openHref,
  openLabel,
  action,
}: {
  touchId: string
  body: string
  openHref: string
  openLabel: string
  action: (formData: FormData) => Promise<void>
}) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no')
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={QUIET}
        onClick={() => {
          navigator.clipboard.writeText(body).then(
            () => setCopied('yes'),
            () => setCopied('failed'),
          )
        }}
      >
        {copied === 'yes' ? 'Copied' : 'Copy message'}
      </button>
      <a
        href={openHref}
        target="_blank"
        rel="noopener noreferrer"
        className={QUIET}
      >
        {openLabel}
      </a>
      <form action={action}>
        <input type="hidden" name="touch" value={touchId} />
        <button type="submit" className={BUTTON}>
          Sent
        </button>
      </form>
      {copied === 'failed' && <p className="w-full text-xs text-white/60">This browser would not copy it. Select the message above and copy it by hand.</p>}
    </div>
  )
}
