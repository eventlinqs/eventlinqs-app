import Link from 'next/link'
import { EventCardMedia } from '@/components/media'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getMomentsAhead, formatMomentDates } from '@/lib/cultural-moments/get-moments-ahead'
import { getCulture } from '@/lib/cultures/data'
import type { CulturalMoment } from '@/lib/cultural-moments/calendar'
import { SnapRail } from '@/components/ui/snap-rail'

/**
 * CulturalMomentsRail - upcoming community moments as a plain, separated-card
 * scroll rail (was a dark bento with text over the image). Each card is the
 * standard separated shape: a clean standalone image, then below it the date
 * label, the moment name, and a one-line blurb. The whole card links through
 * to events tied to that moment.
 *
 * Still unique to EventLinqs: no other platform surfaces named community
 * moments with their dates and a per-community browse link. But it now reads
 * like every other rail on the page - no monotony-breaking bento, no text
 * burned onto photography.
 */
export async function CulturalMomentsRail() {
  const moments = getMomentsAhead(8)
  if (moments.length === 0) return null

  const images = await Promise.all(
    moments.map(m => (m.culture ? getCultureHeroPhoto(m.culture) : Promise.resolve(null))),
  )

  return (
    <section aria-labelledby="moments-rail-heading" className="border-t border-ink-200 bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
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

function MomentCard({ moment, image }: { moment: CulturalMoment; image: string | null }) {
  const culture = moment.culture ? getCulture(moment.culture) : null

  return (
    <Link
      href={`/events?moment=${moment.slug}`}
      prefetch={false}
      data-moment-slug={moment.slug}
      className={[
        `plausible-event-name=cultural_moment_click`,
        `plausible-event-moment=${moment.slug}`,
        'group w-[280px] shrink-0 snap-start',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 rounded-xl',
      ].join(' ')}
    >
      {/* Clean standalone image - no text over it. */}
      <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-ink-200">
        {image ? (
          <EventCardMedia
            src={image}
            alt={moment.name}
            variant="rail"
            className="transition-transform duration-500 group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',
            }}
          />
        )}
      </div>

      {/* Details below the image. */}
      <div className="pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-accent-strong)]">
          {formatMomentDates(moment)}
        </p>
        <h3 className="mt-1 font-headline text-lg font-bold leading-tight tracking-tight text-ink-900">
          {moment.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-600">{moment.blurb}</p>
        {culture ? (
          <span className="mt-2 inline-block text-xs font-semibold text-[var(--brand-accent-strong)]">
            Browse {culture.displayName} &rsaquo;
          </span>
        ) : null}
      </div>
    </Link>
  )
}
