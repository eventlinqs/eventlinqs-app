'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { DayHours, GuideItem } from '@/lib/walk-in/guide'
import { HoursText } from './hours-list'

export type WalkInDayView = {
  date: string
  /** "Fri 20 Nov", the tab from lg (Main). */
  tab: string
  /** "Fri 20", the tab on a phone (PhoneA). */
  phoneTab: string
  /** "Friday 20 November", over the day's card from lg. */
  long: string
  hours: DayHours
  items: GuideItem[]
  closer: { name: string; note: string | null } | null
}

/**
 * THE DAYS, ONE TAB EACH (locked design A, "The weekend, day by day").
 *
 * ARIA tabs: one tablist, a tab per day with aria-selected and aria-controls, a
 * tabpanel per day, and roving focus on the arrow keys, Home and End. Every
 * panel is rendered on the server and the unselected ones carry `hidden`, so
 * nothing moves when the page hydrates and a reader of the HTML finds every day.
 * Without script every day is shown, stacked (the noscript rule below).
 */
export function WalkInDayTabs({
  days,
  textSource,
  closingLabel,
}: {
  days: WalkInDayView[]
  textSource: 'organiser' | 'eventlinqs'
  closingLabel: string
}) {
  const [selected, setSelected] = useState(0)
  const base = useId()
  const tabs = useRef<Array<HTMLButtonElement | null>>([])

  function move(to: number) {
    const next = (to + days.length) % days.length
    setSelected(next)
    tabs.current[next]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(days.length - 1)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 lg:gap-5">
      {/* WITHOUT SCRIPT the tabs cannot switch, so every day is shown stacked and
          the tab row, which would do nothing, is not shown. Read only when
          scripting is off, so a visitor with it sees no change and no shift.
          The panel rule sits IN @layer base: Tailwind's preflight hides
          [hidden] with !important there, and an important rule in a layer beats
          an unlayered important rule whatever its specificity, so unlayered it
          lost and only the first day showed (the WI1 drive, 22 October). In
          the same layer the two-attribute selector wins. */}
      {days.length > 1 && (
        <noscript>
          <style>{'@layer base{[data-day-panel][hidden]{display:flex !important}}[data-day-tabs]{display:none !important}'}</style>
        </noscript>
      )}
      {days.length > 1 && (
        <div role="tablist" aria-label="Days" data-day-tabs="" className="flex gap-1.5 lg:flex-wrap lg:gap-2">
          {days.map((d, i) => {
            const on = i === selected
            return (
              <button
                key={d.date}
                ref={(el) => {
                  tabs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${i}`}
                aria-selected={on}
                aria-controls={`${base}-panel-${i}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={
                  'min-h-11 flex-1 rounded-full border-[1.5px] px-5 text-sm font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 lg:flex-none lg:text-[15px] ' +
                  (on
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-200 bg-white text-ink-900 hover:border-ink-900')
                }
              >
                <span className="lg:hidden">{d.phoneTab}</span>
                <span className="hidden lg:inline">{d.tab}</span>
              </button>
            )
          })}
        </div>
      )}

      {days.map((d, i) => (
        <div
          key={d.date}
          role={days.length > 1 ? 'tabpanel' : undefined}
          id={`${base}-panel-${i}`}
          aria-labelledby={days.length > 1 ? `${base}-tab-${i}` : undefined}
          data-day-panel=""
          hidden={i !== selected}
          className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-white p-5 lg:gap-5 lg:p-7"
        >
          {/* Phone: one line, "Saturday, 10am to 10pm" (PhoneA). */}
          <p className="m-0 mb-1.5 text-[15px] font-bold text-ink-900 lg:hidden">
            {d.long.split(' ')[0]}, <HoursText hours={d.hours} source={textSource} />
          </p>
          {/* lg: the long date on the left and the hours on the right (Main). */}
          <div className="hidden flex-wrap items-baseline justify-between gap-2 lg:flex">
            <h3 className="m-0 font-headline text-2xl font-bold text-ink-900">{d.long}</h3>
            <p className="m-0 text-base font-bold text-ink-800">
              <HoursText hours={d.hours} source={textSource} />
            </p>
          </div>

          {d.items.length > 0 && (
            <ul className="m-0 flex list-none flex-col p-0">
              {d.items.map((item, j) => (
                <li
                  key={j}
                  data-text-source={textSource}
                  className="border-t border-ink-100 py-2.5 lg:grid lg:grid-cols-[120px_minmax(0,1fr)] lg:gap-4 lg:py-3.5"
                >
                  <span className="block text-xs font-bold text-[var(--brand-accent-strong)] lg:text-sm">{item.when}</span>
                  <span className="mt-0.5 block text-[15px] leading-[1.45] text-ink-900 lg:mt-0 lg:text-base lg:leading-[1.5]">
                    {item.what}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {d.closer && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 rounded-[var(--radius-panel)] bg-ink-900 px-4 py-3.5 text-white lg:mt-0 lg:gap-4 lg:rounded-[var(--radius-card)] lg:px-6 lg:py-5">
              <div>
                <p className="type-eyebrow m-0 font-display text-[var(--color-gold-400)]">{closingLabel}</p>
                <p data-text-source={textSource} className="m-0 mt-0.5 font-headline text-[19px] font-bold lg:mt-1 lg:text-[22px]">
                  {d.closer.name}
                </p>
              </div>
              {d.closer.note && (
                <p data-text-source={textSource} className="m-0 text-[13px] text-ink-200 lg:text-sm">
                  {d.closer.note}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
