import Link from 'next/link'
import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { EventCardMedia } from '@/components/media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { getSpineSceneForSound } from '@/lib/images/spine'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP, SCENE_TILE_CELL } from '@/lib/ui/rhythm'

/**
 * SoundsRail - the genre half of the old combined scene rail (Scenes V2 split).
 *
 * The community/heritage half now lives in its own higher-placed CommunityRail
 * (the moat). This rail carries only the SOUNDS family (genres), so neither
 * dilutes the other. Genres link to the filtered events view as an interim
 * (resolves 200); square B tiles, B gap, contained, SECTION_RAIL rhythm, and the
 * shared rail control system - all inherited via SnapRail. A normal ink divider
 * (the gold accent is reserved for the community moat).
 */

interface Sound {
  slug: string
  label: string
  href: string
}

const ev = (q: string) => `/events?q=${encodeURIComponent(q)}`

// SOUNDS family (genres), founder order (CLAUDE.md Scene layer V2).
const SOUNDS: Sound[] = [
  { slug: 'electronic', label: 'Electronic & Dance', href: ev('electronic dance') },
  { slug: 'country', label: 'Country', href: ev('country') },
  { slug: 'indie-rock', label: 'Indie & Rock', href: ev('indie rock') },
  { slug: 'hip-hop', label: 'Hip-Hop & RnB', href: ev('hip hop rnb') },
  { slug: 'pop', label: 'Pop', href: ev('pop') },
  { slug: 'folk-acoustic', label: 'Folk & Acoustic', href: ev('folk acoustic') },
  { slug: 'blues-roots', label: 'Blues & Roots', href: ev('blues roots') },
  { slug: 'afrobeats', label: 'Afrobeats & Amapiano', href: ev('afrobeats amapiano') },
  { slug: 'latin', label: 'Latin', href: ev('latin') },
  { slug: 'caribbean', label: 'Caribbean & Dancehall', href: ev('caribbean dancehall') },
  { slug: 'jazz-soul', label: 'Jazz & Soul', href: ev('jazz soul') },
  { slug: 'metal', label: 'Metal & Hardcore', href: ev('metal hardcore') },
]

const SURFACE =
  'group flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] ' +
  'shadow-[0_1px_3px_rgba(10,22,40,0.05)] transition-all duration-200 ease-out ' +
  'hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(10,22,40,0.13)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'

const IMG_MOTION =
  'transition-transform duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100'

async function toTile(sound: Sound) {
  // Spine-first: the licensed scene photo is the slot image. Pexels stays the
  // fallback only when a sound has no spine slot yet.
  const spine = getSpineSceneForSound(sound.slug)
  if (spine) {
    return { ...sound, image: spine.src, alt: `${sound.label} events`, objectPosition: spine.objectPosition }
  }
  const photo = await getCategoryPhoto(sound.slug)
  return { ...sound, image: photo.src, alt: photo.alt ?? `${sound.label} events`, objectPosition: undefined as string | undefined }
}

function SoundTile({ tile }: { tile: Sound & { image: string; alt: string; objectPosition?: string } }) {
  return (
    <div className={SCENE_TILE_CELL}>
      <Link href={tile.href} prefetch={false} className={SURFACE}>
        <div className="relative aspect-square overflow-hidden bg-[var(--surface-1)]">
          <EventCardMedia src={tile.image} alt={tile.alt} variant="rail" objectPosition={tile.objectPosition} className={IMG_MOTION} />
        </div>
        <div className="p-3">
          <h3 className="font-headline text-sm font-bold leading-snug tracking-tight text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--brand-accent-strong)]">
            {tile.label}
          </h3>
        </div>
      </Link>
    </div>
  )
}

export async function SoundsRail() {
  const tiles = await Promise.all(SOUNDS.map(toTile))

  return (
    <section aria-label="Browse by sound" className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}>
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow="Find your sound"
          title="Sounds"
          headerLink={{ href: '/events', label: 'Browse all' }}
          railLabel="Genres and sounds"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          {tiles.map(tile => (
            <SoundTile key={tile.slug} tile={tile} />
          ))}
        </SnapRail>
      </Reveal>
    </section>
  )
}
