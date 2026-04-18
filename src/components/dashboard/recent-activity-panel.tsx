import Link from 'next/link'
import { Activity, CheckCircle2, RefreshCw, Ticket } from 'lucide-react'

export type ActivityItem = {
  id: string
  type: 'order_confirmed' | 'order_refunded' | 'ticket_purchased' | 'event_published'
  title: string
  subtitle: string
  occurredAt: string
  href?: string
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function iconFor(type: ActivityItem['type']) {
  switch (type) {
    case 'order_confirmed':
      return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
    case 'order_refunded':
      return <RefreshCw className="h-4 w-4 text-warning" aria-hidden="true" />
    case 'ticket_purchased':
      return <Ticket className="h-4 w-4 text-gold-600" aria-hidden="true" />
    case 'event_published':
      return <Activity className="h-4 w-4 text-info" aria-hidden="true" />
  }
}

export function RecentActivityPanel({ activity }: { activity: ActivityItem[] }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white">
      <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">Recent activity</h2>
      </header>

      {activity.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink-100">
            <Activity className="h-5 w-5 text-ink-400" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-900">No activity yet</p>
          <p className="mt-1 text-xs text-ink-600">
            Activity will appear here once your events go live.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-ink-100">
          {activity.map((item) => {
            const inner = (
              <div className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100">
                  {iconFor(item.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{item.title}</p>
                  <p className="truncate text-xs text-ink-600">{item.subtitle}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-400">{relative(item.occurredAt)}</span>
              </div>
            )
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="block transition-colors hover:bg-ink-100/60">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
