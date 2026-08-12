import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

export function formatCents(cents: number, currency: string): string {
  const c = (currency ?? 'aud').toUpperCase()
  const value = (cents ?? 0) / 100
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: c,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${c} ${value.toFixed(2)}`
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Pending schedule'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Pending schedule'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    // A payout date is not an event's, so it takes the PLATFORM zone. Without
    // one this formatted in the runtime zone: UTC on the server, the
    // organiser's in the browser, so "when do I get paid" both mismatched on
    // hydration and read as the wrong day either side of midnight.
    timeZone: PLATFORM_TIME_ZONE,
  }).format(d)
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: PLATFORM_TIME_ZONE,
  }).format(d)
}
