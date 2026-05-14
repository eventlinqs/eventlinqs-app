import { ContentSection } from '@/components/layout/ContentSection'

interface Props {
  organiserName: string
  /** [{label, count, percent}] precomputed from past+upcoming events. */
  breakdown: { label: string; count: number; percent: number }[]
}

/**
 * OrganiserEventTypesBreakdown - horizontal bar showing what types of
 * events the organiser runs (Batch 8.2 OP5).
 *
 * Hides via parent when event count < 3 - the breakdown isn't useful
 * for organisers with one or two events. Sorted desc by count.
 */
export function OrganiserEventTypesBreakdown({ organiserName, breakdown }: Props) {
  if (breakdown.length === 0) return null
  const palette = [
    'var(--brand-accent-strong)',
    'var(--color-navy-700)',
    'var(--color-navy-500)',
    'var(--color-navy-400)',
    'var(--color-navy-300)',
  ]
  return (
    <ContentSection surface="alt" width="default" topBorder>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
        Event mix
      </p>
      <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
        What {organiserName} runs
      </h2>
      <div className="mt-6">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          {breakdown.map((b, i) => (
            <div
              key={b.label}
              className="h-full"
              style={{ width: `${b.percent}%`, backgroundColor: palette[i % palette.length] }}
              aria-label={`${b.label} ${b.percent.toFixed(0)} percent`}
              title={`${b.label}: ${b.count} events (${b.percent.toFixed(0)}%)`}
            />
          ))}
        </div>
        <ul role="list" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {breakdown.map((b, i) => (
            <li key={b.label} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="block h-3 w-3 rounded-full"
                  style={{ backgroundColor: palette[i % palette.length] }}
                  aria-hidden
                />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{b.label}</span>
              </div>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {b.count} {b.count === 1 ? 'event' : 'events'} · {b.percent.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ContentSection>
  )
}
