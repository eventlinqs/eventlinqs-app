import Link from 'next/link'
import { Reveal } from '@/components/ui/reveal'
import { EventCardMedia } from '@/components/media'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { getCategoryPhoto } from '@/lib/images/category-photo'

/**
 * OrganiserCommunityStrip - the "Open to every community" tile set.
 *
 * Interactive-affordance law: every tile is a REAL working link into an existing
 * scene/community/category page (zero dead links / no dead-end tiles). The set is
 * recomposed to read as "every community, every organiser" - the COMMUNITIES
 * family (First Nations first, per law) plus high-volume SOUNDS and Comedy - not
 * over-weighted to one cluster.
 *
 * Imagery resolves through the media pipeline (community hero photos for heritage
 * communities, category photos for sounds), each with a branded fallback baked
 * into EventCardMedia - never a broken image, on preview or production. Tiles use
 * the separated-card design system with hover illumination; the whole tile is the
 * touch target.
 */

type StripTile = {
  label: string
  description: string
  href: string
  img: { kind: 'community' | 'category'; slug: string }
}

// First Nations first (law). COMMUNITIES lead, then high-volume SOUNDS, then
// Comedy. Heritage communities link to their real /community/[slug] landing;
// rollup community labels and sounds link to the resolving filtered view; Comedy
// to its category page. Every href resolves 200.
const TILES: StripTile[] = [
  { label: 'First Nations', description: 'NAIDOC, corroboree, art and dance.', href: '/community/aboriginal-torres-strait-islander', img: { kind: 'community', slug: 'aboriginal-torres-strait-islander' } },
  { label: 'African', description: 'Afrobeats, Amapiano, Owambe and more.', href: '/community/african', img: { kind: 'community', slug: 'african' } },
  { label: 'Caribbean', description: 'Soca, dancehall, reggae, carnival.', href: '/community/caribbean', img: { kind: 'community', slug: 'caribbean' } },
  { label: 'South Asian', description: 'Bollywood, bhangra, Diwali, weddings.', href: '/events?q=South%20Asian', img: { kind: 'community', slug: 'indian' } },
  { label: 'East & SE Asian', description: 'Lunar New Year, K-pop, festivals.', href: '/events?q=Asian', img: { kind: 'community', slug: 'chinese' } },
  { label: 'Pasifika & Maori', description: 'Island music, dance, community days.', href: '/events?q=Pasifika%20Maori', img: { kind: 'community', slug: 'pacific-pasifika' } },
  { label: 'Mediterranean', description: 'Greek, Italian and Levantine festivals.', href: '/events?q=Mediterranean', img: { kind: 'community', slug: 'greek' } },
  { label: 'Latin American', description: 'Salsa, reggaeton, street fiestas.', href: '/community/latin-american', img: { kind: 'community', slug: 'latin-american' } },
  { label: 'Filipino', description: 'Fiestas, OPM, community gatherings.', href: '/community/filipino', img: { kind: 'community', slug: 'filipino' } },
  { label: 'Pride', description: 'Pride parties, drag and community nights.', href: '/events?q=Pride', img: { kind: 'category', slug: 'pride' } },
  { label: 'Faith & worship', description: 'Gospel, worship and faith gatherings.', href: '/events?q=faith%20worship', img: { kind: 'category', slug: 'gospel' } },
  { label: 'Electronic & dance', description: 'Festivals, club nights and raves.', href: '/events?q=electronic%20dance', img: { kind: 'category', slug: 'electronic' } },
  { label: 'Country', description: 'Live country, festivals, line dancing.', href: '/events?q=country', img: { kind: 'category', slug: 'country' } },
  { label: 'Indie & rock', description: 'Gigs, bands and live music nights.', href: '/events?q=indie%20rock', img: { kind: 'category', slug: 'indie-rock' } },
  { label: 'Comedy', description: 'Stand-up, open mics and gala nights.', href: '/events?category=comedy', img: { kind: 'category', slug: 'comedy' } },
]

const SURFACE =
  'group block overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] ' +
  'shadow-[0_1px_3px_rgba(10,22,40,0.05)] transition-all duration-200 ease-out ' +
  'hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(10,22,40,0.13)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'

const IMG_MOTION =
  'transition-transform duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100'

async function resolveSrc(t: StripTile): Promise<string> {
  if (t.img.kind === 'community') {
    return (await getCommunityHeroPhoto(t.img.slug, { allowBundledFallback: true })) ?? ''
  }
  return (await getCategoryPhoto(t.img.slug)).src
}

export async function OrganiserCommunityStrip() {
  const tiles = await Promise.all(
    TILES.map(async t => ({ ...t, src: await resolveSrc(t) })),
  )

  return (
    <Reveal stagger as="ul" className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
      {tiles.map(t => (
        <li key={t.label}>
          <Link href={t.href} prefetch={false} className={SURFACE}>
            {/* Card law: image alone, label + description below, never on the image. */}
            <div className="relative aspect-[4/5] overflow-hidden bg-[var(--surface-1)]">
              <EventCardMedia src={t.src} alt={`${t.label} events`} variant="card" className={IMG_MOTION} />
            </div>
            <div className="p-3">
              <p className="font-display text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--brand-accent-strong)]">
                {t.label}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                {t.description}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </Reveal>
  )
}
