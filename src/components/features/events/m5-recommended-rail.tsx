import Image from 'next/image'
import Link from 'next/link'
import { projectToCardData } from '@/lib/events/event-card-projection'
import type { PublicEventRow } from '@/lib/events/types'

type Props = {
  events: PublicEventRow[]
  headline: 'recommended' | 'popular' | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export async function RecommendedRail({ events, headline }: Props) {
  if (headline === null || events.length === 0) return null

  const title = headline === 'recommended' ? 'Recommended for you' : 'Popular this week'
  const cards = await projectToCardData(events)

  return (
    <section aria-labelledby="m5-rec-heading" className="border-b border-ink-100 bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 id="m5-rec-heading" className="font-display text-lg font-bold text-ink-900 sm:text-xl">
            {title}
          </h2>
          <span className="text-xs text-ink-400">{events.length} events</span>
        </div>
        <ul className="mt-3 -mx-4 flex items-stretch gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {cards.map(c => {
            const img = c.thumbnail_url ?? c.cover_image_url
            return (
              <li key={c.id} className="w-60 shrink-0">
                <Link
                  href={`/events/${c.slug}`}
                  className="group block overflow-hidden rounded-lg border border-ink-100 bg-white transition-shadow hover:shadow-md"
                  aria-label={c.title}
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-ink-900">
                    {img && (
                      <Image
                        src={img}
                        alt={c.title}
                        fill
                        sizes="240px"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gold-500">
                      {formatDate(c.start_date)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink-900">{c.title}</p>
                    <p className="mt-1 truncate text-xs text-ink-400">{c.venue_city ?? '—'}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
