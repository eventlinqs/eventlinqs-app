'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePortalReady } from '@/lib/hooks/use-portal-ready'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * Responsive sheet: bottom sheet on mobile, right-hand side panel on
 * md+. No new dependency - plain portal-less overlay using the same
 * interaction patterns as site-header-client and events-filter-strip
 * (Escape to close, body scroll lock, focus management).
 */
export function FilterSheet({ open, onClose, title, children, footer }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => closeButtonRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])


  // `document` does not exist while this renders on the server; the portal below
  // needs it, and this is the one definition of that question.
  const portalReady = usePortalReady()

  if (!open) return null

  if (!portalReady) return null

  /*
   * PORTALLED TO THE BODY (close-out D2, 11 September 2026). A full-page dialog
   * rendered where it sits is trapped in the stacking context of any ancestor
   * carrying a transform, and then it PAINTS correctly and cannot be clicked at
   * all. Found on the waiting-list dialog by asking the browser what was
   * actually at the centre of its own submit button: the hero section, not the
   * button. No z-index can fix it, because the number only applies inside the
   * trapped context. `overlays-are-portalled` fails the build if it comes back.
   */
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/60"
      />
      <div
        className="
          absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl
          md:bottom-0 md:left-auto md:right-0 md:top-0 md:h-screen md:max-h-screen md:w-[420px] md:rounded-none md:rounded-l-2xl
        "
      >
        <header className="flex shrink-0 items-center justify-between border-b border-ink-100 px-4 py-3 sm:px-5">
          <h2 className="font-display text-base font-bold text-ink-900">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-ink-100 bg-white px-4 py-3 sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
