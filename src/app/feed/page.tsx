import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Compass, Heart, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fetchForYouFeed } from '@/lib/events/fetchers'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { EventCard } from '@/components/features/events/event-card'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'

// Per-user surface: never cached, never indexed. Not a public LCP/SEO page.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'For You | EventLinqs',
  description: 'Events picked for you from the organisers, artists and scenes you follow.',
  robots: { index: false, follow: false },
}

/**
 * /feed - the personalised "For You" feed (demand engine 2). Ranks live
 * upcoming events by affinity to the signed-in user's demand graph (followed
 * organisers, saved categories, followed artists and scenes, saved events, and
 * preferred city) using the pure rankEventsByAffinity ranker. Anonymous users
 * are bounced to /login?redirect=/feed. When the user follows nothing yet, the
 * page renders the shared designed empty state prompting them to start
 * following, never a bare "no results".
 */
export default async function ForYouFeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?redirect=/feed')
  }

  const { events, hasGraph } = await fetchForYouFeed(user.id, 24)

  const firstName =
    (user.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0] ||
    (user.user_metadata?.name as string | undefined)?.trim().split(/\s+/)[0] ||
    'there'

  // Empty graph OR a graph with no upcoming matches both resolve to the same
  // designed prompt: start following so the feed has something to rank.
  const showEmpty = !hasGraph || events.length === 0

  return (
    <PageShell>
      <ContentSection surface="base" width="wide">
        <div className="mb-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            For you
          </p>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Your feed, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-[var(--text-secondary)]">
            Events picked from the organisers, artists and scenes you follow, ranked
            by how close they are to your taste and your city.
          </p>
        </div>
      </ContentSection>

      {showEmpty ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <CategoryHeroEmpty
            eyebrow="FOR YOU"
            headline="Follow organisers and scenes to build your feed."
            subhead="Follow an organiser or a scene you love and we will line up the events you should not miss, ranked for you."
            primaryAction={{ label: 'Browse events', href: '/events' }}
            secondaryAction={{ label: 'Find communities', href: '/communities' }}
            trustPillars={[
              { icon: Heart as ComponentType<{ className?: string }>, label: 'Follow the people you love' },
              { icon: Compass as ComponentType<{ className?: string }>, label: 'Ranked to your taste' },
              { icon: Users as ComponentType<{ className?: string }>, label: 'Your city, front and centre' },
            ]}
          />
        </ContentSection>
      ) : (
        <>
          <ContentSection surface="alt" width="wide" topBorder>
            <SnapRailScroller
              railLabel="Top picks for you"
              containerBg="ink-100"
              header={{
                eyebrow: 'Top picks',
                title: 'Closest to your taste',
                headerLink: { href: '/events', label: 'Browse all' },
              }}
            >
              {events.slice(0, 12).map(e => (
                <div key={e.id} className="w-[280px] shrink-0 snap-start">
                  <EventCard event={e} variant="rail" />
                </div>
              ))}
            </SnapRailScroller>
          </ContentSection>

          {events.length > 12 ? (
            <ContentSection surface="base" width="wide" topBorder>
              <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                  More for you
                </p>
                <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                  Picked from who you follow
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {events.slice(12).map(e => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </ContentSection>
          ) : null}
        </>
      )}
    </PageShell>
  )
}
