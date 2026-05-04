import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { ContentSection } from '@/components/layout/ContentSection'

interface Props {
  cultureSlug: string
  cultureName: string
  cities: string[]
}

/**
 * CulturesByCityRail - city chip cloud for a culture page.
 *
 * Each chip routes to /events/browse/{citySlug}?culture={cultureSlug}.
 * If the city slug doesn't exist in the routing table the link still
 * resolves to /events with a culture filter (graceful fallback).
 */
function citySlugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function CulturesByCityRail({ cultureSlug, cultureName, cities }: Props) {
  if (cities.length === 0) return null
  return (
    <ContentSection surface="base" width="default" topBorder>
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          Where it lives
        </p>
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {cultureName} in cities everywhere
        </h2>
      </div>
      <ul role="list" className="flex flex-wrap gap-2">
        {cities.map((city) => {
          const slug = citySlugify(city)
          return (
            <li key={city}>
              <Link
                href={`/events/browse/${slug}?culture=${cultureSlug}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--brand-accent)]/40 hover:bg-[var(--brand-accent)]/8"
              >
                <MapPin className="h-3.5 w-3.5 text-[var(--brand-accent)]" aria-hidden />
                {city}
              </Link>
            </li>
          )
        })}
      </ul>
    </ContentSection>
  )
}
