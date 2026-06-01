import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { HeroCarouselClient, type HeroSlide } from './HeroCarouselClient'

/**
 * HeroCarousel (Batch 11.0) - server-component wrapper that resolves
 * hero photography for the 5 Australian friends-launch slots and hands
 * the slide manifest to a thin client controller for rotation.
 *
 * Slot manifest is locked to the 5 AU cultural festivals listed in
 * Batch 11.0 brief Section 1.2. Each slot's `image` is sourced from
 * the existing Pexels culture-hero pipeline as a temporary placeholder
 * until founder uploads the Stocksy + Adobe Stock batch (per
 * docs/IMAGERY-MANIFEST.md). The lookup is intentionally one-line per
 * slot so the future image swap is mechanical.
 *
 * Photography flows through the HeroMedia component (rendered inside
 * the client controller) so the existing LCP-safe priority +
 * fetchpriority pattern is preserved.
 */

/**
 * 5 AU friends-launch hero slots - founder's locked Batch 11.0 lineup.
 *
 * All 5 slot CTAs point at events that are seeded by migration
 *   20260514004634_promote_pacific_middle_eastern_hero_events.sql
 * which inserts all 5 founder-locked events as status='published'
 * AND visibility='public' with real Pexels cover imagery (passes the
 * events_published_real_cover constraint). Migration must be applied
 * via `npx supabase db push --linked` before deployment; local prod
 * build resolves them automatically because the migration runs
 * against the linked project DB.
 *
 * `objectPosition` per slot is tuned from the Batch 11.0 founder
 * visual review. The defaults push the crop UP (e.g. "50% 30%") so
 * heads stay visible on the desktop 16:9 letterbox of mid-vertical
 * Pexels photos. When the founder uploads the final Stocksy / Adobe
 * Stock imagery, re-check the desktop crops and update or remove
 * these overrides.
 */
const SLOTS: Omit<HeroSlide, 'image'>[] = [
  // Slot 1 - African - Africultures Festival (Sydney, 12 March 2027)
  {
    id: 'africultures-festival-sydney-2027',
    kicker: 'AFRICAN COMMUNITY',
    title: 'Africultures Festival',
    venue: 'Wyatt Park, Auburn',
    city: 'Sydney',
    date: '12 March 2027',
    cta: '/events/africultures-festival-sydney-2027',
    cultureSlug: 'african',
    // Push the visible crop DOWN to a darker upper region so the title
    // and kicker sit on a cleaner band, lifting the headline visually
    // up the surface even though its DOM position is unchanged.
    objectPosition: '50% 65%',
  },
  // Slot 2 - Pacific - Pasifika Festival 2027 (Melbourne, 21 Feb 2027)
  // Seeded by 20260514004634 migration.
  {
    id: 'pasifika-festival-melbourne-2027',
    kicker: 'PACIFIC CULTURE',
    title: 'Pasifika Festival 2027',
    venue: 'Federation Square',
    city: 'Melbourne',
    date: '21 February 2027',
    cta: '/events/pasifika-festival-melbourne-2027',
    cultureSlug: 'pacific',
    // Pull the visible crop UP so subjects' heads / upper bodies sit
    // in frame rather than legs / waist on desktop letterbox.
    objectPosition: '50% 28%',
  },
  // Slot 3 - South Asian - Diwali Mela Brisbane (Brisbane, 24 Oct 2026)
  {
    id: 'diwali-mela-brisbane-2026',
    kicker: 'SOUTH ASIAN CULTURE',
    title: 'Diwali Mela Brisbane',
    venue: 'Brisbane Powerhouse',
    city: 'Brisbane',
    date: '24 October 2026',
    cta: '/events/diwali-mela-brisbane-2026',
    cultureSlug: 'south-asian',
  },
  // Slot 4 - Middle Eastern - Lebanese Eid Festival (Sydney, 19 Apr 2027)
  // Seeded by 20260514004634 migration.
  {
    id: 'lebanese-eid-festival-sydney-2027',
    kicker: 'MIDDLE EASTERN CULTURE',
    title: 'Lebanese Eid Festival',
    venue: 'Sydney Olympic Park',
    city: 'Sydney',
    date: '19 April 2027',
    cta: '/events/lebanese-eid-festival-sydney-2027',
    cultureSlug: 'middle-eastern',
  },
  // Slot 5 - Caribbean - Caribbean Carnival Melbourne (Melbourne, 14 Feb 2027)
  {
    id: 'caribbean-carnival-melbourne-2027',
    kicker: 'CARIBBEAN CULTURE',
    title: 'Caribbean Carnival Melbourne',
    venue: 'Birrarung Marr',
    city: 'Melbourne',
    date: '14 February 2027',
    cta: '/events/caribbean-carnival-melbourne-2027',
    cultureSlug: 'caribbean',
    // Pull the visible crop UP so subjects' heads / upper bodies sit
    // in frame rather than legs / waist on desktop letterbox.
    objectPosition: '50% 25%',
  },
]

export async function HeroCarousel() {
  const slides: HeroSlide[] = await Promise.all(
    SLOTS.map(async slot => {
      const image = await getCultureHeroPhoto(slot.cultureSlug)
      return { ...slot, image }
    }),
  )

  return (
    <section
      aria-labelledby="hero-carousel-heading"
      className="relative w-full overflow-hidden bg-[var(--color-navy-950)]"
    >
      <HeroPresenceMarker />
      {/* Page h1 (sr-only): the homepage needs exactly one h1 for a11y
       *  and SEO. Event/breadth-forward; the slide titles below are h2. */}
      <h1 id="hero-carousel-heading" className="sr-only">
        Live events across Australia: music, comedy, food, festivals and more
      </h1>
      <HeroCarouselClient slides={slides} />
    </section>
  )
}
