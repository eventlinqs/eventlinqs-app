import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { M5EventsGrid } from '@/components/features/events/m5-events-grid'
import { type EventCardData } from '@/components/features/events/event-card'
import { getFollowTargets, EVENT_CARD_SELECT } from '@/lib/follows/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your following feed | EventLinqs',
  description: 'Upcoming events from the artists and sub-genres you follow.',
}

export default async function FollowingPage() {
  const targets = await getFollowTargets()
  if (!targets) {
    redirect('/login?redirect=/account/following')
  }

  const { artistIds, subgenreSlugs } = targets
  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  const byId = new Map<string, EventCardData>()

  if (subgenreSlugs.length > 0) {
    const { data } = await supabase
      .from('events')
      .select(EVENT_CARD_SELECT)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .in('subgenre_slug', subgenreSlugs)
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(60)
    for (const row of (data ?? []) as unknown as EventCardData[]) byId.set(row.id, row)
  }

  if (artistIds.length > 0) {
    const { data } = await supabase
      .from('events')
      .select(`${EVENT_CARD_SELECT}, event_artists!inner(artist_id)`)
      .in('event_artists.artist_id', artistIds)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(60)
    for (const row of (data ?? []) as unknown as EventCardData[]) byId.set(row.id, row)
  }

  const events = [...byId.values()].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const followsNothing = artistIds.length === 0 && subgenreSlugs.length === 0

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <nav className="text-sm text-textSecondary mb-4">
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
            <span className="mx-2">/</span>
            <Link href="/account" className="hover:text-accent">
              Account
            </Link>
            <span className="mx-2">/</span>
            <span className="text-textPrimary">Following</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-2">Your following feed</h1>
          <p className="text-textSecondary mb-8 max-w-2xl">
            Upcoming events from the artists and sub-genres you follow.
          </p>
          {followsNothing ? (
            <div className="rounded-xl border border-gray-200 bg-surface px-6 py-12 text-center">
              <p className="text-textPrimary font-medium mb-2">You are not following anything yet.</p>
              <p className="text-textSecondary mb-6">
                Follow artists and sub-genres to build a feed of events made for you.
              </p>
              <Link
                href="/music"
                className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-primary text-white font-medium transition-colors hover:bg-accent focus:ring-2 focus:ring-accent outline-none"
              >
                Browse music
              </Link>
            </div>
          ) : (
            <M5EventsGrid
              events={events}
              emptyMessage="No upcoming events from your follows right now. Check back soon."
            />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
