import Link from 'next/link'
import {
  Moon,
  Calendar,
  Tag,
  Music,
  UtensilsCrossed,
  Mic2,
  Heart,
  Users,
  Globe,
} from 'lucide-react'

/**
 * CategoryChipStrip (Batch 9.2) - quick-filter chips below the hero.
 *
 * Eight EventLinqs-native categories plus a Cultural Communities link
 * routing to /cultures. Each chip is a navigation `<a>` so keyboard
 * users tab through them naturally.
 *
 * Visual: navy pill, gold icon, white label, 44px min-height for touch
 * compliance. Hover lifts 1px with a subtle shadow.
 *
 * Layout: fits in viewport on desktop (no scroll); mobile uses
 * `scroll-snap-type: x mandatory` with peek-next pattern (the next
 * chip's left edge intentionally sits inside the viewport so users
 * see scroll affordance).
 *
 * Plausible event: every chip click fires `category_chip_click` via
 * the tagged-events class with the `category` property. The cultures
 * communities chip fires `nav_cultures_click` to mirror the primary nav.
 */

interface ChipDef {
  label: string
  href: string
  icon: typeof Moon
  /** Plausible event name (tagged-events class). */
  event: string
}

const CHIPS: ChipDef[] = [
  { label: 'Tonight',      href: '/events?when=tonight',  icon: Moon,            event: 'category_chip_click' },
  { label: 'This Weekend', href: '/events?when=weekend',  icon: Calendar,        event: 'category_chip_click' },
  { label: 'Free',         href: '/events?free=1',        icon: Tag,             event: 'category_chip_click' },
  { label: 'Music',        href: '/events?category=music',     icon: Music,            event: 'category_chip_click' },
  { label: 'Food',         href: '/events?category=food',      icon: UtensilsCrossed,  event: 'category_chip_click' },
  { label: 'Comedy',       href: '/events?category=comedy',    icon: Mic2,             event: 'category_chip_click' },
  { label: 'Wellness',     href: '/events?category=wellness',  icon: Heart,            event: 'category_chip_click' },
  { label: 'Family',       href: '/events?category=family',    icon: Users,            event: 'category_chip_click' },
]

export function CategoryChipStrip() {
  return (
    <section
      aria-label="Quick filters"
      className="bg-canvas"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <ul
          role="list"
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0"
          style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
        >
          {CHIPS.map(c => {
            const Icon = c.icon
            return (
              <li key={c.href} className="shrink-0" style={{ scrollSnapAlign: 'start' }}>
                <Link
                  href={c.href}
                  prefetch={false}
                  data-event-category={c.label}
                  className={[
                    `plausible-event-name=${c.event}`,
                    `plausible-event-category=${c.label}`,
                    'inline-flex h-11 items-center gap-2 rounded-full border px-5',
                    'border-transparent bg-[var(--color-navy-950)] text-sm font-semibold text-white',
                    'transition-all duration-200 motion-reduce:transition-none',
                    'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(10,22,40,0.18)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
                  <span>{c.label}</span>
                </Link>
              </li>
            )
          })}
          <li className="shrink-0" style={{ scrollSnapAlign: 'start' }}>
            <Link
              href="/cultures"
              prefetch={false}
              className={[
                'plausible-event-name=nav_cultures_click',
                'inline-flex h-11 items-center gap-2 rounded-full border px-5',
                'border-[var(--brand-accent)] bg-transparent text-sm font-semibold text-[var(--color-navy-950)]',
                'transition-all duration-200 motion-reduce:transition-none',
                'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(10,22,40,0.12)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
              ].join(' ')}
            >
              <Globe className="h-4 w-4 text-[var(--brand-accent-strong)]" aria-hidden />
              <span>Cultural Communities</span>
              <span aria-hidden className="text-[var(--brand-accent-strong)]">›</span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  )
}
