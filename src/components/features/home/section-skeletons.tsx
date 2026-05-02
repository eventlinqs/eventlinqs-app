import { CONTAINER, SECTION_DEFAULT, SECTION_TIGHT } from '@/lib/ui/spacing'

function CardSkeleton() {
  return (
    <div
      className="w-[280px] shrink-0 snap-start overflow-hidden rounded-xl bg-ink-100"
      aria-hidden
    >
      <div className="h-40 bg-ink-200/60 animate-pulse" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-ink-200/60 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-ink-200/40 animate-pulse" />
      </div>
    </div>
  )
}

function CityCardSkeleton() {
  return (
    <div
      className="aspect-[4/5] w-[220px] shrink-0 snap-start overflow-hidden rounded-xl bg-ink-100 animate-pulse sm:w-[280px]"
      aria-hidden
    />
  )
}

function RailHeaderSkeleton({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500/40" aria-hidden />
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700/60">
            {eyebrow}
          </p>
          <h2 className="font-display text-2xl font-bold text-ink-900/70 sm:text-3xl">
            {title}
          </h2>
        </div>
      </div>
    </div>
  )
}

export function ThisWeekSkeleton() {
  return (
    <section aria-label="This week - loading" className={`bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <RailHeaderSkeleton eyebrow="This week" title="What's happening near you" />
        <div className="mt-6 flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function CulturalPicksSkeleton() {
  return (
    <section aria-label="Cultural picks - loading" className={`bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <RailHeaderSkeleton eyebrow="Made for every culture" title="Cultural picks" />
        <div className="mt-6 flex gap-2 overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className="h-8 w-24 shrink-0 rounded-full bg-ink-100 animate-pulse"
              aria-hidden
            />
          ))}
        </div>
        <div className="mt-4 flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function LiveVibeSkeleton() {
  return (
    <section aria-label="Live vibe - loading" className="bg-ink-950 py-16">
      <div className="flex gap-4 overflow-hidden px-4">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="h-36 w-60 shrink-0 rounded-xl bg-ink-800/60 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </section>
  )
}

export function CityRailSkeleton() {
  return (
    <section
      aria-label="Browse by city - loading"
      className={`bg-canvas ${SECTION_DEFAULT}`}
    >
      <div className={CONTAINER}>
        <RailHeaderSkeleton eyebrow="By city" title="Browse by city" />
        <div className="mt-6 flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <CityCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
