'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, X } from 'lucide-react'

/**
 * The result of a press, said where the eye is (Lawal, 15 November 2026, 20:52, item 2: "every button gives visible
 * feedback (pending state, success toast, error with its reason)"). A server action ends with a redirect carrying
 * ?said=<words>&tone=ok|refused; the page hands them here. A success fades after eight seconds, a refusal stays until it
 * is closed, and both are read out by screen readers (role status or alert). The words leave the address bar once shown,
 * so a reload does not say them again. Drawn in a portal on document.body (overlays-are-portalled).
 */
/** False on the server and during hydration, true once mounted in the browser: the portal waits for a body. */
const noSubscribe = () => () => {}
function useMounted(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false)
}

export function AdminToast({ said, tone }: { said: string | null; tone: 'ok' | 'refused' }) {
  const [open, setOpen] = useState(Boolean(said))
  const mounted = useMounted()

  useEffect(() => {
    if (!said) return
    const url = new URL(window.location.href)
    if (url.searchParams.has('said') || url.searchParams.has('tone')) {
      url.searchParams.delete('said')
      url.searchParams.delete('tone')
      window.history.replaceState(window.history.state, '', url.pathname + (url.search ? url.search : '') + url.hash)
    }
    if (tone === 'ok') {
      const t = window.setTimeout(() => setOpen(false), 8000)
      return () => window.clearTimeout(t)
    }
  }, [said, tone])

  if (!said || !open || !mounted) return null
  const ok = tone === 'ok'
  return createPortal(
    <div className="admin-light pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:justify-end sm:p-6">
      <div
        role={ok ? 'status' : 'alert'}
        data-toast={tone}
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl ${
          ok ? 'border-emerald-400/30 bg-emerald-50 text-emerald-800' : 'border-rose-400/40 bg-red-50 text-rose-800'
        }`}
      >
        {ok ? <CircleCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" /> : <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-rose-800" />}
        <p className="min-w-0 flex-1 text-sm leading-relaxed">{said}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close this message" className="-m-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--admin-soft)] hover:bg-[var(--admin-tint-strong)] hover:text-[var(--admin-ink)]">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
