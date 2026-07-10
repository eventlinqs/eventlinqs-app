'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AdminNavLink } from './admin-nav'

/**
 * Mobile admin navigation. The desktop sidebar is hidden below lg, so without
 * this the admin console has no navigation on a phone. A hamburger opens a
 * slide-over drawer carrying the same capability-filtered nav as the sidebar
 * (one source: admin-nav.ts). Solid navy chrome, no glassmorphism.
 *
 * Accessibility: the drawer mounts only while open (no off-screen tabbable
 * links), Escape and the backdrop close it, body scroll is locked while open,
 * the route changing closes it, and every target is at least 44px.
 */
export function AdminMobileNav({ items }: { items: AdminNavLink[] }) {
  const [open, setOpen] = useState(false)

  // Escape closes; lock body scroll while open. Following a nav link closes the
  // drawer via the link's onClick below.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open admin menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition hover:bg-white/[0.06] hover:text-white"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80%] overflow-y-auto border-r border-white/[0.08] bg-[#0A0F1A]"
          >
            <div className="flex items-center justify-between px-6 py-7">
              <div>
                <span className="block font-display text-lg font-extrabold tracking-tight text-white">EVENTLINQS</span>
                <span className="block text-[11px] uppercase tracking-[0.2em] text-white/50">Admin console</span>
              </div>
              <button
                type="button"
                aria-label="Close admin menu"
                autoFocus
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white/70 transition hover:bg-white/[0.06] hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="px-3 pb-8" aria-label="Admin sections">
              <ul className="flex flex-col gap-1">
                {items.map(i => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[44px] items-center rounded-md px-3 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </>
      ) : null}
    </div>
  )
}
