import { createPublicClient } from '@/lib/supabase/public-client'
import { SnapRail } from '@/components/ui/snap-rail'
import { CityTile } from '@/components/features/home/cards'
import { getCityPhoto } from '@/lib/images/city-photo'
import { CONTAINER, SECTION_DEFAULT } from '@/lib/ui/spacing'
import { CITY_TILES, LOCAL_CITY_SVG } from '@/lib/events/home-queries'

interface Props {
  nowIso: string
}

export async function CityRailSection({ nowIso }: Props) {
  const supabase = createPublicClient()

  const cityCounts = await Promise.all(
    CITY_TILES.map(async t => {
      const [countResult, photo] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true })
          .eq('status', 'published').eq('visibility', 'public')
          .gte('start_date', nowIso).ilike('venue_city', `%${t.slug}%`),
        getCityPhoto(t.slug),
      ])
      const localSvg = LOCAL_CITY_SVG.has(t.slug)
        ? `/cities/${t.slug}.svg`
        : '/cities/_fallback.svg'
      return {
        ...t,
        count: countResult.count ?? 0,
        imageSrc: photo ?? localSvg,
      }
    }),
  )

  // Batch 11.0 fix: NEVER render a `Coming soon` tile as primary city
  // surface (memory item 25). Cities with zero upcoming events are
  // filtered out of the rail entirely so it surfaces only real
  // discovery value (Sydney, Melbourne, Brisbane during friends-launch).
  // Zero-event cities re-enter the rail automatically the moment a
  // published event lands at their venue_city. If the filter strips the
  // rail to zero tiles the section bails out instead of rendering an
  // empty rail header.
  const liveCities = cityCounts.filter(c => c.count > 0)
  if (liveCities.length === 0) return null

  return (
    <section
      aria-labelledby="cities-heading"
      className={`border-t border-ink-200 bg-canvas ${SECTION_DEFAULT} [content-visibility:auto] [contain-intrinsic-size:auto_600px]`}
    >
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="By city"
          title="Browse by city"
          headingId="cities-heading"
          headerLink={{ href: '/cities', label: 'See all cities' }}
          railLabel="Events by city"
          containerBg="canvas"
        >
          {liveCities.map(c => (
            <div key={c.slug} className="w-[240px] shrink-0 snap-start sm:w-[280px]">
              <CityTile
                city={{
                  href: `/city/${c.slug}`,
                  imageSrc: c.imageSrc,
                  alt: c.city,
                  name: c.city,
                  metaLabel: `${c.count} ${c.count === 1 ? 'event' : 'events'}`,
                }}
              />
            </div>
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
