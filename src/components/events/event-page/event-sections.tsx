import type { ReactNode } from 'react'

/**
 * ONE EVENT PAGE (the CONTROLLER's 31 October 2026 10:05): every event page, whatever its admission state (a ticket, a
 * registration, an outside link, free walk-in), draws the same shared sections in this one order; only the action block
 * and the body between the facts and the venue differ. Each section carries its marker so the guard
 * (scripts/guards/event-page-one-spine.mjs) and the tests can read the order on any template.
 */
export const EVENT_PAGE_SECTIONS = ['hero', 'facts', 'map', 'getting-there', 'organiser'] as const

export type EventPageSection = (typeof EVENT_PAGE_SECTIONS)[number]

/** A marker only: `display: contents`, so wrapping a section never moves the layout it already has. */
export function EventSection({ name, children }: { name: EventPageSection; children: ReactNode }) {
  return (
    <div data-event-section={name} className="contents">
      {children}
    </div>
  )
}
