'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'
import { MapPinIcon } from './location-picker-icons'
import type { DetectedLocation } from '@/lib/geo/detect'
import type { PickerCityGroups } from '@/lib/locations/picker-cities'

/**
 * THE DIALOG IS FETCHED ON INTENT, NOT ON EVERY PAGE LOAD.
 *
 * This component renders in the site header, the site header renders in the
 * root layout, and the root layout renders on every route. Before this split
 * the whole city dialog travelled with it: the search box and its normalising
 * matcher, the full city list, the haversine nearest-city search, the
 * geolocation handling and the routing that follows a pick. All of it shipped
 * to /offline, to /careers and to /unsubscribe/[token], where the trigger is
 * not even visible.
 *
 * MEASURED, on the build of 17 September 2026, with
 * `node scripts/perf/first-load-budget.mjs`. The floor route /_not-found paid
 * 156.9 KB gzip of first-load JavaScript, of which 130.4 KB is the React and
 * Next.js runtime no application change can touch. The rest is what this
 * platform puts on every route, and the largest application chunk in it was the
 * one holding the header, the footer accordion and this dialog.
 *
 * WHY next/dynamic AND NOT A CONDITIONAL RENDER. The dialog was already inside
 * an `open &&` branch and that saved nothing: a static import is resolved by
 * the bundler, not by the branch. Only a dynamic import gives it a chunk.
 *
 * WHY INTENT AND NOT MOUNT. Arming on mount would move the bytes out of
 * first-load and then fetch them during the load anyway, which is a sequencing
 * change dressed as a reduction (close-out C8B.4). A visitor who never changes
 * city never pays. One who does shows intent first: the pointer enters the
 * trigger, or focus lands on it by keyboard, and the chunk is requested then.
 *
 * WHAT MOVED WITH THE DIALOG. Its own state moved too, so closing now unmounts
 * rather than resetting four `useState` values by hand. `closeDialog` below is
 * therefore shorter than the one it replaces and does the same two things that
 * were ever visible: it closes, and it returns focus to the trigger.
 */
const LocationPickerPanel = dynamic(() =>
  import('./location-picker-panel').then(m => m.LocationPickerPanel),
)

interface LocationPickerProps {
  currentLocation: DetectedLocation
  /** Curated + dynamic picker cities. Fetched server-side and passed in. */
  cities: PickerCityGroups
  /** Visual variant. `pill` = main bar button (light bg). `onDark` = pill on dark/glass header. `inline` = full-width row in mobile sheet. */
  variant?: 'pill' | 'onDark' | 'inline'
  /** Optional callback fired after selection closes (e.g. to close mobile sheet). */
  onChange?: () => void
}

export function LocationPicker({
  currentLocation,
  cities,
  variant = 'pill',
  onChange,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  /** Request the dialog chunk. Safe to call repeatedly. */
  const arm = useCallback(() => setArmed(true), [])

  const closeDialog = useCallback(() => {
    setOpen(false)
    setTimeout(() => triggerRef.current?.focus(), 0)
  }, [])

  const triggerClasses =
    variant === 'pill'
      ? [
          'inline-flex items-center gap-1.5 h-11 px-3 rounded-full',
          'text-sm font-medium text-ink-700 bg-transparent',
          'border border-ink-200',
          'hover:border-gold-500 hover:text-gold-600 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
        ].join(' ')
      : variant === 'onDark'
      ? [
          'inline-flex items-center gap-1.5 h-11 px-3 rounded-full',
          'text-sm font-medium text-white/90 bg-white/10',
          'border border-white/15',
          'hover:bg-white/15 hover:border-[var(--brand-accent)]/60 hover:text-white transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]',
        ].join(' ')
      : [
          'flex w-full min-h-[44px] items-center gap-2 rounded-lg px-4 py-3',
          'text-base font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900',
          'border border-ink-100 bg-white',
          'transition-colors focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset',
        ].join(' ')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setArmed(true); setOpen(true) }}
        onPointerEnter={arm}
        onTouchStart={arm}
        onFocus={arm}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Change location. Current: ${currentLocation.city}`}
        className={triggerClasses}
      >
        <MapPinIcon className="h-4 w-4 text-gold-500" />
        <span className="truncate max-w-[140px]">{currentLocation.city}</span>
      </button>

      {armed && open ? (
        <LocationPickerPanel
          currentLocation={currentLocation}
          cities={cities}
          onClose={closeDialog}
          onChange={onChange}
        />
      ) : null}
    </>
  )
}
