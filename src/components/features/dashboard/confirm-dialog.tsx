'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePortalReady } from '@/lib/hooks/use-portal-ready'
import { X } from 'lucide-react'
import { typedMatches } from '@/lib/events/typed-confirmation'
import { reportClientError } from '@/lib/observability/client-error-report'

/**
 * A DESIGNED CONFIRMATION, in the platform's own system, for the actions an
 * organiser cannot take back. It replaces `window.confirm` on those actions:
 * a native confirm cannot say what will happen in the organiser's own words,
 * cannot ask them to type the event's name, and looks like nothing on the
 * platform (Law 1).
 *
 * Accessibility: role dialog with aria-modal, labelled by its heading and
 * described by its body; focus moves into the dialog on open and returns to
 * the opener on close; Escape and the scrim close it; every control is at
 * least 44px tall. Motion is a 200ms fade and rise, and reduced motion gets
 * the final state at once.
 *
 * `requireText` is the typed confirmation: the confirm control stays disabled
 * until the organiser has typed exactly that text (case and surrounding
 * whitespace forgiven, nothing else).
 *
 * The panel is MOUNTED only while open, so its typed text and error reset by
 * construction on every opening rather than by a setState inside an effect.
 */
export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  /** The text the person must type before the confirm control enables. */
  requireText?: string
  requireLabel?: string
  onConfirm: () => Promise<{ error?: string } | void>
}

export function ConfirmDialog(props: ConfirmDialogProps) {

  // `document` does not exist while this renders on the server; the portal below
  // needs it, and this is the one definition of that question.
  const portalReady = usePortalReady()

  if (!props.open) return null

  if (!portalReady) return null
  return <ConfirmDialogPanel {...props} />
}

function ConfirmDialogPanel({
  onClose,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  requireText,
  requireLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const headingId = useId()
  const bodyId = useId()
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // DOM only: move focus in, lock the page behind, listen for Escape, and put
  // focus back where it came from when the panel unmounts.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [onClose])

  const typedOk = !requireText || typedMatches(typed, requireText)
  const confirmClass =
    tone === 'danger'
      ? 'bg-error text-white hover:bg-[#B91C1C]'
      : 'bg-gold-400 text-ink-900 hover:bg-gold-500'

  async function confirm() {
    if (!typedOk || pending) return
    setPending(true)
    setError(null)
    try {
      const result = await onConfirm()
      if (result && 'error' in result && result.error) {
        setError(result.error)
        setPending(false)
      }
    } catch (error) {
      reportClientError(error, { where: 'confirm-dialog.confirm' })
      setError('Something went wrong. Nothing was changed.')
      setPending(false)
    }
  }

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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/60 motion-safe:animate-[fade-in_200ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-xl motion-safe:animate-[rise-in_200ms_ease-out]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="font-display text-lg font-bold leading-snug text-ink-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div id={bodyId} className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
          {description}
        </div>

        {requireText ? (
          <div className="mt-4">
            <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
              {requireLabel ?? 'Type the event name to confirm'}
            </label>
            <input
              id={inputId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirm()
              }}
              placeholder={requireText}
              className="mt-1.5 h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-sm text-ink-900">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!typedOk || pending}
            className={`inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${confirmClass}`}
          >
            {pending ? 'Working' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
