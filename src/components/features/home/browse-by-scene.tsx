import Link from 'next/link'
import { Music, Zap, Globe, Heart, Mic2, UtensilsCrossed, Tag, Calendar } from 'lucide-react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { CONTAINER } from '@/lib/ui/spacing'

/**
 * BrowseByScene - the breadth + music/genre entry point, placed high on the
 * homepage the way Ticketmaster leads with category breadth and Eventbrite
 * with its type strip. We lead with sound and scene (Live music, Afrobeats,
 * Amapiano, Gospel) then widen to comedy, food and time-based discovery.
 *
 * Every tile routes to a REAL, wired destination only:
 *   - /categories/[slug] hero landing pages (afrobeats, amapiano, gospel)
 *   - /events?category= and ?free / ?when filters proven by the chip strip
 * No genre/artist module is faked; the artist-following and follow-feed
 * slots drop straight in here later against the shipped DB contract.
 *
 * Per-tile colour tint is the brief's "gold plus per-genre tint" punch over
 * the navy field; icons are decorative (aria-hidden), labels carry meaning.
 */

interface SceneTile {
  label: string
  sub: string
  href: string
  icon: typeof Music
  tint: string
}

const SCENES: SceneTile[] = [
  { label: 'Live music',     sub: 'Gigs and concerts',   href: '/events?category=music',    icon: Music,           tint: 'var(--color-coral-500)' },
  { label: 'Afrobeats',      sub: 'The afro sound',       href: '/categories/afrobeats',     icon: Zap,             tint: 'var(--color-gold-400)' },
  { label: 'Amapiano',       sub: 'Log-drum nights',      href: '/categories/amapiano',      icon: Globe,           tint: 'var(--color-gold-400)' },
  { label: 'Gospel',         sub: 'Praise and worship',   href: '/categories/gospel',        icon: Heart,           tint: 'var(--color-gold-400)' },
  { label: 'Comedy',         sub: 'Stand-up and laughs',  href: '/events?category=comedy',   icon: Mic2,            tint: 'var(--color-coral-500)' },
  { label: 'Food and drink', sub: 'Feasts and markets',   href: '/events?category=food',     icon: UtensilsCrossed, tint: 'var(--color-warning)' },
  { label: 'Free tonight',   sub: 'No ticket needed',     href: '/events?free=1',            icon: Tag,             tint: 'var(--color-success)' },
  { label: 'This weekend',   sub: 'Plans, sorted',        href: '/events?when=weekend',      icon: Calendar,        tint: 'var(--color-info)' },
]

export function BrowseByScene() {
  return (
    <section aria-labelledby="scene-heading" className="bg-canvas">
      <div className={`${CONTAINER} py-12 sm:py-16`}>
        <SectionHeader id="scene-heading" eyebrow="Browse the lineup" title="Pick your scene" />
        <p className="mt-3 max-w-xl text-sm text-ink-600 sm:text-base">
          Music, comedy, food and the nights in between. Start with a sound or a vibe and follow it.
        </p>

        <ul role="list" className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {SCENES.map(s => {
            const Icon = s.icon
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  prefetch={false}
                  className="tile-lift group flex h-full min-h-[7.5rem] flex-col justify-between rounded-2xl border border-white/10 bg-[var(--color-navy-950)] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                    <Icon className="h-5 w-5" style={{ color: s.tint }} aria-hidden />
                  </span>
                  <span className="mt-5">
                    <span className="block font-headline text-lg font-bold tracking-tight text-white">
                      {s.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/60">{s.sub}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
