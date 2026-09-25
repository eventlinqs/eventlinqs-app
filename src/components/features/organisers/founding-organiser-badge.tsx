import { FOUNDING_BADGE_LABEL } from '@/lib/organisers/founding-badge'

/**
 * "Founding Organiser", on the public surfaces, in ONE implementation.
 *
 * Close-out FO1 asks for the words on the organiser's own page and on their
 * event pages. Two surfaces means two chances to invent two slightly different
 * pills, so the mark lives here and both render it.
 *
 * COLOUR. Gold on a light surface, which under the Design system means
 * `--brand-accent-strong` for the text (gold-400 fails 4.5:1 on white and is
 * reserved for dark surfaces and focus rings) over a 15 per cent tint of
 * `--brand-accent`. No new colour is introduced; both tokens are already in
 * globals.css and this is the same pair the empty-state and know-before-you-go
 * marks already use.
 *
 * The label is imported rather than typed, so the guard that holds the offer
 * copy to the configuration has exactly one string to check.
 */
export function FoundingOrganiserBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-accent)]/15 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-accent-strong)] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M12 2.6l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9l6.1-.8L12 2.6z" />
      </svg>
      {FOUNDING_BADGE_LABEL}
    </span>
  )
}
