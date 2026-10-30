import {
  QrCode,
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
 *
 * EACH FACT ONCE (the PROJECT MANAGER's 13:10 of 30 October 2026). This card
 * used to restate the date (the hero states it), the address (the Where card
 * states it) and the money-back terms (the policy block below states them),
 * which is how production read the date three times and those terms twice. It now carries
 * only what nothing else on the page says, and renders nothing when that is
 * nothing. Its door row is our own ticket's and is asked for by the page
 * (src/lib/events/event-page-promises.ts): an outside night never promises a
 * ticket EventLinqs does not issue. Held by the guard
 * event-page-each-fact-once.
 */

export interface KnowBeforeYouGoProps {
  /** True only where EventLinqs issues the ticket (eventPagePromises). */
  qrTicket: boolean
  ageMin: number | null
  hasAccessibleSeats: boolean
}

interface Row {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}

export function KnowBeforeYouGo({
  qrTicket,
  ageMin,
  hasAccessibleSeats,
}: KnowBeforeYouGoProps) {
  const rows: Row[] = []

  if (qrTicket) {
    rows.push({
      icon: QrCode,
      label: 'At the door',
      value:
        'Your QR ticket lives in your email and your account. Show it on your phone; each QR admits one person.',
    })
  }

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

  if (rows.length === 0) return null

  return (
    <div className="mt-10">
      <SectionHeader eyebrow="The practical bits" title="Know before you go" size="sm" />
      <dl className="mt-5 divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
        {rows.map(row => (
          <div key={row.label} className="px-5 py-4">
            <dt className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)] text-[var(--brand-accent-strong)]"
              >
                <row.icon className="h-4.5 w-4.5" />
              </span>
              <span className="font-display text-sm font-bold uppercase tracking-[0.12em] text-ink-900">
                {row.label}
              </span>
            </dt>
            <dd className="type-measure mt-1 text-pretty pl-[3.25rem] text-sm leading-relaxed text-ink-600">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
