'use client'

import { useState, useEffect } from 'react'

interface Section {
  id: string
  title: string
}

interface InPageNavProps {
  sections: Section[]
}

/**
 * InPageNav — sticky desktop table-of-contents sidebar.
 *
 * Uses IntersectionObserver to highlight the currently visible section.
 * Hidden on mobile (<lg). Fixed top-24 on desktop.
 *
 * Usage (inside LegalPageShell):
 *   <InPageNav sections={[{ id: 'data-we-collect', title: 'Data We Collect' }]} />
 */
export function InPageNav({ sections }: InPageNavProps) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '')

  useEffect(() => {
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible.length > 0) {
          setActive(visible[0].target.id)
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      }
    )

    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [sections])

  if (sections.length === 0) return null

  return (
    <nav
      className="hidden lg:block sticky top-24 w-56 shrink-0 self-start"
      aria-label="Page sections"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        On this page
      </p>
      <ul className="space-y-1">
        {sections.map(({ id, title }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={[
                'block rounded px-2 py-1.5 text-sm transition-colors duration-150',
                active === id
                  ? 'font-medium text-[var(--brand-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
                setActive(id)
              }}
            >
              {title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
