import { createPublicClient } from '@/lib/supabase/public-client'
import { SnapRail } from '@/components/ui/snap-rail'
import { CityRailTile } from '@/components/features/events/city-rail-tile'
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

  return (
    <section
      aria-labelledby="cities-heading"
      className={`bg-canvas ${SECTION_DEFAULT} [content-visibility:auto] [contain-intrinsic-size:auto_600px]`}
    >
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="By city"
          title="Browse by city"
          headingId="cities-heading"
          railLabel="Events by city"
          containerBg="canvas"
        >
          {cityCounts.map(c => (
            <CityRailTile
              key={c.slug}
              city={c.city}
              slug={c.slug}
              eventCount={c.count}
              imageSrc={c.imageSrc}
            />
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
