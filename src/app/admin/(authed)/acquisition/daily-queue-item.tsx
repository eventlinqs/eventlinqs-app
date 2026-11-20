'use client'

import { useState } from 'react'
import { copyText } from '@/lib/share/copy-text'
import { FIRST_LETTER_MANUAL_ON } from '@/lib/outreach/first-letter-flags'

/* The two press styles of /admin/social (its BUTTON and QUIET), so the admin presses read as one system. */
const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET =
  'inline-flex min-h-[44px] items-center rounded-full border border-[var(--admin-line)] px-5 text-sm font-semibold text-[var(--admin-soft)] hover:border-[var(--admin-line-strong)] hover:text-[var(--admin-ink)]'

/**
 * One held message in Lawal's daily queue: copy it, open where it goes in its own app, send it there by hand, then press
 * Sent with the tick that their page says nothing against messages (a plain server-action form, ./actions.ts
 * markSentAction). Copying is the only thing done in the browser.
 */
export function DailyQueueItem({
  touchId,
  contentHash,
  policyVersion,
  body,
  openHref,
  openLabel,
  action,
  from,
  firstLetter,
  sendAction,
}: {
  /**
   * A first letter is sent by the Send press (train AK; law 30: never by hand in Outlook); its Open and Sent controls
   * stay behind FIRST_LETTER_MANUAL_ON. Any other message keeps them.
   */
  firstLetter?: boolean
  sendAction?: (formData: FormData) => Promise<void>
  /** Where Sent returns: the Command Centre's twenty ('today'), else this page. */
  from?: 'today'
  touchId: string
  /** The exact words shown, so Sent approves these and no others (voice-gate.ts). */
  contentHash: string
  policyVersion: string
  body: string
  openHref: string
  openLabel: string
  action: (formData: FormData) => Promise<void>
}) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no')
  if (firstLetter && !FIRST_LETTER_MANUAL_ON && sendAction) {
    return (
      <form action={sendAction} className="mt-3 flex w-full flex-wrap items-center gap-2" data-send-letter>
        <input type="hidden" name="touch" value={touchId} />
        <input type="hidden" name="contentHash" value={contentHash} />
        <input type="hidden" name="policyVersion" value={policyVersion} />
        <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 text-sm text-[var(--admin-ink)]">
          <input type="checkbox" name="checked" required className="h-5 w-5 shrink-0" />
          I opened their page and it says nothing against messages.
        </label>
        <button type="submit" className={BUTTON}>
          Send
        </button>
        <p className="w-full text-xs text-[var(--admin-muted)]">It goes from lawal@ as written above, through every check again at the press.</p>
      </form>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={QUIET}
        onClick={() => {
          copyText(body).then(
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
      <form action={action} className="flex w-full flex-wrap items-center gap-2">
        <input type="hidden" name="touch" value={touchId} />
        <input type="hidden" name="contentHash" value={contentHash} />
        <input type="hidden" name="policyVersion" value={policyVersion} />
        {from ? <input type="hidden" name="from" value={from} /> : null}
        <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 text-sm text-[var(--admin-ink)]">
          <input type="checkbox" name="checked" required className="h-5 w-5 shrink-0" />
          I opened their page and it says nothing against messages.
        </label>
        <button type="submit" className={BUTTON}>
          Sent
        </button>
      </form>
      {copied === 'failed' && <p className="w-full text-xs text-[var(--admin-soft)]">This browser would not copy it. Select the message above and copy it by hand.</p>}
    </div>
  )
}
