import Link from 'next/link'
import { Flame, MapPin, Clock, Sparkles, Ticket, type LucideIcon } from 'lucide-react'

/**
 * LiveVibeMarquee — dark band of scrolling real-time platform signals.
 *
 * CSS-only marquee animation (60s linear), pauses on hover AND focus-within.
 * Each item can optionally link to an event. Glyph icons are lucide, gold-tinted.
 *
 * Signal shapes (the parent chooses which apply):
 *   - "{n} sold today" from recent orders      → ticket icon
 *   - "{pct}% sold" from inventory             → flame icon
 *   - "{days} days to go" from start_date      → clock icon
 *   - "New in {city}: {title}" listings        → pin icon
 *   - "New listing: {title}" default new       → sparkles icon
 */

export type VibeIcon = 'flame' | 'pin' | 'clock' | 'sparkles' | 'ticket'

export interface VibeSignal {
  text: string
  href?: string
  icon?: VibeIcon
}

interface Props {
  signals: VibeSignal[]
}

const ICON_MAP: Record<VibeIcon, LucideIcon> = {
  flame: Flame,
  pin: MapPin,
  clock: Clock,
  sparkles: Sparkles,
  ticket: Ticket,
}

function Item({ signal }: { signal: VibeSignal }) {
  const Icon = signal.icon ? ICON_MAP[signal.icon] : null
  const content = (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-white/90">
      {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0 text-gold-400" strokeWidth={2.25} />}
      <span>{signal.text}</span>
    </span>
  )
  if (signal.href) {
    return (
      <Link
        href={signal.href}
        className="inline-flex items-center border-b border-transparent pb-0.5 transition-colors duration-200 hover:border-gold-400 hover:text-gold-400 focus-visible:outline-none focus-visible:border-gold-400 focus-visible:text-gold-400"
      >
        {content}
      </Link>
    )
  }
  return <span className="inline-flex items-center">{content}</span>
}

export function LiveVibeMarquee({ signals }: Props) {
  if (!signals.length) return null

  return (
    <section aria-label="Live platform activity" className="marquee-band overflow-hidden bg-ink-900 py-5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-400">
          Live on EventLinqs
        </p>
      </div>
      <div className="relative mt-3 flex overflow-hidden whitespace-nowrap">
        <div className="flex min-w-[200%] gap-12 animate-marquee-slow">
          {[...signals, ...signals].map((s, i) => (
            <Item key={`${s.text}-${i}`} signal={s} />
          ))}
        </div>
      </div>
    </section>
  )
}
