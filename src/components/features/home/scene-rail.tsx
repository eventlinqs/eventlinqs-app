import Link from 'next/link'
import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { EventCardMedia } from '@/components/media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import { RHYTHM_GAP, SCENE_TILE_CELL } from '@/lib/ui/rhythm'

/**
 * SceneRail - Scenes Architecture V2 (research-backed, founder-locked).
 *
 * Two families in ONE scrollable rail. Music and sound scenes lead (the
 * dominant ticketing demand: electronic/dance, country, rock, hip-hop and pop
 * are the largest festival + streaming genres, and Australia is the world's top
 * dance-music streaming nation), then community and culture scenes.
 *
 * Routing (interim): a tile links to its dedicated landing route where one
 * exists; otherwise it links to the filtered events view as an interim. Today
 * only First Nations has a dedicated culture landing; every other scene uses
 * the interim view and is flagged for the post-photos taxonomy mission (see
 * docs/benchmark/system-pass/REPORT.md). Imagery comes from the existing
 * category-photo pipeline (a licensed library replaces it later); a miss falls
 * back to the branded SVG, never a broken image.
 *
 * Tiles follow the locked card rule: the photograph stands alone and the label
 * sits in the card body below it.
 */

interface Scene {
  /** Photo lookup key for the interim imagery pipeline. */
  slug: string
  label: string
  /** Landing route where one exists, else the interim filtered events view. */
  href: string
  /** True when this links to a real landing page (not the interim view). */
  hasLanding?: boolean
}

const ev = (q: string) => `/events?q=${encodeURIComponent(q)}`

// Family 1: MUSIC AND SOUND SCENES (founder order).
const MUSIC_SCENES: Scene[] = [
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

// Family 2: COMMUNITY AND CULTURE SCENES (founder order).
const CULTURE_SCENES: Scene[] = [
  {
    slug: 'aboriginal-torres-strait-islander',
    label: 'First Nations',
    href: '/culture/aboriginal-torres-strait-islander',
    hasLanding: true,
  },
  { slug: 'south-asian', label: 'South Asian', href: ev('South Asian') },
  { slug: 'asian', label: 'Asian', href: ev('Asian') },
  { slug: 'pasifika', label: 'Pasifika & Maori', href: ev('Pasifika Maori') },
  { slug: 'mediterranean', label: 'Mediterranean', href: ev('Mediterranean') },
  { slug: 'pride', label: 'Pride', href: ev('Pride') },
  { slug: 'faith-worship', label: 'Faith & Worship', href: ev('Faith Worship') },
]

const SURFACE =
  'group flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] ' +
  'shadow-[0_1px_3px_rgba(10,22,40,0.05)] transition-all duration-200 ease-out ' +
  'hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(10,22,40,0.13)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'

const IMG_MOTION =
  'transition-transform duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100'

async function toTile(scene: Scene) {
  const photo = await getCategoryPhoto(scene.slug)
  return { ...scene, image: photo.src, alt: photo.alt ?? `${scene.label} events` }
}

function SceneTile({ tile }: { tile: Scene & { image: string; alt: string } }) {
  // Variant B: proper SQUARE tiles at a smaller scale than the landscape event
  // cards, so the scenes rail reads as a distinct role at a glance.
  return (
    <div className={SCENE_TILE_CELL}>
      <Link href={tile.href} prefetch={false} className={SURFACE}>
        <div className="relative aspect-square overflow-hidden bg-[var(--surface-1)]">
          <EventCardMedia src={tile.image} alt={tile.alt} variant="rail" className={IMG_MOTION} />
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

/** Slim in-rail family marker: a vertical gold rule + caps label that
 *  delineates the two scene families inside the single scrollable rail. */
function FamilyMarker({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 snap-start items-center pr-1" aria-hidden>
      <div className="flex flex-col items-center gap-3 px-1">
        <span className="h-10 w-px bg-[var(--brand-accent-strong)]/50" />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-accent-strong)] [writing-mode:vertical-rl] rotate-180">
          {label}
        </span>
        <span className="h-10 w-px bg-[var(--brand-accent-strong)]/50" />
      </div>
    </div>
  )
}

export async function SceneRail() {
  const [musicTiles, cultureTiles] = await Promise.all([
    Promise.all(MUSIC_SCENES.map(toTile)),
    Promise.all(CULTURE_SCENES.map(toTile)),
  ])

  // Per-rail accent (Variant B): a gold-tinted top divider instead of the plain
  // ink rule marks the community/scenes thread as its own moment.
  return (
    <section aria-label="Browse by scene" className={`border-t-2 border-[var(--brand-accent-strong)]/30 bg-canvas ${SECTION_TIGHT}`}>
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow="Find your scene"
          title="Scenes and sounds"
          headerLink={{ href: '/events', label: 'Browse all' }}
          railLabel="Music and culture scenes"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          <FamilyMarker label="Music & sound" />
          {musicTiles.map(tile => (
            <SceneTile key={tile.slug} tile={tile} />
          ))}
          <FamilyMarker label="Community & culture" />
          {cultureTiles.map(tile => (
            <SceneTile key={tile.slug} tile={tile} />
          ))}
        </SnapRail>
      </Reveal>
    </section>
  )
}
