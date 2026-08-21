'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle, RotateCcw, X } from 'lucide-react'
import { GUIDANCE_SURFACES, type GuidanceSurfaceId } from '@/lib/guidance/registry'
import { useFirstRunCoach } from '@/lib/guidance/memory'
import { FirstRunCoach } from './first-run-coach'
import { AskInContext } from './ask-in-context'

/**
 * The ONE mount for a surface's guidance. A page adds a single element and
 * gets first-run coaching, a persistent way back to that coaching, the written
 * guides, and the in-context assistant.
 *
 * It is deliberately one component rather than four: the surfaces it mounts on
 * are owned by other work, so the smaller its footprint there, the safer it is.
 *
 * Placement: fixed to the bottom-right of the viewport rather than absolute
 * inside the surface, so it can never be clipped by an overflow-hidden canvas
 * and never lands on top of the seat map chrome. It sits under any modal.
 */
export function SurfaceGuidance({
  surface: surfaceId,
  className = '',
}: {
  surface: GuidanceSurfaceId
  className?: string
}) {
  const surface = GUIDANCE_SURFACES[surfaceId]
  const { open: coachOpen, dismiss, reopen, forget } = useFirstRunCoach(
    surfaceId,
    surface.version,
  )
  const [panelOpen, setPanelOpen] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelHeadingId = useId()

  // Escape closes the panel from anywhere inside it.
  useEffect(() => {
    if (!panelOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPanelOpen(false)
        launcherRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen])

  useEffect(() => {
    if (panelOpen) panelRef.current?.focus()
  }, [panelOpen])

  // Mobile stacking: the platform's bottom bars (MobileBottomNav on most
  // routes, StickyActionBar on event detail) both fill bottom-0 at z-40, and
  // the established convention for anything that must sit above them is
  // bottom-16 z-50. Without this the help launcher is unreachable by finger on
  // a phone, which the accessibility drive caught. Desktop hides those bars, so
  // it returns to bottom-4.
  return (
    <div
      className={`pointer-events-none fixed bottom-16 right-4 z-50 flex flex-col items-end gap-2 md:bottom-4 ${className}`}
    >
      {/* THE COACH AND THE PANEL SIT OUT OF FLOW ON PURPOSE.
       *
       * They used to be flex children of the fixed container above. That
       * container is anchored by its BOTTOM edge and sized by its content, so
       * the moment the first-run coach mounted - after hydration, once the
       * "have they seen this?" read came back - the container's own box grew
       * from the 44px launcher to roughly 320x360, and the browser scored that
       * growth as a layout shift. Measured on the buyer seat map: a single
       * shift worth 0.151, against a gate that fails above 0.1, and the whole
       * of that page's CLS came from this one element.
       *
       * Absolute positioning against the fixed container fixes the cause
       * rather than the number: the container's in-flow content is now only
       * ever the launcher, so nothing it holds can resize it, and this wrapper
       * is created at the same moment its contents are, so it has no earlier
       * box to have moved from. `bottom-full` + `mb-2` reproduces exactly where
       * `flex-col gap-2` used to place these, so the visual result is
       * unchanged. Put either of these back in flow and the shift returns. */}
      {(coachOpen || panelOpen) && (
        <div className="absolute bottom-full right-0 mb-2 flex flex-col items-end gap-2">
          {/* On desktop the coach steps left of the surface's right-hand rail
              (the buyer's schedule rail, the studio's inspector), because
              coaching that covers the control it is describing is worse than no
              coaching. On a phone everything is stacked, so it sits where it
              lands. */}
          {coachOpen && !panelOpen && (
            <div className="lg:mr-[20rem]">
              <FirstRunCoach surface={surface} onDismiss={dismiss} returnFocusTo={launcherRef} />
            </div>
          )}

          {panelOpen && (
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby={panelHeadingId}
              tabIndex={-1}
              className="guidance-rise pointer-events-auto max-h-[min(32rem,calc(100vh-11rem))] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-4 shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
                    Help
                  </p>
                  <h2 id={panelHeadingId} className="font-display text-base font-bold text-ink-900">
                    {surface.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPanelOpen(false)
                    launcherRef.current?.focus()
                  }}
                  aria-label="Close help"
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-1 text-xs leading-relaxed text-ink-600">{surface.intro}</p>

              <ul className="mt-3 space-y-2.5">
                {surface.steps.map((step, i) => (
                  <li key={step.id} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink-900">{step.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">
                        {step.body}
                      </span>
                      {step.keyboard && (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                          Keyboard: {step.keyboard}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => {
                  forget()
                  setPanelOpen(false)
                  reopen()
                }}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 text-[11px] font-semibold text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Walk me through it again
              </button>

              <AskInContext surface={surface} />
            </div>
          )}
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          setPanelOpen(o => !o)
          if (coachOpen) dismiss()
        }}
        aria-expanded={panelOpen}
        aria-label={panelOpen ? 'Close help' : `Open help: ${surface.label}`}
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-gold-500/40 bg-ink-900 text-gold-400 shadow-lg transition-colors hover:bg-ink-800 hover:text-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
