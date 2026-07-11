import { getCityHeroPhoto } from '@/lib/images/city-photo'

/**
 * Shared compact hero band for the marketplace surfaces (/gigs, /artists):
 * real photography with the platform bottom-up navy scrim, gold eyebrow, and
 * restrained display type, mirroring the discovery-surface hero language.
 * Never a bare band: photo resolves through the licensed spine with the
 * navy gradient as the no-photo fallback.
 */
export async function MarketplaceHero({
  eyebrow,
  title,
  subtitle,
  citySlug = 'melbourne',
}: {
  eyebrow: string
  title: string
  subtitle: string
  citySlug?: string
}) {
  const photo = await getCityHeroPhoto(citySlug)

  return (
    <section className="relative overflow-hidden" aria-labelledby="marketplace-hero-heading">
      <div className="relative min-h-[280px] w-full sm:min-h-[320px]">
        {photo ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${photo})` }}
            aria-hidden
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 55%, rgb(10,22,40) 100%)',
            }}
            aria-hidden
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.45) 0%, rgba(10,22,40,0.60) 55%, rgba(10,22,40,0.92) 100%)',
          }}
        />
        <div className="relative z-10 mx-auto flex min-h-[280px] max-w-7xl flex-col justify-end px-4 pb-8 pt-24 sm:min-h-[320px] sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            {eyebrow}
          </p>
          <h1
            id="marketplace-hero-heading"
            className="mt-2 max-w-3xl font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-4xl"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/85 sm:text-base">
            {subtitle}
          </p>
        </div>
      </div>
    </section>
  )
}
