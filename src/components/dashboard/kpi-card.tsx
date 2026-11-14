type Props = {
  label: string
  value: string
  delta?: { value: number; label?: string } | null
  sparkline?: number[] | null
  emptyHint?: string
  /**
   * A stable name for this figure, so a drive can read it without matching on
   * the label copy. The claim these cards make is "every order, not the first
   * thousand", and the only way to prove it is to put more than a thousand
   * orders behind a real organisation and read what the card says. Matching the
   * label text instead would pin the copy, which is the one thing here that is
   * allowed to change.
   */
  testId?: string
  /**
   * One line under the figure saying what it is made of ("2 orders, your
   * share"), for a card that carries no sparkline. It sits in the slot the
   * sparkline and the empty hint already reserve, so the card height does not
   * change. Added for MONEY FIX B7.
   */
  detail?: string | null
  /** A compact tile for the top row (three across at 390), with its period as a caption. */
  compact?: boolean
  /** Grid placement from the caller (the money panel's full-width cards at 390). */
  className?: string
  caption?: string | null
  /** The one next step this figure asks for (the Next payout card's 'Add payout method'). */
  action?: { label: string; href: string } | null
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 120
  const h = 32

  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((v - min) / range) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-8 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-gold-500)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeltaPill({ delta }: { delta: NonNullable<Props['delta']> }) {
  const positive = delta.value >= 0
  const sign = positive ? '+' : ''
  const cls = positive
    ? 'bg-success/10 text-ink-900'
    : 'bg-error/10 text-ink-900'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
      aria-label={`${positive ? 'up' : 'down'} ${Math.abs(delta.value).toFixed(1)} percent`}
    >
      {sign}
      {delta.value.toFixed(1)}%
    </span>
  )
}

export function KpiCard({ label, value, delta, sparkline, emptyHint, testId, detail, action, compact = false, caption = null, className = '' }: Props) {
  // a line needs two days with something on them; one sale drawn as a spike at the edge says nothing
  const hasSparkline = Array.isArray(sparkline) && sparkline.filter((v) => v > 0).length >= 2
  const hasData = value !== '0' || hasSparkline

  return (
    <div
      className={`panel-elevated rounded-2xl border border-ink-100 bg-white transition-colors hover:border-ink-200 ${compact ? 'p-3 sm:p-5' : 'p-5'}${className ? ` ${className}` : ''}`}
      data-kpi={testId}
      data-kpi-value={testId ? value : undefined}
      data-kpi-delta={testId && delta ? String(delta.value) : undefined}
    >
      <p className="type-eyebrow text-ink-400">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p
          className={`font-headline font-extrabold tabular-nums tracking-tight text-ink-900 ${
            /\d/.test(value) ? (compact ? 'text-xl sm:text-3xl' : 'text-2xl sm:text-3xl') : 'text-lg sm:text-xl'
          }`}
        >
          {value}
        </p>
        {delta && hasData && <DeltaPill delta={delta} />}
      </div>
      {/*
        THE HINT IS FOR AN EMPTY CARD, AND IT USED TO SHOW ON A FULL ONE.

        This branch was `hasSparkline ? <Sparkline/> : <hint/>`, so the two
        cards that never carry a sparkline at all, Upcoming events and Total
        events, printed their empty hint whatever their value was. Caught by
        reading a driven screenshot rather than the drive's own report, at 390
        on 20 September 2026, where the organiser's home screen said:

            TOTAL EVENTS
            1
            Create your first event

        The height is still reserved when the hint is withheld, so nothing
        shifts between a card that has data and one that does not.
      */}
      {compact ? (
        caption ? <p className="mt-1 text-xs text-ink-500">{caption}</p> : null
      ) : (
      <div className="mt-3 h-8">
        {hasSparkline ? (
          <Sparkline points={sparkline as number[]} />
        ) : detail ? (
          <p className="line-clamp-2 text-xs text-ink-600" data-kpi-detail>
            {detail}
          </p>
        ) : hasData ? null : (
          <p className="text-xs text-ink-400">
            {emptyHint ?? 'No data yet'}
          </p>
        )}
      </div>
      )}
      {action ? (
        <a
          href={action.href}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gold-500 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40"
          data-kpi-action
        >
          {action.label}
        </a>
      ) : null}
    </div>
  )
}
