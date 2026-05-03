import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { CulturalPicksRail } from '@/components/features/events/cultural-picks-rail'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import {
  EVENT_SELECT,
  toBentoEvent,
  type RawRow,
} from '@/lib/events/home-queries'

interface Props {
  cityFilter: string
  nowIso: string
}

/**
 * Cultural Picks - canonical 18-culture rail.
 *
 * Per B1 scope §4.3, cultures MUST appear in the locked canonical order.
 * Each tab queries published upcoming events tagged with the culture's
 * tag set (we accept multiple tag aliases per culture so naming variants
 * in the DB do not cause empty pills). Cultures with zero events are
 * filtered out before render - we never display empty culture pills.
 *
 * Order is the marketed-rhythm order from CLAUDE.md. Do not alphabetise.
 * Do not reorder. The order is brand voice.
 */
const CANONICAL_CULTURE_TABS: {
  slug: string
  label: string
  tags: string[]
  href: string
}[] = [
  { slug: 'afrobeats',    label: 'Afrobeats',     tags: ['afrobeats'],                       href: '/categories/afrobeats' },
  { slug: 'caribbean',    label: 'Caribbean',     tags: ['caribbean'],                       href: '/categories/caribbean' },
  { slug: 'bollywood',    label: 'Bollywood',     tags: ['bollywood'],                       href: '/categories/bollywood' },
  { slug: 'latin',        label: 'Latin',         tags: ['latin'],                           href: '/categories/latin' },
  { slug: 'italian',      label: 'Italian',       tags: ['italian'],                         href: '/categories/italian' },
  { slug: 'filipino',     label: 'Filipino',      tags: ['filipino'],                        href: '/categories/filipino' },
  { slug: 'lunar',        label: 'Lunar',         tags: ['lunar'],                           href: '/categories/lunar' },
  { slug: 'gospel',       label: 'Gospel',        tags: ['gospel'],                          href: '/categories/gospel' },
  { slug: 'amapiano',     label: 'Amapiano',      tags: ['amapiano'],                        href: '/categories/amapiano' },
  { slug: 'comedy',       label: 'Comedy',        tags: ['comedy'],                          href: '/categories/comedy' },
  { slug: 'spanish',      label: 'Spanish',       tags: ['spanish'],                         href: '/categories/spanish' },
  { slug: 'k-pop',        label: 'K-Pop',         tags: ['k-pop', 'kpop'],                   href: '/categories/k-pop' },
  { slug: 'reggae',       label: 'Reggae',        tags: ['reggae'],                          href: '/categories/reggae' },
  { slug: 'west-african', label: 'West African',  tags: ['west-african', 'owambe'],          href: '/categories/west-african' },
  { slug: 'european',     label: 'European',      tags: ['european'],                        href: '/categories/european' },
  { slug: 'asian',        label: 'Asian',         tags: ['asian'],                           href: '/categories/asian' },
  { slug: 'african',      label: 'African',       tags: ['african', 'heritage'],             href: '/categories/african' },
  { slug: 'south-asian',  label: 'South Asian',   tags: ['south-asian'],                     href: '/categories/south-asian' },
]

async function fetchEventsForCulture(
  supabase: ReturnType<typeof createPublicClient>,
  tags: string[],
  cityFilter: string,
  nowIso: string,
): Promise<RawRow[]> {
  // First pass: city-filtered. Try every alias tag for this culture.
  const cityScoped = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .overlaps('tags', tags)
    .ilike('venue_city', `%${cityFilter}%`)
    .order('start_date', { ascending: true })
    .limit(8)

  if ((cityScoped.data ?? []).length >= 2) {
    return (cityScoped.data ?? []) as unknown as RawRow[]
  }

  const fallback = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .overlaps('tags', tags)
    .order('start_date', { ascending: true })
    .limit(8)

  return (fallback.data ?? []) as unknown as RawRow[]
}

export async function CulturalPicksSection({ cityFilter, nowIso }: Props) {
  const supabase = createPublicClient()

  const culturalQueries = await Promise.all(
    CANONICAL_CULTURE_TABS.map(async tab => {
      const rows = await fetchEventsForCulture(supabase, tab.tags, cityFilter, nowIso)
      const events = rows.map(toBentoEvent)
      const cards = events.map(e => <ThisWeekCard key={e.id} event={e} />)
      return { tab, events, cards }
    }),
  )

  const culturalPicksTabs = culturalQueries
    .filter(q => q.events.length > 0)
    .map(q => ({
      slug: q.tab.slug,
      label: q.tab.label,
      href: q.tab.href,
      cards: <>{q.cards}</>,
    }))

  if (culturalPicksTabs.length === 0) return null

  return (
    <section aria-labelledby="culture-heading" className={`bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
                Made for every culture
              </p>
              <h2 id="culture-heading" className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                Cultural picks
              </h2>
            </div>
          </div>
          <Link
            href="/events"
            className="shrink-0 text-sm font-medium text-gold-700 whitespace-nowrap transition-colors hover:text-gold-600"
          >
            Explore culture &rsaquo;
          </Link>
        </div>

        <CulturalPicksRail tabs={culturalPicksTabs} />
      </div>
    </section>
  )
}
