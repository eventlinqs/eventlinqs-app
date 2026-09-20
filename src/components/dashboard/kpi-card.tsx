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

export function KpiCard({ label, value, delta, sparkline, emptyHint, testId }: Props) {
  const hasSparkline = Array.isArray(sparkline) && sparkline.length >= 2
  const hasData = value !== '0' || hasSparkline

  return (
    <div
      className="panel-elevated rounded-2xl border border-ink-100 bg-white p-5 transition-colors hover:border-ink-200"
      data-kpi={testId}
      data-kpi-value={testId ? value : undefined}
      data-kpi-delta={testId && delta ? String(delta.value) : undefined}
    >
      <p className="type-eyebrow text-ink-400">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-headline text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 sm:text-3xl">
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
      <div className="mt-3 h-8">
        {hasSparkline ? (
          <Sparkline points={sparkline as number[]} />
        ) : hasData ? null : (
          <p className="text-xs text-ink-400">
            {emptyHint ?? 'No data yet'}
          </p>
        )}
      </div>
    </div>
  )
}
