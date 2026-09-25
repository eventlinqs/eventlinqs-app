'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDeferredComponent } from './use-deferred-component'
import { MapPinIcon } from './location-picker-icons'
import {
  fetchPickerCatalogue,
  loadedPickerCatalogue,
  type PickerCatalogue,
} from '@/lib/locations/picker-cities-client'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * THE DIALOG IS FETCHED ON INTENT, NOT ON EVERY PAGE LOAD, AND SO IS ITS DATA.
 *
 * This component renders in the site header, and the site header is imported by
 * 22 route files directly plus the page templates the rest use, so its client
 * chunk is shared across effectively the whole platform. (It is NOT in the root
 * layout; an earlier version of this comment said it was.) Before this split
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
 * WHY A DYNAMIC IMPORT AND NOT A CONDITIONAL RENDER. The dialog was already
 * inside an `open &&` branch and that saved nothing: a static import is
 * resolved by the bundler, not by the branch. Only a dynamic import gives it a
 * chunk.
 *
 * WHY `useDeferredComponent` AND NOT `next/dynamic`. The loadable runtime costs
 * 1306 bytes gzip and one whole shared chunk on this tree, measured gate build
 * against gate build, for features this file uses none of. See the hook's note.
 *
 * WHY INTENT AND NOT MOUNT. Arming on mount would move the bytes out of
 * first-load and then fetch them during the load anyway, which is a sequencing
 * change dressed as a reduction (close-out C8B.4). A visitor who never changes
 * city never pays. One who does shows intent first: the pointer enters the
 * trigger, or focus lands on it by keyboard, and the chunk is requested then.
 *
 * ============================================================================
 * THE DATA FOLLOWS THE CODE, AND UNTIL 19 SEPTEMBER 2026 IT DID NOT
 * ============================================================================
 *
 * This component used to take a `cities` prop: the whole merged catalogue,
 * every Australian city with its latitude and longitude, handed across the
 * server/client boundary by the header. Splitting the CODE did nothing to it. A
 * prop that crosses that boundary is serialised into the RSC payload of the
 * document, so the catalogue shipped in the HTML of every page whether the
 * dialog opened or not, and on a page with no events on it at all it was among
 * the largest things there:
 *
 *   /login   document 95,832 B, flight payload 83,282 B (86.9 percent)
 *            the catalogue inside it: 6,152 B, 6.4 percent of the document,
 *            serialised TWICE because the header renders this component for the
 *            desktop bar and again for the mobile sheet
 *
 * It now arrives from `/api/location/cities` on the SAME arming signal as the
 * chunk, so a visitor who shows intent fetches both in parallel and a visitor
 * who never touches the picker fetches neither.
 * `scripts/guards/no-catalogue-in-every-document.mjs` holds it there, in the
 * built documents rather than in the source.
 *
 * WHAT A VISITOR SEES IF THE DATA HAS NOT LANDED WHEN THEY CLICK. The dialog
 * opens with its search box and a designed skeleton where the list goes, and
 * settles into the list. It is not a new failure mode invented here: the CHUNK
 * has always been able to arrive after the click, and before this change that
 * showed as a button which did nothing at all.
 */
interface LocationPickerProps {
  currentLocation: DetectedLocation
  /** Visual variant. `pill` = main bar button (light bg). `onDark` = pill on dark/glass header. `inline` = full-width row in mobile sheet. */
  variant?: 'pill' | 'onDark' | 'inline'
  /** Optional callback fired after selection closes (e.g. to close mobile sheet). */
  onChange?: () => void
}

export function LocationPicker({
  currentLocation,
  variant = 'pill',
  onChange,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [catalogue, setCatalogue] = useState<PickerCatalogue | null>(null)
  const [catalogueFailed, setCatalogueFailed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  /** Request the dialog chunk and its catalogue. Safe to call repeatedly. */
  const arm = useCallback(() => setArmed(true), [])

  const LocationPickerPanel = useDeferredComponent(armed, () =>
    import('./location-picker-panel').then(m => m.LocationPickerPanel),
  )

  useEffect(() => {
    if (!armed) return
    // Another picker on this page may already hold it. `fetchPickerCatalogue`
    // would answer from the same store, but reading it first keeps the common
    // second-picker case out of the promise queue entirely.
    const already = loadedPickerCatalogue()
    if (already) {
      setCatalogue(already)
      return
    }
    let cancelled = false
    setCatalogueFailed(false)
    fetchPickerCatalogue().then(
      next => {
        if (!cancelled) setCatalogue(next)
      },
      error => {
        if (cancelled) return
        console.error('[location-picker] could not load the city catalogue:', error)
        setCatalogueFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [armed, attempt])

  const retryCatalogue = useCallback(() => {
    setCatalogueFailed(false)
    setAttempt(n => n + 1)
  }, [])

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

      {LocationPickerPanel && open ? (
        <LocationPickerPanel
          currentLocation={currentLocation}
          cities={catalogue}
          citiesFailed={catalogueFailed}
          onRetryCities={retryCatalogue}
          onClose={closeDialog}
          onChange={onChange}
        />
      ) : null}
    </>
  )
}
