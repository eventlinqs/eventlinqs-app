'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { usePortalReady } from '@/lib/hooks/use-portal-ready'
import { FREE_BAR_NO_TICKET_NEEDED } from '@/lib/events/entry-mode'
import { BOTTOM_BAR_SUBLINE_PROGRAM, BOTTOM_BAR_SUBLINE_REMINDER, REMIND_ME, SHARE } from '@/lib/walk-in/page-copy'
import { RemindMeForm } from './remind-me-form'
import { useWalkInShare } from './walk-in-client'

/**
 * THE PHONE BAR (locked design A, PhoneA.dc.html): "Free · No ticket needed",
 * Remind me, and Share. Below lg only; from lg the panel carries all three.
 *
 * It sits over the foot of the window exactly where the ticketed page's bar sits
 * on this same route (sticky-action-bar.tsx), lifted clear of the consent banner
 * by the same variable the site's own bottom bar reads.
 *
 * Remind me opens a sheet built the way the platform's own dialogs are built
 * (confirm-dialog.tsx): a modal dialog labelled by its heading, focus moved in
 * and returned on close, Escape and the scrim close it, and the page behind
 * does not scroll. Solid, never glass.
 */
export function WalkInBottomBar({
  eventId,
  eventSlug,
  eventTitle,
  eventUrl,
  remindMeOn,
  programPublished,
  heading,
  purpose,
}: {
  eventId: string
  eventSlug: string
  eventTitle: string
  eventUrl: string
  remindMeOn: boolean
  programPublished: boolean
  heading: string
  purpose: string
}) {
  const [open, setOpen] = useState(false)
  const { share, copied } = useWalkInShare({ eventId, eventSlug, eventTitle, eventUrl })
  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white lg:hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: 'translateY(calc(-1 * var(--el-consent-banner-height, 0px)))',
        }}
        data-walk-in-bar
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-5 pt-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] font-bold text-ink-900">{FREE_BAR_NO_TICKET_NEEDED}</p>
            {remindMeOn && (
              <p className="m-0 text-xs text-ink-600">
                {programPublished ? BOTTOM_BAR_SUBLINE_REMINDER : BOTTOM_BAR_SUBLINE_PROGRAM}
              </p>
            )}
          </div>
          {remindMeOn && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="min-h-12 rounded-full bg-[var(--color-gold-400)] px-5 text-[15px] font-extrabold text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
            >
              {REMIND_ME}
            </button>
          )}
          <button
            type="button"
            onClick={share}
            aria-label={copied ? 'Link copied' : SHARE}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-900 bg-white text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" />
            </svg>
          </button>
        </div>
      </div>
      {open && <RemindMeSheet eventId={eventId} heading={heading} purpose={purpose} onClose={() => setOpen(false)} />}
    </>
  )
}

function RemindMeSheet({
  eventId,
  heading,
  purpose,
  onClose,
}: {
  eventId: string
  heading: string
  purpose: string
  onClose: () => void
}) {
  const portalReady = usePortalReady()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      opener?.focus()
    }
  }, [onClose])

  if (!portalReady) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink-900/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full rounded-t-[var(--radius-card)] bg-white px-4 pb-8 pt-4 motion-safe:animate-fade-rise"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 id={titleId} className="m-0 font-headline text-xl font-bold text-ink-900">
            {REMIND_ME}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <RemindMeForm eventId={eventId} heading={heading} purpose={purpose} autoFocus />
      </div>
    </div>,
    document.body,
  )
}
