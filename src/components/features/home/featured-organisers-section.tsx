/**
 * Featured Organisers section.
 *
 * Per docs/M5-DESIGN-SPEC.md / Information architecture (homepage,
 * position 4):
 *   3-4 verified organisers with their next event.
 *   Organiser avatar (1:1 circular), name, event count, next event card.
 *   Community-first signal.
 *
 * Implementation notes:
 *   - Avatars route through OrganiserAvatar (`@/components/media`) per
 *     docs/MEDIA-ARCHITECTURE.md §8. No raw <img>, no direct next/image.
 *   - Typography and spacing use M5 tokens only. Card hover uses
 *     --motion-quick via the .card-hover-transition utility class
 *     introduced for event-card.
 *   - Placeholder data carries an explicit caption mirroring the
 *     Cultural Calendar widget pattern. The component accepts an
 *     optional `organisers` prop so a future Supabase-backed query can
 *     drop in without API changes.
 */

import Link from 'next/link'
import { OrganiserAvatar } from '@/components/media'
import { SECTION_DEFAULT, CONTAINER } from '@/lib/ui/spacing'

export type FeaturedOrganiserNextEvent = {
  title: string
  date: string          // AU display string, already formatted, e.g. "5 July 2026"
  city: string
  href: string
}

export type FeaturedOrganiser = {
  id: string
  name: string
  handle: string        // organiser slug for /organisers/<handle>
  avatarSrc: string | null
  eventCount: number
  nextEvent: FeaturedOrganiserNextEvent | null
}

/**
 * PLACEHOLDER organiser set. Names are realistic-sounding for visual
 * review only. Real production data must come from the verified-organiser
 * registry once seeded; the caption on the section header surfaces this
 * status at runtime so the placeholder is unmissable.
 */
const PLACEHOLDER_ORGANISERS: FeaturedOrganiser[] = [
  {
    id: 'p-org-1',
    name: 'Naarm Music Collective',
    handle: 'naarm-music-collective',
    avatarSrc: null,
    eventCount: 12,
    nextEvent: {
      title: 'Winter Wax Series, Round 4',
      date: '14 June 2026',
      city: 'Melbourne',
      href: '/organisers/naarm-music-collective',
    },
  },
  {
    id: 'p-org-2',
    name: 'Western Sydney Sound',
    handle: 'western-sydney-sound',
    avatarSrc: null,
    eventCount: 8,
    nextEvent: {
      title: 'Afro House Sundowner',
      date: '21 June 2026',
      city: 'Sydney',
      href: '/organisers/western-sydney-sound',
    },
  },
  {
    id: 'p-org-3',
    name: 'Sunset Carnival Co.',
    handle: 'sunset-carnival-co',
    avatarSrc: null,
    eventCount: 5,
    nextEvent: {
      title: 'Long Weekend Carnival',
      date: '6 July 2026',
      city: 'Brisbane',
      href: '/organisers/sunset-carnival-co',
    },
  },
  {
    id: 'p-org-4',
    name: 'Perth Cultural Hub',
    handle: 'perth-cultural-hub',
    avatarSrc: null,
    eventCount: 6,
    nextEvent: {
      title: 'Lantern Festival Late',
      date: '28 June 2026',
      city: 'Perth',
      href: '/organisers/perth-cultural-hub',
    },
  },
]

