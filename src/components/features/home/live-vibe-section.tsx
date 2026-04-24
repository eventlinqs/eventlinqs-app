import { LiveVibeMarquee, type VibeImage } from '@/components/features/events/live-vibe-marquee'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { FALLBACK_SEEDS, type RawRow } from '@/lib/events/home-queries'

interface Props {
  upcomingRaw: RawRow[]
}

export async function LiveVibeSection({ upcomingRaw }: Props) {
  const realVibeImages: VibeImage[] = upcomingRaw.slice(0, 20).map(raw => {
    const picsum = /^https:\/\/picsum\.photos\//i
    const pickReal = (u: string | null): string | null =>
      u && !picsum.test(u) ? u : null
    const src = pickReal(raw.cover_image_url) ?? pickReal(raw.thumbnail_url) ?? null
    const community = [raw.venue_city, raw.venue_state, raw.venue_country]
      .filter(Boolean)
      .slice(0, 2)
      .join(', ')
    return {
      id: raw.id,
      src,
      href: `/events/${raw.slug}`,
      title: raw.title,
      community: community || 'Live on EventLinqs',
      placeholderCategory: raw.category?.name ?? raw.category?.slug ?? null,
    }
  })

  let vibeImages: VibeImage[] = realVibeImages
  if (vibeImages.length < 6) {
    const fallbackCommunityTiles: VibeImage[] = await Promise.all(
      FALLBACK_SEEDS.map(async seed => {
        const photo = await getCategoryPhoto(seed.categorySlug)
        return {
          id: seed.id,
          src: photo.src,
          href: seed.href,
          title: seed.title,
          community: seed.community,
          placeholderCategory: seed.categorySlug,
        }
      }),
    )
    vibeImages = [...vibeImages, ...fallbackCommunityTiles].slice(0, 12)
  }

  return <LiveVibeMarquee items={vibeImages} />
}
