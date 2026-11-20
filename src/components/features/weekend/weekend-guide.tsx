import Link from 'next/link'
import { Great_Vibes } from 'next/font/google'
import { HeroMedia } from '@/components/media/HeroMedia'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import { cleanTitle } from '@/lib/social/campaign'
import type { ReadNight } from '@/lib/newsletter/edition'

/**
 * THE WEEKEND GUIDE, VICTORIA (law 46 (b); Lawal's design B of 21 November 2026, its reference
 * C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on\build_b.py and b-phone.png): the photographic hero with 'The Weekend Guide'
 * and 'Victoria' in its gold script, the five category chips to this weekend's filtered views, the weekend's feature, the
 * top picks with thumbnails, and Explore more to /state/victoria. On this surface a title may sit on its photograph under
 * a navy wash (law 46 (c)); every event picture is the event page's own resolver's (src/lib/newsletter/edition.ts), and
 * the two scenic photographs are the licensed library's own (src/lib/images/spine.ts), looked at before use.
 */
const script = Great_Vibes({ subsets: ['latin'], weight: '400', display: 'swap' })

export type WeekendChip = { readonly icon: string; readonly label: string; readonly href: string }

/** The five chips of design B, each to this weekend's own filtered view of /events (src/lib/events/fetchers.ts presets). */
export const WEEKEND_CHIPS: readonly WeekendChip[] = [
  { icon: '\u{1F3B5}', label: 'Festivals', href: '/events?preset=weekend&q=festival' },
  { icon: '\u{1F3A4}', label: 'Live Music', href: '/events?preset=weekend&q=live%20music' },
  { icon: '\u{1F604}', label: 'Comedy', href: '/events?preset=weekend&q=comedy' },
  { icon: '\u{1F46A}', label: 'Family', href: '/events?preset=weekend&q=family' },
  { icon: '\u{1F381}', label: 'Free', href: '/events?preset=free' },
]

/** A licensed stock picture standing for a night says so (law 46 (f), Lawal's 09:16 of 21 November 2026). */
function IllustrativeLabel({ small = false }: { readonly small?: boolean }) {
  return (
    <span data-illustrative className={`absolute left-2 top-2 z-10 rounded bg-[var(--color-navy-950)]/75 font-bold text-white ${small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[11px]'}`}>
      Illustrative photo
    </span>
  )
}

