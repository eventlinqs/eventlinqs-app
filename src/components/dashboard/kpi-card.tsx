type Props = {
  label: string
  value: string
  delta?: { value: number; label?: string } | null
  sparkline?: number[] | null
  emptyHint?: string
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
    ? 'bg-success/10 text-success'
    : 'bg-error/10 text-error'
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

export function KpiCard({ label, value, delta, sparkline, emptyHint }: Props) {
  const hasSparkline = Array.isArray(sparkline) && sparkline.length >= 2
  const hasData = value !== '0' || hasSparkline

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5 transition-colors hover:border-ink-200">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-display text-2xl font-bold tabular-nums text-ink-900 sm:text-3xl">
          {value}
        </p>
        {delta && hasData && <DeltaPill delta={delta} />}
      </div>
      <div className="mt-3 h-8">
        {hasSparkline ? (
          <Sparkline points={sparkline as number[]} />
        ) : (
          <p className="text-xs text-ink-400">
            {emptyHint ?? 'No data yet'}
          </p>
        )}
      </div>
    </div>
  )
}
