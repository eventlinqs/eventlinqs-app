import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP, CITY_TILE_CELL } from '@/lib/ui/rhythm'

/**
 * Loading skeletons for the streamed homepage rail sections.
 *
 * Zero-layout-shift law (Motion): each skeleton reserves the SAME vertical
 * rhythm, header-to-track gap, inter-card gap, and card footprint as the real
 * rail it stands in for, so the settle from skeleton to content never nudges
 * the page. The live rails use SECTION_RAIL (py-6 sm:py-8), a mt-3 header gap,
 * the RHYTHM_GAP track gap, and the same cell widths - so these must too.
 */

/** Shape-matched to the landscape event card (aspect-[16/10] image + body). */
function CardSkeleton() {
  return (
    <div
      className="flex w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] sm:w-[280px]"
      aria-hidden
    >
      <div className="aspect-[16/10] animate-pulse bg-ink-200/60" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3 w-16 animate-pulse rounded bg-ink-200/60" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-ink-200/60" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-ink-200/40" />
      </div>
    </div>
  )
}

/** Shape-matched to the CityTile (aspect-[3/2] image + name/meta row). */
function CityCardSkeleton() {
  return (
    <div
      className={`flex ${CITY_TILE_CELL} flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)]`}
      aria-hidden
    >
      <div className="aspect-[3/2] animate-pulse bg-ink-200/60" />
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-ink-200/60" />
        <div className="h-3 w-12 animate-pulse rounded bg-ink-200/40" />
      </div>
    </div>
  )
}

function RailHeaderSkeleton({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500/40" aria-hidden />
        <div>
          {/* Opacity removed: text-gold-700/60 produced #b7a46b on canvas
           *  #fafaf7 = 2.35:1, failing WCAG AA. Full text-gold-700 (#8B6A0E)
           *  gives 5.97:1 on canvas. Lighthouse desktop a11y regression fix. */}
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
            {eyebrow}
          </p>
          <h2 className="type-rail-heading font-headline uppercase tracking-tight text-ink-900/70">
            {title}
          </h2>
        </div>
      </div>
    </div>
  )
}

export function ThisWeekSkeleton() {
  return (
    <section aria-label="This week - loading" className={`bg-canvas ${SECTION_RAIL}`}>
      <div className={CONTAINER}>
        <RailHeaderSkeleton eyebrow="This week" title="What's happening near you" />
        <div className={`mt-3 flex ${RHYTHM_GAP} overflow-hidden`}>
          {[0, 1, 2, 3, 4].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function CommunityPicksSkeleton() {
  return (
    <section aria-label="Community picks - loading" className={`bg-canvas ${SECTION_RAIL}`}>
      <div className={CONTAINER}>
        <RailHeaderSkeleton eyebrow="Made for every community" title="Community picks" />
        <div className={`mt-3 flex ${RHYTHM_GAP} overflow-hidden`}>
          {[0, 1, 2, 3, 4].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function CityRailSkeleton() {
  return (
    <section aria-label="Browse by city - loading" className={`bg-canvas ${SECTION_RAIL}`}>
      <div className={CONTAINER}>
        <RailHeaderSkeleton eyebrow="By city" title="Browse by city" />
        <div className={`mt-3 flex ${RHYTHM_GAP} overflow-hidden`}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <CityCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