function OrganiserCard({ organiser }: { organiser: FeaturedOrganiser }) {
  const { name, handle, avatarSrc, eventCount, nextEvent } = organiser
  return (
    <Link
      href={`/organisers/${handle}`}
      // Same M5 hover treatment as event-card: token-bound transform +
      // shadow transition under --motion-quick (.card-hover-transition).
      className="group card-hover-transition flex flex-col rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] hover:shadow-[0_4px_12px_rgba(10,22,40,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 motion-reduce:transition-none"
      style={{
        padding: 'var(--space-card-padding-x)',
      }}
    >
      {/* Avatar + identity row */}
      <div className="flex items-center" style={{ gap: 'var(--space-element-gap)' }}>
        <OrganiserAvatar src={avatarSrc} name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="type-h4 truncate text-[var(--text-primary)]">{name}</p>
          {/* Event count badge */}
          <p
            className="mt-1 inline-flex items-center rounded-full bg-[var(--surface-1)] px-2.5 py-1 text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--type-small)', fontWeight: 600 }}
          >
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </p>
        </div>
      </div>

      {/* Next event preview */}
      {nextEvent ? (
        <div
          className="mt-4 border-t border-[var(--surface-2)] pt-4"
          style={{ marginTop: 'var(--space-element-gap)', paddingTop: 'var(--space-element-gap)' }}
        >
          <p
            className="uppercase tracking-wider text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--type-micro)', fontWeight: 600 }}
          >
            Next event
          </p>
          <p
            className="mt-1 line-clamp-2 text-[var(--text-primary)]"
            style={{ fontSize: 'var(--type-body)', fontWeight: 600 }}
          >
            {nextEvent.title}
          </p>
          <p
            className="mt-1 text-[var(--text-secondary)] type-small"
            style={{ marginTop: 'var(--space-tight-gap)' }}
          >
            {nextEvent.date} · {nextEvent.city}
          </p>
        </div>
      ) : (
        <p
          className="mt-4 text-[var(--text-secondary)] type-small"
          style={{ marginTop: 'var(--space-element-gap)' }}
        >
          No upcoming event scheduled.
        </p>
      )}

      <span
        className="mt-4 inline-flex items-center gap-1 text-[var(--brand-accent-strong)] group-hover:underline"
        style={{ marginTop: 'var(--space-element-gap)', fontSize: 'var(--type-small)', fontWeight: 600 }}
      >
        View organiser
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M3 8 L11 8 M8 5 L11 8 L8 11" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      </span>
    </Link>
  )
}

export function FeaturedOrganisersSection({
  organisers = PLACEHOLDER_ORGANISERS,
}: {
  organisers?: FeaturedOrganiser[]
}) {
  if (organisers.length === 0) {
    // Empty-state - keep the section visible so the page still scrolls
    // the same. Production will replace with real verified-organiser data.
    return (
      <section aria-labelledby="featured-organisers-heading" className={`bg-[var(--canvas,_var(--background))] ${SECTION_DEFAULT}`}>
        <div className={CONTAINER}>
          <h2 id="featured-organisers-heading" className="type-h2 text-[var(--text-primary)]">
            Verified organisers
          </h2>
          <p className="mt-4 type-body text-[var(--text-secondary)]">
            Featured organisers will appear here as the platform grows.
          </p>
        </div>
      </section>
    )
  }
  return (
    <section
      aria-labelledby="featured-organisers-heading"
      className={`${SECTION_DEFAULT}`}
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className={CONTAINER}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              className="uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]"
              style={{ fontSize: 'var(--type-micro)', fontWeight: 600 }}
            >
              Verified organisers
            </p>
            <h2
              id="featured-organisers-heading"
              className="type-h2 mt-1 text-[var(--text-primary)]"
            >
              Communities behind the events
            </h2>
          </div>
          <Link
            href="/organisers"
            className="self-start text-[var(--brand-accent-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 sm:self-end"
            style={{ fontSize: 'var(--type-small)', fontWeight: 600 }}
          >
            See all organisers
          </Link>
        </div>

        {/* Grid: 4 cols desktop, 2 cols tablet, 1 col mobile.
         *  Gap matches --space-card-gap (24px) per spec spacing. */}
        <div
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gap: 'var(--space-card-gap)' }}
        >
          {organisers.slice(0, 4).map(o => (
            <OrganiserCard key={o.id} organiser={o} />
          ))}
        </div>

        {/* Placeholder caption - mirrors the Cultural Calendar widget
         *  pattern so the placeholder status is visible at runtime. */}
        <p
          className="mt-6 text-[var(--text-secondary)]"
          style={{ fontSize: 'var(--type-micro)' }}
        >
          Placeholder content for founder review. Real verified-organiser
          data will populate from the platform registry when seeded.
        </p>
      </div>
    </section>
  )
}
