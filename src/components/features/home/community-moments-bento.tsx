import Link from 'next/link'
import { EventCardMedia } from '@/components/media'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { getMomentsAhead, formatMomentDates } from '@/lib/community-moments/get-moments-ahead'
import { getCommunity } from '@/lib/communities/data'
import type { CommunityMoment } from '@/lib/community-moments/calendar'
import { SnapRail } from '@/components/ui/snap-rail'
import { CONTAINER } from '@/lib/ui/spacing'

/**
 * CommunityMomentsRail - upcoming community moments as a plain separated-card
 * rail (was a dark bento with text over the image). Clean image on top, then
 * the date, the moment name, and a one-line blurb below. The whole card is
 * one link. Reads like every other rail.
 */
export async function CommunityMomentsRail() {
  const moments = getMomentsAhead(8)
  if (moments.length === 0) return null

  const images = await Promise.all(
    moments.map(m => (m.community ? getCommunityHeroPhoto(m.community) : Promise.resolve(null))),
  )

  return (
    <section aria-labelledby="moments-rail-heading" className="border-t border-ink-200 bg-canvas py-10 sm:py-12">
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="On the calendar"
          title="Community moments ahead"
          headingId="moments-rail-heading"
          railLabel="Community moments"
        >
          {moments.map((m, idx) => (
            <MomentCard key={m.slug} moment={m} image={images[idx] ?? null} />
          ))}
        </SnapRail>
      </div>
    </section>
  )
}

function MomentCard({ moment, image }: { moment: CommunityMoment; image: string | null }) {
  const community = moment.community ? getCommunity(moment.community) : null
  return (
    <Link
      href={`/events?moment=${moment.slug}`}
      prefetch={false}
      data-moment-slug={moment.slug}
      className={[
        `plausible-event-name=community_moment_click`,
        `plausible-event-moment=${moment.slug}`,
        'group w-[240px] shrink-0 snap-start sm:w-[280px]',
        'rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2',
      ].join(' ')}
    >
      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-1)]">
        {image ? (
          <EventCardMedia
            src={image}
            alt={moment.name}
            variant="rail"
            className="transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)' }}
          />
        )}
      </div>
      <div className="pt-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
          {formatMomentDates(moment)}
        </p>
        <h3 className="mt-1 font-headline text-lg font-bold leading-snug tracking-tight text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--brand-accent-strong)]">
          {moment.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{moment.blurb}</p>
        {community ? (
          <span className="mt-2 inline-block text-xs font-semibold text-[var(--brand-accent-strong)]">
            Browse {community.displayName} &rsaquo;
          </span>
        ) : null}
      </div>
    </Link>
  )
}
