import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { M5EventsGrid } from '@/components/features/events/m5-events-grid'
import { type EventCardData } from '@/components/features/events/event-card'
import { FollowButton } from '@/components/features/genres/follow-button'
import {
  GENRES,
  SUBGENRES,
  getGenre,
  getSubgenre,
  getSubgenresForGenre,
  getParentGenre,
  isGenreSlug,
  isSubgenreSlug,
} from '@/lib/genres/data'
import { EVENT_CARD_SELECT } from '@/lib/follows/server'

export const revalidate = 300

type Props = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return [...GENRES.map((g) => g.slug), ...SUBGENRES.map((s) => s.slug)].map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const genre = getGenre(slug)
  const subgenre = getSubgenre(slug)
  const name = genre?.name ?? subgenre?.name
  if (!name) return { title: 'Music not found | EventLinqs' }
  return {
    title: `${name} events | EventLinqs`,
    description: `Find live ${name} events near you on EventLinqs.`,
  }
}

async function fetchEvents(column: 'genre_slug' | 'subgenre_slug', slug: string) {
  const supabase = createPublicClient()
  const { data: rows } = await supabase
    .from('events')
    .select(EVENT_CARD_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq(column, slug)
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(60)
  return (rows ?? []) as unknown as EventCardData[]
}

export default async function MusicSlugPage({ params }: Props) {
  const { slug } = await params

  if (isGenreSlug(slug)) {
    const genre = getGenre(slug)!
    const events = await fetchEvents('genre_slug', slug)
    const subgenres = getSubgenresForGenre(slug)

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
              <span className="text-textPrimary">{genre.name}</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-2">{genre.name} events</h1>
            <p className="text-textSecondary mb-6 max-w-2xl">
              Live {genre.name} events, sorted by what is on next.
            </p>
            {subgenres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {subgenres.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/music/${s.slug}`}
                    className="inline-flex items-center min-h-[44px] px-4 rounded-full border border-gray-300 bg-surface text-sm text-textPrimary transition-colors hover:border-accent focus:ring-2 focus:ring-accent outline-none"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            )}
            <M5EventsGrid
              events={events}
              emptyMessage={`No upcoming ${genre.name} events right now. Check back soon.`}
            />
          </section>
        </main>
        <SiteFooter />
      </>
    )
  }

  if (isSubgenreSlug(slug)) {
    const subgenre = getSubgenre(slug)!
    const parent = getParentGenre(slug)
    const events = await fetchEvents('subgenre_slug', slug)

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
              {parent && (
                <>
                  <span className="mx-2">/</span>
                  <Link href={`/music/${parent.slug}`} className="hover:text-accent">
                    {parent.name}
                  </Link>
                </>
              )}
              <span className="mx-2">/</span>
              <span className="text-textPrimary">{subgenre.name}</span>
            </nav>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-2">
                  {subgenre.name} events
                </h1>
                <p className="text-textSecondary max-w-2xl">
                  Follow {subgenre.name} to see new events in your feed.
                </p>
              </div>
              <FollowButton type="subgenre" id={subgenre.slug} name={subgenre.name} />
            </div>
            <M5EventsGrid
              events={events}
              emptyMessage={`No upcoming ${subgenre.name} events right now. Follow to be the first to know.`}
            />
          </section>
        </main>
        <SiteFooter />
      </>
    )
  }

  notFound()
}
