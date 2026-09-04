'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { PlacesUnavailable, VenueFinderSession, MIN_QUERY_LENGTH, type VenueSuggestion } from '@/lib/maps/places-autocomplete'
import type { VenueFieldsFromPlace } from '@/lib/maps/address-components'

/**
 * THE VENUE FINDER (Scope v5, 3.1.1): the organiser types the venue, picks it,
 * and every address field below fills itself, with the coordinates and the
 * place id carried into the save. Our own listbox in the design system's
 * tokens; never Google's widget chrome (Law 1).
 *
 * ACCESSIBILITY. WAI-ARIA combobox: the input carries role=combobox,
 * aria-expanded, aria-controls and aria-activedescendant; the list is a
 * listbox of options; ArrowUp and ArrowDown move, Home and End jump, Enter
 * picks, Escape closes. Every option is at least 44px tall. The same pattern as
 * src/components/layout/header-search-overlay.tsx.
 *
 * WHEN IT CANNOT WORK, IT SAYS SO. No key in the build, the Maps library
 * failing to load, or an origin the browser key does not allow (localhost and
 * preview deployments on 4 September 2026) each produce one sentence under the
 * field, and the manual fields keep working: a refused finder is never a
 * blocked organiser.
 */

const DEBOUNCE_MS = 250

interface Props {
  onPick: (fields: VenueFieldsFromPlace) => void
  /** The venue already chosen (edit mode), shown as the field's starting text. */
  initialText?: string
}

export function VenueFinder({ onPick, initialText = '' }: Props) {
  const id = useId()
  const listId = `${id}-venue-options`
  const [query, setQuery] = useState(initialText)
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const session = useMemo(() => new VenueFinderSession(), [])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)

  const describeUnavailable = (err: unknown): string => {
    if (err instanceof PlacesUnavailable) {
      switch (err.reason) {
        case 'no browser key in this build':
          return 'Venue search is not available in this build. Type the address below.'
        case 'this origin is not allowed by the browser key':
          return 'Venue search is not available from this address. Type the venue and address below.'
        default:
          return 'Venue search could not load. Type the venue and address below.'
      }
    }
    return 'Venue search did not answer. Type the venue and address below.'
  }

  const search = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current)
      const trimmed = text.trim()
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setSuggestions([])
        setOpen(false)
        return
      }
      timer.current = setTimeout(async () => {
        const seq = (requestSeq.current += 1)
        setBusy(true)
        try {
          const next = await session.suggest(trimmed)
          if (seq !== requestSeq.current) return
          setSuggestions(next)
          setOpen(next.length > 0)
          setActiveIndex(next.length > 0 ? 0 : -1)
          setNotice(next.length === 0 ? 'No venues match that yet. Keep typing, or fill the address below.' : null)
        } catch (err) {
          if (seq !== requestSeq.current) return
          setSuggestions([])
          setOpen(false)
          setNotice(describeUnavailable(err))
        } finally {
          if (seq === requestSeq.current) setBusy(false)
        }
      }, DEBOUNCE_MS)
    },
    [session],
  )

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const choose = async (s: VenueSuggestion) => {
    setOpen(false)
    setBusy(true)
    try {
      const fields = await session.pick(s)
      setQuery(fields.venue_name || s.mainText)
      setPicked(`${fields.venue_name || s.mainText}${fields.venue_city ? ', ' + fields.venue_city : ''}`)
      setNotice(null)
      onPick(fields)
    } catch (err) {
      setNotice(describeUnavailable(err))
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false)
      return
    }
    const len = suggestions.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % len)
        return
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => (i <= 0 ? len - 1 : i - 1))
        return
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        e.preventDefault()
        setActiveIndex(len - 1)
        return
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < len) {
          e.preventDefault()
          void choose(suggestions[activeIndex])
        }
        return
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        return
      default:
        return
    }
  }

  const activeId = open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined

  return (
    <div className="relative">
      <label htmlFor={`${id}-venue-search`} className="block text-sm font-medium text-ink-600 mb-1">
        Find the venue
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          id={`${id}-venue-search`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={`${id}-venue-help`}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPicked(null)
            search(e.target.value)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search for a venue or an address"
          className="w-full rounded-lg border border-ink-200 py-2.5 pl-9 pr-4 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>
      <p id={`${id}-venue-help`} className="mt-1.5 text-xs text-ink-600" aria-live="polite">
        {busy
          ? 'Searching venues.'
          : picked
            ? `Venue set: ${picked}. The address below was filled from it; edit anything that is not right.`
            : notice ?? 'Pick a venue and the address, suburb, state and postcode fill themselves, with the map pin.'}
      </p>
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Venue suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg"
        >
          {suggestions.map((s, idx) => {
            const active = idx === activeIndex
            return (
              <li
                key={s.id}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  void choose(s)
                }}
                className={`flex min-h-[44px] cursor-pointer items-start gap-3 px-4 py-2.5 text-sm ${
                  active ? 'bg-gold-100 text-ink-900' : 'text-ink-900 hover:bg-ink-100'
                }`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-800" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.mainText}</span>
                  {s.secondaryText && <span className="block truncate text-xs text-ink-600">{s.secondaryText}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
