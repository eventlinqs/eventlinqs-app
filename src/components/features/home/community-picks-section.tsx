import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { CommunityPicksRail } from '@/components/features/events/community-picks-rail'
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
 * Community Picks - canonical 18-community rail.
 *
 * Per B1 scope §4.3, communities MUST appear in the locked canonical order.
 * Each tab queries published upcoming events tagged with the community's
 * tag set (we accept multiple tag aliases per community so naming variants
 * in the DB do not cause empty pills). Communities with zero events are
 * filtered out before render - we never display empty community pills.
 *
 * Order is the marketed-rhythm order from CLAUDE.md. Do not alphabetise.
 * Do not reorder. The order is brand voice.
 */
const CANONICAL_COMMUNITY_TABS: {
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

async function fetchEventsForCommunity(
  supabase: ReturnType<typeof createPublicClient>,
  tags: string[],
  cityFilter: string,
  nowIso: string,
): Promise<RawRow[]> {
  // First pass: city-filtered. Try every alias tag for this community.
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

export async function CommunityPicksSection({ cityFilter, nowIso }: Props) {
  const supabase = createPublicClient()

  const communityQueries = await Promise.all(
    CANONICAL_COMMUNITY_TABS.map(async tab => {
      const rows = await fetchEventsForCommunity(supabase, tab.tags, cityFilter, nowIso)
      const events = rows.map(toBentoEvent)
      const cards = events.map(e => <ThisWeekCard key={e.id} event={e} variant="square" />)
      return { tab, events, cards }
    }),
  )

  const communityPicksTabs = communityQueries
    .filter(q => q.events.length > 0)
    .map(q => ({
      slug: q.tab.slug,
      label: q.tab.label,
      href: q.tab.href,
      cards: <>{q.cards}</>,
    }))

  if (communityPicksTabs.length === 0) return null

  return (
    <section aria-labelledby="community-heading" className={`border-t border-ink-200 bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
                Made for every community
              </p>
              <h2 id="community-heading" className="type-h2 font-display text-ink-900">
                Community picks
              </h2>
            </div>
          </div>
          <Link
            href="/events"
            className="shrink-0 text-sm font-medium text-gold-700 whitespace-nowrap transition-colors hover:text-gold-600"
          >
            Explore communities &rsaquo;
          </Link>
        </div>

        <CommunityPicksRail tabs={communityPicksTabs} />
      </div>
    </section>
  )
}
