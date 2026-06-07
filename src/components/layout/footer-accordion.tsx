'use client'

import { useId, useState } from 'react'

/**
 * FooterAccordion - mobile footer disclosure (one per row, full width).
 *
 * Footer standard (mobile): full-width STACKED accordions, each fully
 * INDEPENDENT - expanding one moves nothing except the content below it in
 * normal document flow. The old 2-column grid coupled adjacent columns (a grid
 * row stretches to its tallest cell, dragging the neighbour down); a stacked
 * block layout removes that coupling by construction.
 *
 * - Smooth height transition via the grid-template-rows 0fr->1fr technique
 *   (animatable, no fixed max-height guesswork), disabled under reduced motion.
 * - Correct ARIA: a real <button aria-expanded aria-controls> drives a panel;
 *   the chevron rotates with state; the collapsed panel is `inert` so its links
 *   leave the tab order and the accessibility tree.
 * - 44px+ touch target on the summary button.
 */
export function FooterAccordion({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="border-b border-white/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className="flex min-h-[44px] w-full items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-white"
      >
        {title}
        <svg
          className={`h-4 w-4 shrink-0 text-white/70 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        {...(!open ? { inert: true } : {})}
      >
        <ul className="overflow-hidden">
          {links.map((link, i) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={`block py-2 text-sm text-white/70 transition-colors hover:text-white ${i === links.length - 1 ? 'pb-4' : ''}`}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
