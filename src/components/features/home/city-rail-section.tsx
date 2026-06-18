import { createPublicClient } from '@/lib/supabase/public-client'
import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { CityTile } from '@/components/features/home/cards'
import { getCityPhoto } from '@/lib/images/city-photo'
import { getSpineCity } from '@/lib/images/spine'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP, CITY_TILE_CELL } from '@/lib/ui/rhythm'
import { CITY_TILES, LOCAL_CITY_SVG } from '@/lib/events/home-queries'

interface Props {
  nowIso: string
}

export async function CityRailSection({ nowIso }: Props) {
  const supabase = createPublicClient()

  const cityCounts = await Promise.all(
    CITY_TILES.map(async t => {
      // Spine-first: the licensed city photo is the slot image. Pexels then the
      // local SVG remain the fallback chain for any city without a spine slot.
      const spine = getSpineCity(t.slug)
      const [countResult, photo] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true })
          .eq('status', 'published').eq('visibility', 'public')
          .gte('start_date', nowIso).ilike('venue_city', `%${t.slug}%`),
        spine ? Promise.resolve(null) : getCityPhoto(t.slug),
      ])
      const localSvg = LOCAL_CITY_SVG.has(t.slug)
        ? `/cities/${t.slug}.svg`
        : '/cities/_fallback.svg'
      return {
        ...t,
        count: countResult.count ?? 0,
        imageSrc: spine ? spine.src : (photo ?? localSvg),
        objectPosition: spine?.objectPosition,
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
      className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}
    >
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow="By city"
          title="Browse by city"
          headingId="cities-heading"
          headerLink={{ href: '/cities', label: 'See all cities' }}
          railLabel="Events by city"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          {/* Variant B: cities get a distinct, larger destination treatment -
              wider than event cards so they read as places, not listings. */}
          {liveCities.map(c => (
            <div key={c.slug} className={CITY_TILE_CELL}>
              <CityTile
                city={{
                  href: `/city/${c.slug}`,
                  imageSrc: c.imageSrc,
                  alt: c.city,
                  name: c.city,
                  metaLabel: `${c.count} ${c.count === 1 ? 'event' : 'events'}`,
                  objectPosition: c.objectPosition,
                }}
              />
            </div>
          ))}
        </SnapRail>
      </Reveal>
    </section>
  )
}
