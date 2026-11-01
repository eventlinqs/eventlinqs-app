'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import type { EventCardData } from '@/components/features/events/event-card'
import { broadcastPriceLabel } from '@/lib/broadcast/price-line'
import { resolveZone } from '@/lib/dates/event-time'

/**
 * THE CITY'S ROTATING SLIDER (the CONTROLLER's 16:41 of 1 November 2026, (3); Humanitix's featured slider, seen at 1440
 * that day, C:\dev\EVIDENCE\CITY-FIRST-1NOV\design\leaders-city-guide.md). Drawn ONLY where the city holds at least
 * SLIDER_MINIMUM nights in the next fortnight with a rights recorded photograph; below that it is not drawn at all,
 * never a placeholder. The photograph carries nothing written on it: the day and time, title, venue and price sit
 * beside it (law 7 of 31 October). Motion follows the platform's law: it rotates every 6.5 s only under
 * html[data-motion="1"] and without reduced motion, pauses on hover, touch and focus, and the slides after the first
 * mount only once rotation arms, so the first photograph alone owns the paint.
 */
export const SLIDER_MINIMUM = 3
const ROTATE_MS = 6500

function whenOf(iso: string, timezone: string | null): string {
  const at = new Date(iso)
  const zone = resolveZone(timezone)
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(at).replace(/,/g, '')
  const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(at)
  if (hm === '00:00' || hm === '24:00') return day
  const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone })
    .format(at)
    .replace(/\u202f/g, ' ')
    .toLowerCase()
  return `${day} \u00b7 ${time}`
}

export function CityHeroSlider({ events, cityName }: { events: readonly EventCardData[]; cityName: string }) {
  const [index, setIndex] = useState(0)
  const [armed, setArmed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [held, setHeld] = useState(false)
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const motion = document.documentElement.dataset.motion === '1'
    // A browser without matchMedia is treated as asking for reduced motion: it never rotates on its own.
    const reduced = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: rotation arms after paint, never on the server, so the first slide alone is in the first render
    if (motion && !reduced) setArmed(true)
  }, [])

  useEffect(() => {
    if (!armed || paused || held || events.length < 2) return
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % events.length), ROTATE_MS)
    return () => window.clearTimeout(t)
  }, [armed, paused, held, index, events.length])

  if (events.length < SLIDER_MINIMUM) return null
  const go = (i: number) => setIndex((i + events.length) % events.length)

  return (
    <section
      ref={root}
      aria-roledescription="carousel"
      aria-label={`Featured in ${cityName}`}
      className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 md:pt-6 lg:px-8"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onTouchStart={() => setHeld(true)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setHeld(false)
      }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white shadow-[var(--shadow-card)]">
        {events.map((e, i) => {
          // The first slide always; another only once rotation arms or a visitor chooses it, so it never competes
          // with the first photograph for the paint.
          if (i !== 0 && i !== index && !armed) return null
          const visible = i === index
          const price = broadcastPriceLabel({
            ticket_tiers: e.ticket_tiers.map((t) => ({ price: t.price, currency: t.currency })),
            external_ticket_url: e.external_ticket_url ?? null,
            is_free: e.is_free ?? null,
            entry_mode: e.entry_mode ?? null,
          })
          const venue = [e.venue_name, e.venue_city].filter(Boolean).join(', ')
          return (
            <Link
              key={e.id}
              href={`/events/${e.slug}`}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${events.length}: ${e.title}`}
              aria-hidden={!visible}
              tabIndex={visible ? 0 : -1}
              className={`group grid md:grid-cols-[3fr_2fr] ${visible ? 'relative' : 'pointer-events-none absolute inset-0 opacity-0'} transition-opacity duration-300 ease-out motion-reduce:transition-none`}
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[var(--color-ink-100)]">
                {e.image_credit ? (
                  <EventCardMedia src={e.cover_image_url} alt={e.title} variant="rail-feature-card" priority={i === 0} title={e.image_credit} />
                ) : (
                  <>
                    <div className="ledger-blur" aria-hidden="true">
                      <EventCardMedia src={e.cover_image_url} alt="" variant="rail-feature-card" />
                    </div>
                    <EventCardMedia src={e.cover_image_url} alt={e.title} variant="rail-feature-card" priority={i === 0} objectFit="contain" />
                  </>
                )}
              </div>
              <div className="flex flex-col justify-center gap-2 px-5 py-5 md:px-8">
                <p className="font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">Featured</p>
                <p className="font-display text-sm font-bold text-[var(--text-muted)]">{whenOf(e.start_date, e.timezone)}</p>
                <h2 className="font-headline text-2xl font-extrabold leading-tight text-[var(--text-primary)] line-clamp-3 underline-offset-4 decoration-[var(--brand-accent)] decoration-2 group-hover:underline md:text-3xl">
                  {e.title}
                </h2>
                {venue ? <p className="font-display text-base font-medium text-[var(--text-secondary)]">{venue}</p> : null}
                {price ? <p className="font-display text-base font-extrabold text-[var(--text-primary)]">{price}</p> : null}
              </div>
            </Link>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Choose a slide">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${i + 1} of ${events.length}: ${e.title}`}
              aria-current={i === index ? 'true' : undefined}
              className="inline-flex h-11 w-7 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
            >
              <span className={`block h-2 rounded-full transition-all ${i === index ? 'w-5 bg-[var(--color-ink-900)]' : 'w-2 bg-[var(--color-ink-200)]'}`} />
            </button>
          ))}
        </div>
        <p className="min-w-0 truncate font-display text-sm font-semibold text-[var(--text-muted)]">
          Next: {events[(index + 1) % events.length].title}
        </p>
        {armed ? (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="sr-only focus-visible:not-sr-only focus-visible:inline-flex focus-visible:h-11 focus-visible:items-center focus-visible:gap-2 focus-visible:rounded-full focus-visible:bg-[var(--color-ink-900)] focus-visible:px-4 focus-visible:text-white"
          >
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            {paused ? 'Play the slides' : 'Pause the slides'}
          </button>
        ) : null}
      </div>
    </section>
  )
}
