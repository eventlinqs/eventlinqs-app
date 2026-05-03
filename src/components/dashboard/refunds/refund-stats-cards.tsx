import { CircleAlert, CircleCheck, CirclePause, Receipt } from 'lucide-react'
import type { RefundStatistics } from '@/lib/refunds/queries'
import { formatCents } from './format'

type Tone = 'warning' | 'success' | 'neutral' | 'navy'

interface CardProps {
  label: string
  value: string
  helper?: string
  tone: Tone
  icon: React.ReactNode
}

const TONES: Record<Tone, { bg: string; iconBg: string; iconText: string; valueText: string }> = {
  warning: {
    bg: 'bg-white border border-ink-100',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    valueText: 'text-amber-700',
  },
  success: {
    bg: 'bg-white border border-ink-100',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    valueText: 'text-emerald-700',
  },
  neutral: {
    bg: 'bg-white border border-ink-100',
    iconBg: 'bg-ink-50',
    iconText: 'text-ink-600',
    valueText: 'text-ink-900',
  },
  navy: {
    bg: 'bg-ink-900 text-white',
    iconBg: 'bg-white/10',
    iconText: 'text-gold-400',
    valueText: 'text-white',
  },
}

function Card({ label, value, helper, tone, icon }: CardProps) {
  const t = TONES[tone]
  return (
    <div className={`rounded-2xl p-5 ${t.bg}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${tone === 'navy' ? 'text-white/60' : 'text-ink-500'}`}>
            {label}
          </p>
          <p className={`mt-2 text-2xl font-bold ${t.valueText}`}>{value}</p>
          {helper && (
            <p className={`mt-1 text-xs ${tone === 'navy' ? 'text-white/60' : 'text-ink-500'}`}>{helper}</p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

export function RefundStatsCards({ stats }: { stats: RefundStatistics }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label="Pending"
        value={String(stats.pending_count)}
        helper="Awaiting your review"
        tone="warning"
        icon={<CirclePause className="h-5 w-5" aria-hidden="true" />}
      />
      <Card
        label="Processing"
        value={String(stats.processing_count)}
        helper="Awaiting payment provider"
        tone="neutral"
        icon={<CircleAlert className="h-5 w-5" aria-hidden="true" />}
      />
      <Card
        label="Completed"
        value={String(stats.completed_count)}
        helper={`${formatCents(stats.total_refunded_cents, stats.currency)} refunded`}
        tone="success"
        icon={<CircleCheck className="h-5 w-5" aria-hidden="true" />}
      />
      <Card
        label="Refund rate"
        value={`${stats.refund_rate_percent.toFixed(2)}%`}
        helper="Refunds divided by gross sales"
        tone="navy"
        icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
      />
    </div>
  )
}
