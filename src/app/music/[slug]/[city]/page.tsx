import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { M5EventsGrid } from '@/components/features/events/m5-events-grid'
import { type EventCardData } from '@/components/features/events/event-card'
import { getGenre, getSubgenre, isGenreSlug, isSubgenreSlug } from '@/lib/genres/data'
import { getCity } from '@/lib/cities/data'
import { EVENT_CARD_SELECT } from '@/lib/follows/server'

export const revalidate = 300

type Props = {
  params: Promise<{ slug: string; city: string }>
}

function resolve(slug: string): { column: 'genre_slug' | 'subgenre_slug'; name: string } | null {
  if (isGenreSlug(slug)) return { column: 'genre_slug', name: getGenre(slug)!.name }
  if (isSubgenreSlug(slug)) return { column: 'subgenre_slug', name: getSubgenre(slug)!.name }
  return null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, city } = await params
  const music = resolve(slug)
  const cityData = getCity(city)
  if (!music || !cityData) return { title: 'Music not found | EventLinqs' }
  return {
    title: `${music.name} events in ${cityData.name} | EventLinqs`,
    description: `Find live ${music.name} events in ${cityData.name} on EventLinqs.`,
  }
}

export default async function MusicCityPage({ params }: Props) {
  const { slug, city } = await params
  const music = resolve(slug)
  const cityData = getCity(city)
  if (!music || !cityData) notFound()

  const supabase = createPublicClient()
  const { data: rows } = await supabase
    .from('events')
    .select(EVENT_CARD_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq(music.column, slug)
    .ilike('venue_city', `%${cityData.name}%`)
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
            <Link href={`/music/${slug}`} className="hover:text-accent">
              {music.name}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-textPrimary">{cityData.name}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-2">
            {music.name} events in {cityData.name}
          </h1>
          <p className="text-textSecondary mb-8 max-w-2xl">
            Live {music.name} events happening in and around {cityData.name}.
          </p>
          <M5EventsGrid
            events={events}
            emptyMessage={`No upcoming ${music.name} events in ${cityData.name} right now.`}
          />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
