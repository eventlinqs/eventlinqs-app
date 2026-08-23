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

/**
 * THREE angles, because a sparse rail asks for THREE invitation cards.
 *
 * `invitationFillCount` returns 3 for a rail carrying one real event, and until
 * 23 August 2026 there were only two angles, so the fill ran organiser,
 * performer, organiser and the first and third cards rendered word for word
 * identical, side by side, in the same rail. Nobody saw it because RAIL_MIN
 * hid every rail thin enough to need three invitations. ONE EVENT SHOWS THE
 * RAIL made that the commonest shape on a launch-stage homepage, so the
 * duplicate had to go (Law 1: nothing generic).
 *
 * The third angle is deliberately the ACQUISITION LOOP rather than a third way
 * of saying "post your event": inviting an organiser you already know is the
 * single biggest growth hack in the plan, and the rail is where a reader who
 * knows a promoter is standing.
 */
export type InvitationAngle = 'organiser' | 'performer' | 'referrer'

/**
 * The order a rail fills its invitation slots. Index 0 is the first card after
 * the real events, so the organiser ask always leads and the copy never
 * repeats within a single rail.
 */
export const INVITATION_ANGLE_ORDER: readonly InvitationAngle[] = [
  'organiser',
  'performer',
  'referrer',
]

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
  const COPY: Record<InvitationAngle, { heading: string; body: string; cta: string }> = {
    organiser: {
      heading: `The next ${subject} night here is yours`,
      body: 'EventLinqs is open right across Australia. Be the first here: post your event free.',
      cta: 'Post your event',
    },
    performer: {
      heading: 'Performers, this stage is open',
      body: 'Get seen everywhere. Get booked and paid here.',
      cta: 'Meet the artist tools',
    },
    referrer: {
      heading: `Know someone who runs ${subject} nights?`,
      body: 'Send them here. Listing is free, and they keep every attendee relationship they earn.',
      cta: 'Invite an organiser',
    },
  }
  const { heading, body, cta } = COPY[angle]

  /*
   * `self-stretch`, NOT `h-full`, on the rail-track branch.
   *
   * The rail track is a flex row with the default `align-items: stretch`, so a
   * card that says nothing about its own height is stretched to the height of
   * the tallest card in the line. That is what makes the bottom edge of a rail
   * flush. `h-full` is `height: 100%`, and a percentage height on a flex item
   * resolves against a parent whose height is `auto`, which is indefinite, so
   * it silently fell back to CONTENT height and these cards rendered about
   * 108px shorter than the event cards beside them.
   *
   * It was invisible until 23 August 2026 because RAIL_MIN hid every rail thin
   * enough to carry an invitation card in the first place. Removing that
   * threshold (ONE EVENT SHOWS THE RAIL) made the sparse rail the shape a
   * launch-stage homepage shows most often, and exposed the ragged edge with
   * it. Design system: uniform card dimensions within a rail.
   *
   * The `fitParent` branch keeps `h-full`, and correctly: there the parent IS a
   * fixed-size cell, so the percentage has something definite to resolve
   * against.
   */
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${fitParent ? 'h-full w-full' : `${WIDTHS[variant]} self-stretch`} group/invite flex min-h-[220px] flex-col justify-between overflow-hidden rounded-card border border-dashed border-[rgba(232,183,56,0.35)] p-5 transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(10,22,40,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]`}
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
