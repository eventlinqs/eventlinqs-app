'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * NavSearch — Ticketmaster-pattern pill search bar.
 *
 * Pill-shaped input, magnifying glass left, Cmd/Ctrl+K badge right.
 * Submitting navigates to /events?q=<query>. Empty submit goes to /events.
 * Cmd/Ctrl+K focuses the input from anywhere on the page.
 */

interface Props {
  variant?: 'desktop' | 'mobile'
}

export function NavSearch({ variant = 'desktop' }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform),
    )

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value.trim() ?? ''
    router.push(q ? `/events?q=${encodeURIComponent(q)}` : '/events')
  }

  const wrapClass =
    variant === 'desktop'
      ? 'hidden md:flex flex-1 max-w-[480px] mx-auto'
      : 'flex md:hidden w-full'

  return (
    <form onSubmit={handleSubmit} role="search" className={wrapClass}>
      <label className="group flex h-11 w-full items-center gap-3 rounded-full border border-ink-200 bg-white px-4 transition-all duration-200 hover:border-ink-400 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)] focus-within:border-gold-500 focus-within:shadow-[0_0_0_3px_rgba(212,160,23,0.15)]">
        <span className="sr-only">Search events, artists, venues</span>
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="shrink-0 text-ink-500"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder="Search events, artists, venues"
          aria-label="Search events, artists, venues"
          className="flex-1 border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
        />
        <span
          aria-hidden
          className="hidden sm:inline-block shrink-0 rounded-md border border-ink-200 bg-ink-100 px-1.5 py-0.5 font-display text-[11px] font-bold text-ink-500"
        >
          {isMac ? '\u2318K' : 'Ctrl K'}
        </span>
      </label>
    </form>
  )
}
