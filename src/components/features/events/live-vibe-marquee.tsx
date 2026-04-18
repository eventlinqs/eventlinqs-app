import Link from 'next/link'

/**
 * LiveVibeMarquee — scrolling strip of real-time platform signals.
 *
 * Server-renders a set of formatted strings. CSS-only marquee animation,
 * pause on hover. Each item can optionally link to an event.
 *
 * Signal shapes (the parent chooses which apply):
 *   - "{n} sold today" from recent orders
 *   - "{pct}% sold" from inventory
 *   - "{days} days to go" from start_date
 *   - "New: {title}" from newly listed events
 */

export interface VibeSignal {
  text: string
  href?: string
  /** Lead emoji glyph — rendered gold-tinted. */
  glyph?: string
}

interface Props {
  signals: VibeSignal[]
}

function Item({ signal }: { signal: VibeSignal }) {
  const content = (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
      {signal.glyph && (
        <span aria-hidden className="text-gold-400">
          {signal.glyph}
        </span>
      )}
      <span className="text-white/90">{signal.text}</span>
    </span>
  )
  if (signal.href) {
    return (
      <Link
        href={signal.href}
        className="mx-6 inline-flex items-center border-b border-transparent pb-0.5 transition-colors duration-200 hover:border-gold-400"
      >
        {content}
      </Link>
    )
  }
  return <span className="mx-6 inline-flex items-center">{content}</span>
}

export function LiveVibeMarquee({ signals }: Props) {
  if (!signals.length) return null

  return (
    <section aria-label="Live platform activity" className="marquee-pause overflow-hidden bg-ink-900 py-5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-400">
          Live on EventLinqs
        </p>
      </div>
      <div className="relative mt-3 flex overflow-hidden whitespace-nowrap">
        <div className="flex min-w-[200%] animate-marquee">
          {[...signals, ...signals].map((s, i) => (
            <Item key={`${s.text}-${i}`} signal={s} />
          ))}
        </div>
      </div>
    </section>
  )
}
