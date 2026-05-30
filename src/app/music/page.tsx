import type { Metadata } from 'next'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { GENRES } from '@/lib/genres/data'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Music events by genre | EventLinqs',
  description:
    'Find live music events across every genre, from electronic and hip hop to Afrobeats, jazz and classical.',
}

export default async function MusicIndexPage() {
  const supabase = createPublicClient()
  const { data: rows } = await supabase
    .from('events')
    .select('genre_slug')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .not('genre_slug', 'is', null)
    .limit(2000)

  const counts = new Map<string, number>()
  for (const row of rows ?? []) {
    const slug = (row as { genre_slug: string | null }).genre_slug
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }

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
            <span className="text-textPrimary">Music</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-2">Music by genre</h1>
          <p className="text-textSecondary mb-8 max-w-2xl">
            Browse live events by the sound you love. Pick a genre to go deeper into its scenes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {GENRES.map((genre) => {
              const count = counts.get(genre.slug) ?? 0
              return (
                <Link
                  key={genre.slug}
                  href={`/music/${genre.slug}`}
                  className="flex items-center justify-between min-h-[88px] rounded-xl border border-gray-200 bg-surface px-5 py-4 transition-colors hover:border-accent focus:ring-2 focus:ring-accent outline-none"
                >
                  <span className="text-lg font-semibold text-textPrimary">{genre.name}</span>
                  <span className="text-sm text-textSecondary">
                    {count === 1 ? '1 event' : `${count} events`}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
