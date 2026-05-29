import Link from 'next/link'
import { EventCardMedia } from '@/components/media'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getMomentsAhead, formatMomentDates } from '@/lib/cultural-moments/get-moments-ahead'
import { getCulture } from '@/lib/cultures/data'
import type { CulturalMoment } from '@/lib/cultural-moments/calendar'

/**
 * CulturalMomentsBento (Batch 9.2) - upcoming cultural moments rendered
 * as a small bento (1 large + 3 medium = 4 moments visible) on the
 * homepage between the trending bento and the rails.
 *
 * Unique to EventLinqs: no other event platform surfaces cultural
 * moments by name with their dates and a per-culture browse link.
 *
 * Each card:
 *   - Photographic hero (Pexels via getCultureHeroPhoto using the moment's
 *     culture, falls back to a navy gradient)
 *   - Date or date-range badge top-left
 *   - Moment name as the card heading (white, large)
 *   - One-line blurb under the name
 *   - Culture chip linking to /culture/{slug} (only when a culture link
 *     exists on the moment - First Nations moments have no culture link
 *     because they don't map to a single culture taxonomy slot)
 *
 * Click on the body of the card scrolls into a dedicated /events filter
 * for that moment via `/events?moment={slug}` so attendees can find
 * events tied to the moment. The filter implementation lives in /events
 * (out of scope for 9.2; the link target is a stable shape so the
 * filter can be wired in 9.2.1 without a card-side rewrite).
 */
export async function CulturalMomentsBento() {
  const moments = getMomentsAhead(4)
  if (moments.length === 0) return null

  // Resolve the per-moment hero image in parallel (Pexels-cached for 7
  // days via the existing helper). null heroes fall back to the navy
  // gradient placeholder.
  const images = await Promise.all(
    moments.map(m => (m.culture ? getCultureHeroPhoto(m.culture) : Promise.resolve(null))),
  )

  return (
    <section
      aria-labelledby="moments-bento-heading"
      className="bg-canvas"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mb-6 max-w-2xl sm:mb-8">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
            On the calendar
          </p>
          <h2
            id="moments-bento-heading"
            className="type-h2 mt-1 font-display tracking-tight text-ink-900"
          >
            Community moments ahead
          </h2>
          <p className="mt-3 text-sm text-ink-600 sm:text-base">
            Plan around the celebrations that matter.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:[grid-template-rows:repeat(2,minmax(220px,1fr))]">
          {moments.map((m, idx) => (
            <MomentCard
              key={m.slug}
              moment={m}
              image={images[idx] ?? null}
              isFeatured={idx === 0}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface MomentCardProps {
  moment: CulturalMoment
  image: string | null
  isFeatured: boolean
}

function MomentCard({ moment, image, isFeatured }: MomentCardProps) {
  const culture = moment.culture ? getCulture(moment.culture) : null
  const titleSize = isFeatured
    ? 'text-2xl font-extrabold sm:text-3xl lg:text-4xl'
    : 'text-lg font-bold sm:text-xl'

  return (
    <Link
      href={`/events?moment=${moment.slug}`}
      prefetch={false}
      aria-label={`${moment.name}: ${moment.blurb}`}
      data-moment-slug={moment.slug}
      className={[
        `plausible-event-name=cultural_moment_click`,
        `plausible-event-moment=${moment.slug}`,
        'group relative block overflow-hidden rounded-2xl bg-ink-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
        isFeatured
          ? 'col-span-2 row-span-2 aspect-square sm:aspect-[4/3] lg:aspect-auto'
          : 'aspect-[4/5] sm:aspect-[5/4] lg:aspect-auto',
      ].join(' ')}
    >
      {image ? (
        <EventCardMedia
          src={image}
          alt={moment.name}
          variant={isFeatured ? 'bento-hero' : 'bento-supporting'}
          className="transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
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

      {/* Strong gradient mask for AA contrast across any photo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,22,40,0.0) 30%, rgba(10,22,40,0.65) 70%, rgba(10,22,40,0.92) 100%)',
        }}
      />

      {/* Date pill - top left (frosted gold) */}
      <span
        className="absolute left-3 top-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-navy-950)]"
        style={{
          background: 'rgba(232, 183, 56, 0.95)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {formatMomentDates(moment)}
      </span>

      {/* Bottom content */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <h3 className={`font-display text-white ${titleSize}`}>
          {moment.name}
        </h3>
        <p className={`mt-1 ${isFeatured ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'} font-medium text-white/85`}>
          {moment.blurb}
        </p>
        {culture ? (
          <span
            className="mt-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-accent)]"
            style={{
              background: 'rgba(10, 22, 40, 0.55)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(212, 164, 55, 0.35)',
            }}
          >
            Browse {culture.displayName} ›
          </span>
        ) : null}
      </div>
    </Link>
  )
}
