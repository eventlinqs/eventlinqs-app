import Link from 'next/link'
import {
  Clock,
  MapPin,
  QrCode,
  RefreshCcw,
  Accessibility,
  IdCard,
} from 'lucide-react'
import { SectionHeader } from '@/components/ui/SectionHeader'

/**
 * Know before you go: the practical answers a buyer needs on the night, in
 * one scannable card. Every competitor scatters these down the page
 * (Ticketek buries them in a compliance wall above the artist story); we
 * compile them from data the platform already holds and NEVER invent: a row
 * renders only when the platform truly knows the answer.
 */

export interface KnowBeforeYouGoProps {
  startLabel: string
  timezone: string
  venueName: string | null
  fullAddress: string | null
  isVirtual: boolean
  ageMin: number | null
  hasAccessibleSeats: boolean
  isFree: boolean
}

interface Row {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}

export function KnowBeforeYouGo({
  startLabel,
  timezone,
  venueName,
  fullAddress,
  isVirtual,
  ageMin,
  hasAccessibleSeats,
  isFree,
}: KnowBeforeYouGoProps) {
  const rows: Row[] = []

  rows.push({
    icon: Clock,
    label: 'When',
    value: (
      <>
        {startLabel}
        <span className="text-ink-400"> ({timezone.replace('_', ' ')} time)</span>
      </>
    ),
  })

  if (isVirtual) {
    rows.push({
      icon: MapPin,
      label: 'Where',
      value: 'Online event. Your joining link arrives with your ticket.',
    })
  } else if (venueName || fullAddress) {
    rows.push({
      icon: MapPin,
      label: 'Getting there',
      value: (
        <>
          {[venueName, fullAddress].filter(Boolean).join(', ')}
          {fullAddress && (
            <>
              {' '}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venueName, fullAddress].filter(Boolean).join(', '))}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900"
              >
                Open in Maps
              </a>
            </>
          )}
        </>
      ),
    })
  }

  rows.push({
    icon: QrCode,
    label: 'At the door',
    value:
      'Your QR ticket lives in your email and your account. Show it on your phone; each QR admits one person.',
  })

  if (ageMin !== null) {
    rows.push({
      icon: IdCard,
      label: 'Age',
      value: `${ageMin}+ event. Bring photo ID.`,
    })
  }

  if (hasAccessibleSeats) {
    rows.push({
      icon: Accessibility,
      label: 'Accessible seating',
      value:
        'This event has designated accessible and companion seats: look for the marked seats on the map.',
    })
  }

  rows.push({
    icon: RefreshCcw,
    label: 'If plans change',
    value: (
      <>
        {isFree
          ? 'Free registrations can be released any time so someone else can take your spot.'
          : 'Cancelled events are refunded automatically to your original payment method.'}{' '}
        <Link
          href="/legal/refunds"
          className="font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900"
        >
          Refund policy
        </Link>
      </>
    ),
  })

  return (
    <div className="mt-10">
      <SectionHeader eyebrow="The practical bits" title="Know before you go" size="sm" />
      <dl className="mt-5 divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
        {rows.map(row => (
          <div key={row.label} className="flex items-start gap-4 px-5 py-4">
            <span
              aria-hidden
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)] text-[var(--brand-accent-strong)]"
            >
              <row.icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <dt className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-ink-900">
                {row.label}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-600">{row.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}
