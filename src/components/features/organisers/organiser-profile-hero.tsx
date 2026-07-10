import type { ReactNode } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'

interface Props {
  /** Organiser display name. */
  name: string
  /** Optional cover image URL (Pexels-derived from primary community if not set). */
  coverImage: string | null
  /** Organisation logo URL or null - falls back to brand initials. */
  logoUrl: string | null
  /** "Throwing X events in Y" or similar subtitle. */
  subtitle: string
  /** Stats row tuples: e.g. [{label: 'events', value: 42}, {label: 'cities', value: 6}]. */
  stats: { label: string; value: string | number; icon?: 'cal' | 'pin' }[]
  /** Optional verified badge surface. */
  verified?: boolean
  /**
   * Optional action slot rendered below the stats (e.g. the Follow button).
   * Kept as a slot so the hero stays a server component and the interactive
   * control hydrates independently without forcing the page dynamic.
   */
  actionSlot?: ReactNode
}

/**
 * OrganiserProfileHero - cover banner + avatar + name + subtitle + stats
 * for /organisers/[handle] (Batch 8.2).
 *
 * Pattern matches the Batch 6 city / community hero - photographic banner
 * with dark gradient, anchored content. Logo sits centred at the top of
 * the content stack and slightly overlaps the banner so the page reads
 * as profile-first.
 */
export function OrganiserProfileHero({ name, coverImage, logoUrl, subtitle, stats, verified, actionSlot }: Props) {
  return (
    <section aria-labelledby="organiser-hero-heading" className="relative overflow-hidden">
      <HeroPresenceMarker />
      <div className="relative h-[50vh] min-h-[350px] max-h-[525px] w-full">
        {coverImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverImage})` }}
            aria-hidden
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',
            }}
            aria-hidden
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.40) 0%, rgba(10,22,40,0.55) 60%, rgba(10,22,40,0.92) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 -mt-16 mx-auto max-w-5xl px-4 pb-8 sm:px-6 sm:-mt-20 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="rounded-full border-4 border-white shadow-xl">
              <OrganiserAvatar src={logoUrl} name={name} size="lg" priority />
            </div>
            {verified ? (
              <span
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--color-navy-950)] shadow-md"
                title="Verified organiser"
                aria-label="Verified organiser"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </span>
            ) : null}
          </div>

          <h1
            id="organiser-hero-heading"
            className="mt-5 font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-5xl"
          >
            {name}
          </h1>

          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-[var(--text-secondary)] sm:text-base">
            {subtitle}
          </p>

          {stats.length > 0 ? (
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3" role="list">
              {stats.map(s => (
                <li key={s.label} className="flex items-center gap-2 text-[var(--text-primary)]">
                  {s.icon === 'cal' ? <CalendarDays className="h-4 w-4 text-[var(--brand-accent-strong)]" aria-hidden /> :
                   s.icon === 'pin' ? <MapPin className="h-4 w-4 text-[var(--brand-accent-strong)]" aria-hidden /> : null}
                  <span className="font-display text-2xl font-bold">{s.value}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{s.label}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {actionSlot ? <div className="mt-6">{actionSlot}</div> : null}
        </div>
      </div>
    </section>
  )
}
