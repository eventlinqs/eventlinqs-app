import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * InvitationCard - the launch-day sparse-rail device (2026-07-12).
 *
 * When a rail has real events but not enough to read full, these cards fill
 * the remaining track as INVITATIONS, not emptiness: the city is open, the
 * next slot is yours. They are deliberately distinct from event cards - no
 * photograph, the branded navy panel with a fine dashed gold keyline - so
 * nothing ever reads as a fake event (Law 1). They disappear automatically
 * as real inventory fills the rail (the fill count is derived from the real
 * event count, never stored).
 *
 * Affordance law: the whole card is one link and resolves 200.
 */

export type InvitationVariant = 'landscape' | 'square' | 'feature'
export type InvitationAngle = 'organiser' | 'performer'

const WIDTHS: Record<InvitationVariant, string> = {
  feature: 'w-[300px] shrink-0 snap-start sm:w-[420px]',
  square: 'w-[180px] shrink-0 snap-start sm:w-[200px]',
  landscape: 'w-[240px] shrink-0 snap-start sm:w-[280px]',
}

interface Props {
  variant?: InvitationVariant
  angle?: InvitationAngle
  /** The rail's subject, lower case (e.g. "comedy", "music", "community"). */
  subject: string
  /** Where the invitation points. Defaults to the organiser landing. */
  href?: string
  /** When the rail supplies its own fixed-width cell, fill it instead. */
  fitParent?: boolean
}

export function InvitationCard({ variant = 'landscape', angle = 'organiser', subject, href = '/organisers', fitParent = false }: Props) {
  const heading =
    angle === 'performer'
      ? 'Performers, this stage is open'
      : `The next ${subject} night here is yours`
  const body =
    angle === 'performer'
      ? 'Get seen everywhere. Get booked and paid here.'
      : 'More is landing in Geelong and Melbourne. Be the first: post your event free.'
  const cta = angle === 'performer' ? 'Meet the artist tools' : 'Post your event'

  return (
    <Link
      href={href}
      prefetch={false}
      className={`${fitParent ? 'h-full w-full' : WIDTHS[variant]} group/invite flex min-h-[220px] flex-col justify-between overflow-hidden rounded-card border border-dashed border-[rgba(232,183,56,0.35)] p-5 transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(10,22,40,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]`}
      style={{
        background:
          'linear-gradient(150deg, #0A1628 0%, #101f38 55%, #0A1628 100%)',
      }}
    >
      <div>
        <p className="type-eyebrow font-display text-[var(--brand-accent)]">Open slot</p>
        <p className="mt-3 font-headline text-lg font-extrabold leading-snug tracking-[-0.01em] text-white">
          {heading}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/75">{body}</p>
      </div>
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-accent)]">
        {cta}
        <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-200 group-hover/invite:translate-x-0.5" />
      </p>
    </Link>
  )
}

/**
 * How many invitation cards a rail needs so its track reads full. Real
 * events always come first; invitations only top up a SPARSE rail (1 to 4
 * real events) and vanish entirely once five or more real events exist.
 * A zero-event rail keeps its own designed empty state instead.
 */
export function invitationFillCount(realCount: number): number {
  if (realCount === 0) return 0
  const MIN_FULL = 5
  return Math.max(0, Math.min(MIN_FULL - realCount, 3))
}
