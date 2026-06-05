import Link from 'next/link'
import { SnapRail } from '@/components/ui/snap-rail'
import { EventCardMedia } from '@/components/media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'

/**
 * SceneRail - the genre and scene discovery rail. It surfaces the real
 * scene landing pages (/categories/[slug]) early on the homepage so the
 * page reads as a blend of music, scenes and community rather than a flat
 * list of dated events.
 *
 * Every entry routes to a landing page that genuinely exists (the seven
 * Tier-1 hero categories in src/lib/hero-categories.ts), so the rail never
 * links into a 404. Imagery comes from the category photo pipeline; a
 * missing key falls back to a branded placeholder, never a broken image.
 *
 * Tiles follow the locked card rule: the photograph stands alone and the
 * label plus blurb sit in the white card body below it. The hero is the
 * only surface allowed to paint text on a photo.
 */

interface Scene {
  slug: string
  label: string
  blurb: string
}

// Founder-locked order and copy. Community-first voice, Australian English,
// no em-dashes, no exclamation marks.
const SCENES: Scene[] = [
  { slug: 'afrobeats', label: 'Afrobeats', blurb: 'West African pop, Lagos to your city.' },
  { slug: 'amapiano', label: 'Amapiano', blurb: 'South African log-drum house.' },
  { slug: 'gospel', label: 'Gospel', blurb: 'Worship and choir nights, gathered.' },
  { slug: 'caribbean', label: 'Caribbean', blurb: 'Soca, dancehall and reggae fetes.' },
  { slug: 'owambe', label: 'Owambe', blurb: 'Nigerian celebrations, full colour.' },
  {
    slug: 'heritage-and-independence',
    label: 'Heritage & Independence',
    blurb: 'Galas and festivals that anchor community.',
  },
  { slug: 'networking', label: 'Business & Networking', blurb: 'Conferences, summits and founder mixers.' },
]

const SURFACE =
  'group flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] ' +
  'shadow-[0_1px_3px_rgba(10,22,40,0.05)] transition-all duration-200 ease-out ' +
  'hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(10,22,40,0.13)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'

export async function SceneRail() {
  const tiles = await Promise.all(
    SCENES.map(async scene => {
      const photo = await getCategoryPhoto(scene.slug)
      return { ...scene, image: photo.src, alt: photo.alt ?? `${scene.label} events` }
    }),
  )

  return (
    <section aria-label="Browse by scene" className={`border-t border-ink-200 bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="Find your scene"
          title="Scenes and sounds"
          headerLink={{ href: '/cultures', label: 'View all' }}
          railLabel="Scenes and sounds"
          containerBg="canvas"
        >
          {tiles.map(tile => (
            <div key={tile.slug} className="w-[220px] shrink-0 snap-start sm:w-[248px]">
              <Link href={`/categories/${tile.slug}`} prefetch={false} className={SURFACE}>
                <div className="relative aspect-[3/2] overflow-hidden bg-[var(--surface-1)]">
                  <EventCardMedia
                    src={tile.image}
                    alt={tile.alt}
                    variant="card"
                    className="transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-headline text-lg font-bold leading-snug tracking-tight text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--brand-accent-strong)]">
                    {tile.label}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{tile.blurb}</p>
                </div>
              </Link>
            </div>
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
