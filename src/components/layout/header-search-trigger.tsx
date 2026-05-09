'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { HeaderSearchOverlay } from './header-search-overlay'

interface Props {
  /** Visual variant - the State B compact desktop pill, or the mobile
   *  icon-only trigger that lives in the header always. */
  variant: 'desktop-pill' | 'mobile-icon'
  className?: string
}

/**
 * HeaderSearchTrigger - opens the global search overlay (Batch 9.1).
 *
 * Two visual variants:
 *
 *   - 'desktop-pill': 360px wide compact pill with placeholder
 *      "What are you in the mood for?". Visible only when the header
 *      is in State B (controlled by the parent header).
 *   - 'mobile-icon': icon-only 44x44 button. Always visible on mobile
 *      since the mobile header doesn't expose State A inline search.
 *
 * Also wires the global "/" keyboard shortcut: pressing "/" anywhere
 * on the page (except inside an input, textarea, or contenteditable)
 * opens the overlay.
 */
export function HeaderSearchTrigger({ variant, className = '' }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (variant === 'desktop-pill') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={[
            'group inline-flex h-10 w-[360px] items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/15',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]',
            className,
          ].join(' ')}
          aria-label="Open search"
        >
          <Search className="h-4 w-4 text-white/65 group-hover:text-white" aria-hidden />
          <span className="flex-1 text-left">What are you in the mood for?</span>
          <kbd className="hidden h-6 items-center rounded border border-white/20 px-1.5 text-[10px] font-medium text-white/60 lg:inline-flex">
            /
          </kbd>
        </button>
        <HeaderSearchOverlay open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open search"
        className={[
          'flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
          className,
        ].join(' ')}
      >
        <Search className="h-5 w-5" aria-hidden />
      </button>
      <HeaderSearchOverlay open={open} onClose={() => setOpen(false)} />
    </>
  )
}
