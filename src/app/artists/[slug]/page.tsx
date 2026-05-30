import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventCardGrid } from '@/components/features/events/event-card-grid'
import { type EventCardData } from '@/components/features/events/event-card'
import { FollowButton } from '@/components/features/genres/follow-button'
import { EVENT_CARD_SELECT } from '@/lib/follows/server'

export const revalidate = 300

type Props = {
  params: Promise<{ slug: string }>
}

async function getArtist(slug: string) {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('artists')
    .select('id, slug, name, bio, image_url, spotify_url')
    .eq('slug', slug)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) return { title: 'Artist not found | EventLinqs' }
  return {
    title: `${artist.name} events and tickets | EventLinqs`,
    description: artist.bio ?? `Find live events featuring ${artist.name} on EventLinqs.`,
  }
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) notFound()

  const supabase = createPublicClient()
  const { data: rows } = await supabase
    .from('events')
    .select(`${EVENT_CARD_SELECT}, event_artists!inner(artist_id)`)
    .eq('event_artists.artist_id', artist.id)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(60)

  const events = (rows ?? []) as unknown as EventCardData[]

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
            <Link href="/music" className="hover:text-accent">
              Music
            </Link>
            <span className="mx-2">/</span>
            <span className="text-textPrimary">{artist.name}</span>
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-2">{artist.name}</h1>
              {artist.bio && <p className="text-textSecondary max-w-2xl">{artist.bio}</p>}
            </div>
            <FollowButton type="artist" id={artist.id} name={artist.name} />
          </div>
          <h2 className="text-xl font-semibold text-textPrimary mb-4">Upcoming events</h2>
          <EventCardGrid
            events={events}
            emptyMessage={`No upcoming events for ${artist.name} right now. Follow to be the first to know.`}
          />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
