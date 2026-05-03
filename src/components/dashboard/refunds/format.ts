export function formatCents(cents: number, currency: string): string {
  const code = (currency ?? 'aud').toUpperCase()
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
    }).format(cents / 100)
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Intl.DateTimeFormat('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso))
  } catch {
    return '-'
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Intl.DateTimeFormat('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return '-'
  }
}

const REASON_LABELS: Record<string, string> = {
  requested_by_buyer: 'Buyer requested',
  duplicate: 'Duplicate charge',
  fraudulent: 'Fraudulent',
  event_cancelled: 'Event cancelled',
  cannot_attend: 'Cannot attend',
  other: 'Other',
}
export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'Unknown'
  return REASON_LABELS[reason] ?? reason
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}