export function WeekendGuide({
  datesLabel,
  featured,
  picks,
  hero,
  explore,
}: {
  readonly datesLabel: string
  readonly featured: ReadNight | null
  readonly picks: readonly ReadNight[]
  readonly hero: { readonly src: string; readonly alt: string } | null
  readonly explore: { readonly src: string; readonly alt: string } | null
}) {
  return (
    <main data-page="weekend" className="bg-[var(--surface-1,#ffffff)] pb-12">
      <section data-section="weekend-hero" aria-label="The Weekend Guide, Victoria" className="relative h-[330px] overflow-hidden bg-[var(--color-navy-950)] text-white sm:h-[380px]">
        {hero ? <HeroMedia image={hero.src} alt={hero.alt} priority sizes="100vw" objectPosition="50% 40%" /> : null}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy-950)]/85 via-[var(--color-navy-950)]/35 to-[var(--color-navy-950)]/20" />
        <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-between px-5 pb-16 pt-8 sm:px-8">
          <h1 className="font-display text-[40px] font-extrabold leading-[44px] sm:text-5xl sm:leading-[54px]">
            The Weekend
            <br />
            Guide{' '}
            <span className={`${script.className} -ml-1 inline-block -rotate-6 text-[52px] font-normal leading-[40px] text-[var(--brand-accent)] sm:text-[64px]`}>Victoria</span>
          </h1>
          <p className="flex flex-wrap items-center gap-3 text-[15px] font-bold leading-5">
            <span>{'\u{1F4C5}'} {datesLabel}</span>
            <span aria-hidden="true" className="font-normal text-white/60">|</span>
            <span>{'\u{1F4CD}'} Victoria</span>
          </p>
        </div>
      </section>

      <nav aria-label="This weekend by kind" className="relative z-10 mx-3.5 -mt-9 max-w-3xl rounded-2xl bg-white p-1.5 shadow-[0_10px_28px_rgba(10,22,40,0.12)] sm:mx-auto">
        <ul className="flex justify-between">
          {WEEKEND_CHIPS.map((c, i) => (
            <li key={c.label} className={`flex-1 ${i > 0 ? 'border-l border-[#EEEEEE]' : ''}`}>
              <Link href={c.href} prefetch={false} data-chip={c.label} className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold text-[var(--color-navy-950)] hover:bg-[var(--color-navy-950)]/[0.04]">
                <span aria-hidden="true" className="text-[22px] leading-6">{c.icon}</span>
                <span>{c.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-7xl px-3.5 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
        {featured ? (
          <Link href={`/events/${featured.slug}`} data-feature={featured.slug} className="relative mt-5 block h-[330px] overflow-hidden rounded-[18px] bg-[var(--color-navy-950)] text-white lg:h-[460px]">
            {featured.pageImage ? (
              <EventCardMedia src={featured.pageImage} alt={featured.pick.imageAlt} variant="bento-hero" className="absolute inset-0" title={featured.title} />
            ) : null}
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy-950)]/90 via-[var(--color-navy-950)]/30 to-transparent" />
            {featured.ownPhoto || !featured.pageImage ? null : <IllustrativeLabel />}
            <span className="absolute right-3 top-3 rounded-full bg-[var(--brand-accent)] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--color-navy-950)]">This weekend&#8217;s feature</span>
            <span className="absolute inset-x-[18px] bottom-[18px] block pr-14">
              <span className="block font-display text-[28px] font-extrabold leading-[32px]">{cleanTitle(featured.title)}</span>
              {featured.summary ? <span className="mt-1.5 line-clamp-2 block text-sm font-medium leading-5 text-[#E6EAF0]">{featured.summary}</span> : null}
              <span className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-sm font-bold leading-5">
                <span>{'\u{1F4C5}'} {featured.pick.whenLabel}</span>
                <span>{'\u{1F4CD}'} {featured.pick.venue}</span>
              </span>
            </span>
            <span aria-hidden="true" className="absolute bottom-[18px] right-[18px] flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[var(--brand-accent)] text-2xl font-extrabold text-[var(--color-navy-950)]">&rarr;</span>
          </Link>
        ) : null}

        {picks.length > 0 ? (
          <section data-section="weekend-picks" aria-label="Top Picks in Victoria" className="mt-6">
            <h2 className="mx-1 font-display text-2xl font-extrabold leading-[30px] text-[var(--color-navy-950)]">Top Picks in Victoria</h2>
            <ul className="mt-2">
              {picks.map((n) => (
                <li key={n.id} className="border-b border-[#ECE9E2]">
                  <Link href={`/events/${n.slug}`} data-pick={n.slug} className="flex min-h-[44px] items-center gap-3.5 px-1 py-3">
                    <span className="relative block h-[95px] w-[130px] flex-none overflow-hidden rounded-[10px] bg-[var(--color-navy-950)]">
                      {n.pageImage ? <EventCardMedia src={n.pageImage} alt={n.pick.imageAlt} variant="rail-scene-tile" className="absolute inset-0" title={n.title} /> : null}
                      {n.ownPhoto || !n.pageImage ? null : <IllustrativeLabel small />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-extrabold leading-[21px] text-[var(--color-navy-950)]">{cleanTitle(n.title)}</span>
                      <span className="mt-1 block text-[13px] font-semibold leading-[19px] text-[#3D4657]">
                        {'\u{1F4C5}'} {n.pick.whenLabel} <span className="text-[var(--brand-accent-strong)]">&bull;</span> {n.pick.venue}
                      </span>
                      <span className="mt-1 block text-[13px] font-semibold leading-[19px] text-[#3D4657]">
                        {'\u{1F39F}\u{FE0F}'} {n.pick.priceLabel}
                        {n.categoryName ? ` \u00B7 ${n.categoryName}` : ''}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-[30px] font-extrabold leading-[30px] text-[var(--brand-accent-strong)]">&rsaquo;</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {!featured && picks.length === 0 ? (
        <p data-section="weekend-empty" className="mx-auto mt-8 max-w-3xl px-5 text-base text-[#3D4657]">
          Nothing is listed across Victoria for the rest of this weekend yet. See everything coming up on <Link href="/state/victoria" className="font-bold text-[var(--brand-accent-strong)] underline">the Victoria guide</Link>.
        </p>
      ) : null}

      <div className="mx-auto max-w-7xl px-3.5 sm:px-8">
        <Link href="/state/victoria" data-explore className="relative mt-6 block h-[190px] overflow-hidden rounded-[18px] bg-[var(--color-navy-950)] text-white sm:h-[240px]">
          {explore ? <EventCardMedia src={explore.src} alt={explore.alt} variant="bento-hero" className="absolute inset-0" /> : null}
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[var(--color-navy-950)]/85 via-[var(--color-navy-950)]/45 to-transparent" />
          <span className="absolute left-[22px] top-[30px] max-w-[260px] font-display text-[30px] font-extrabold italic leading-[34px]">Explore more events across Victoria</span>
          <span aria-hidden="true" className="absolute bottom-[18px] right-[18px] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[28px] font-extrabold text-[var(--color-navy-950)]">&rarr;</span>
        </Link>
      </div>
    </main>
  )
}
