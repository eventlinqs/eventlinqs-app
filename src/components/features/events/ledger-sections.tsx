import Link from 'next/link'
import type { ReactNode } from 'react'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { WhatsOnDirectory } from '@/components/features/events/whats-on-directory'
import type { DirectoryDay } from '@/lib/events/whats-on-directory'
import { directoryChips } from '@/lib/events/whats-on-directory'

/**
 * The two sections of Lawal's 'layers' sample (1 November 2026, 11:01): Featured this week, a row of Ledger cards,
 * then What's on, the day grouped directory. Each section is a gold eyebrow over its heading with one link at the
 * right; the heading is the rail heading of the one scale (.type-rail-heading).
 */
function LedgerSection({
  eyebrow,
  title,
  link,
  ariaLabel,
  children,
}: {
  eyebrow: string
  title: string
  link?: { href: string; label: string }
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <section aria-label={ariaLabel} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-11 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">
            {eyebrow}
          </p>
          <h2 className="type-rail-heading mt-1.5 font-headline tracking-tight text-[var(--text-primary)]">{title}</h2>
        </div>
        {link ? (
          <Link
            href={link.href}
            className="hidden min-h-11 shrink-0 items-center whitespace-nowrap font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-[6px] hover:decoration-[var(--brand-accent)] md:inline-flex"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
      {link ? (
        <Link
          href={link.href}
          className="mt-4 inline-flex min-h-11 items-center font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-[6px] md:hidden"
        >
          {link.label}
        </Link>
      ) : null}
    </section>
  )
}

/** Left out entirely when fewer than two nights qualify (the caller passes [] then). */
export function FeaturedThisWeek({ events, link }: { events: readonly EventCardData[]; link?: { href: string; label: string } }) {
  if (events.length === 0) return null
  return (
    <LedgerSection eyebrow="Featured this week" title="Worth leaving the house for" ariaLabel="Featured this week" link={link}>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard event={e} variant="grid-one-two-four" />
          </li>
        ))}
      </ul>
    </LedgerSection>
  )
}

/** Nothing to list renders nothing (Law 1: never an empty band). */
export function WhatsOnSection({
  days,
  eyebrow,
  title,
  link,
  chips = true,
}: {
  days: readonly DirectoryDay[]
  eyebrow: string
  title: string
  link?: { href: string; label: string }
  chips?: boolean
}) {
  if (days.length === 0) return null
  return (
    <LedgerSection eyebrow={eyebrow} title={title} ariaLabel={title} link={link}>
      <WhatsOnDirectory days={days} chips={chips ? directoryChips(days) : []} />
    </LedgerSection>
  )
}
