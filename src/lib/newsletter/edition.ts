/**
 * WHAT'S ON IN <CITY>: THE EDITION READ FROM PRODUCTION'S ROWS (law 46; Lawal's brief of 21 November 2026,
 * C:\dev\START-16OCT\NEWSLETTER-BRIEF-LAWAL-21NOV.md, sections 3 to 5). The city's nights still listed in the edition's
 * days (the platform's one listing rule), the nights a drive away, and the city's just announced ticketed nights after
 * it; each night's picture through THE EVENT PAGE'S OWN RESOLVER (withVenuePhotos for 'event_page', then
 * getFeaturedHeroBackground over eventHeroMediaInput, as src/app/events/[slug]/page.tsx renders its hero): the page's
 * own photograph first; a composed poster or no cover takes the licensed category picture the page itself would show
 * (law 46 (d): a licensed image of what the night is), never a picture of something else. The picks are select.ts's,
 * the drawing whats-on.ts's.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { PUBLIC_VISIBILITY, isPubliclyDiscoverable } from '@/lib/events/visibility'
import { endOfLocalDayUtc, isStillListed, listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { eventHeroMediaInput, getFeaturedHeroBackground, heroIsTypographic } from '@/lib/images/event-media'
import { shownSummary } from '@/lib/listings/placeholder-summary'
import { nightDates } from '@/lib/social/lifecycle-plan'
import { carriesBannedWord } from '@/lib/social/words'
import { distributionDeps, nightsLeftOut, venuesOff } from '@/lib/venues/venue-distribution'
import { digestDateLabel, digestPriceLabel, resolveDigestPeriod, type DigestEdition } from '@/lib/broadcast/digest'
import { DRIVE_CITIES, selectSlots, type EditionNight } from './select'
import type { NlPick, WhatsOnInput } from './whats-on'

type Admin = ReturnType<typeof createAdminClient>

/** The licensed city photographs for the hero (Unsplash, under https://unsplash.com/license), as Lawal's design drew them. */
export const CITY_HERO_PHOTOS: Readonly<Record<string, string>> = {
  melbourne: 'https://images.unsplash.com/photo-1766766829410-36cf2f0bdce7?w=1600&q=80&fm=jpg',
  geelong: 'https://images.unsplash.com/photo-1717015532080-48cd61aa7f5f?w=1600&q=80&fm=jpg',
  ballarat: 'https://images.unsplash.com/photo-1688042972203-9958d21eef0c?w=1600&q=80&fm=jpg',
  bendigo: 'https://images.unsplash.com/photo-1747040309614-3393322e79d6?w=1600&q=80&fm=jpg',
}

type Row = {
  id: string
  slug: string
  title: string
  summary: string | null
  start_date: string
  end_date: string | null
  timezone: string | null
  venue_name: string | null
  venue_id: string | null
  city_primary: string | null
  created_at: string | null
  visibility: string | null
  is_seed_data: boolean | null
  is_free: boolean | null
  entry_mode: string | null
  external_ticket_url: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: unknown
  category: { slug: string | null; name: string | null } | null
  ticket_tiers: { price: number; currency: string | null; is_active?: boolean | null }[] | null
}

const COLUMNS =
  'id, slug, title, summary, start_date, end_date, timezone, venue_name, venue_id, city_primary, created_at, visibility, is_seed_data, is_free, entry_mode, external_ticket_url, cover_image_url, thumbnail_url, gallery_urls, category:event_categories!events_category_id_fkey(slug, name), ticket_tiers(price, currency, is_active)'

/** The edition's night: what the selection weighs and what a slot prints. */
export type ReadNight = EditionNight & { readonly pick: NlPick; readonly summary: string | null; readonly citySlug: string }

/**
 * Nights still listed at `now` (the platform's one rule, law 16) starting no later than `toIso`; with `fromIso`, only
 * those starting after it (the Ticket Alert's later nights). Without it a night already under way stays (AMCF on its
 * Saturday): the listing rule alone decides what is over.
 */
async function readNights(admin: Admin, cities: readonly string[], fromIso: string | null, toIso: string, now: Date, limit: number): Promise<Row[]> {
  if (cities.length === 0) return []
  const data = await readOrThrow(`the edition's nights for ${cities.join(', ')}`, () => {
    const q = admin
      .from('events')
      .select(COLUMNS)
      .in('city_primary', [...cities])
      .eq('status', 'published')
      .eq('visibility', PUBLIC_VISIBILITY)
      .or(listingWindowOrPredicate(now))
    // toIso is an exclusive end (endOfLocalDayUtc: the next day's first instant).
    return (fromIso ? q.gte('start_date', fromIso) : q).lt('start_date', toIso).order('start_date', { ascending: true }).limit(limit)
  })
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => isPubliclyDiscoverable(r.visibility) && r.is_seed_data !== true && isStillListed(r, now) && Date.parse(r.start_date) < Date.parse(toIso) && (!fromIso || Date.parse(r.start_date) >= Date.parse(fromIso)),
  )
  const off = nightsLeftOut(rows.map((r) => ({ eventId: r.id, venueId: r.venue_id ?? null })), await venuesOff('weekly_roundup', distributionDeps(admin)))
  return rows.filter((r) => !off.has(r.id))
}

/** A night's date line: a run dated by its days, one under way by its end, one evening by its start. */
export function whenLabelOf(r: Pick<Row, 'start_date' | 'end_date' | 'timezone'>, now: Date): string {
  const zone = r.timezone ?? PLATFORM_TIME_ZONE
  if (Date.parse(r.start_date) < now.getTime() && r.end_date) return `Until ${digestDateLabel(r.end_date, zone)}`
  const run = nightDates(r.start_date, r.end_date, zone)
  return run.includes(' to ') ? run : digestDateLabel(r.start_date, zone)
}

/** Each night's picture by the event page's own chain, the venue photographs asked for once for all the rows. */
async function toNights(rows: readonly Row[], now: Date, origin: string): Promise<ReadNight[]> {
  if (rows.length === 0) return []
  const covers = await withVenuePhotos(rows.map((r) => ({ id: r.id, cover_image_url: r.cover_image_url })), { use: 'event_page' })
  return Promise.all(rows.map((r, i) => toNight(r, covers[i].cover_image_url ?? null, now, origin)))
}

async function toNight(r: Row, cover: string | null, now: Date, origin: string): Promise<ReadNight> {
  const withVenue = { cover_image_url: cover }
  const media = await getFeaturedHeroBackground(eventHeroMediaInput({ ...r, cover_image_url: withVenue.cover_image_url }))
  const typographic = heroIsTypographic(media)
  const ownPhoto = !typographic && media.image === withVenue.cover_image_url
  // A composed poster is never put in a photo slot; the page's licensed category picture is (law 46 (d)).
  const pictured = typographic ? (await getFeaturedHeroBackground(eventHeroMediaInput({ ...r, cover_image_url: null }))).image : media.image
  const image = pictured.startsWith('http') ? pictured : `${origin}${pictured.startsWith('/') ? '' : '/'}${pictured}`
  const tiers = (r.ticket_tiers ?? []).filter((t) => t.is_active !== false)
  const ticketedHere = tiers.some((t) => t.price > 0)
  const ticketed = r.is_free !== true && r.entry_mode !== 'walk_in' && (ticketedHere || Boolean((r.external_ticket_url ?? '').trim()))
  const priceLabel = digestPriceLabel(tiers, r.external_ticket_url, { isFree: r.is_free, entryMode: r.entry_mode })
  const categoryName = r.category?.name ?? null
  const pick: NlPick = {
    slug: r.slug,
    title: r.title,
    categoryLabel: categoryName,
    categorySlug: r.category?.slug ?? null,
    whenLabel: whenLabelOf(r, now),
    venue: (r.venue_name ?? '').trim() || 'See the event page',
    priceLabel: priceLabel || (r.is_free ? 'Free entry' : 'See the event page'),
    image,
    imageAlt: ownPhoto ? `${r.title}, at ${r.venue_name ?? 'its venue'}` : `${categoryName ?? 'An event'} in ${r.city_primary ?? 'the city'}, an illustrative photo`,
  }
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    startDate: r.start_date,
    endDate: r.end_date,
    venue: r.venue_name,
    categorySlug: r.category?.slug ?? null,
    categoryName,
    isFree: r.is_free === true || priceLabel === 'Free entry',
    ticketed,
    ticketedHere,
    image,
    ownPhoto,
    listedAt: r.created_at,
    pick,
    summary: shownSummary(r.summary),
    citySlug: r.city_primary ?? '',
  }
}

/** A short blurb for the featured night from its own words: its first sentence, never the banned word outside its name. */
export function blurbOf(n: Pick<ReadNight, 'summary' | 'title' | 'venue'>): string | null {
  const s = (n.summary ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const first = s.match(/^.{20,220}?[.?](\s|$)/)?.[0]?.trim() ?? (s.length <= 220 ? s : null)
  if (!first || carriesBannedWord(first, [n.title, n.venue])) return null
  return first
}

const compose = (origin: string, kind: string, src: string | null) => `${origin}/api/newsletter/image?k=${kind}${src ? `&src=${encodeURIComponent(src)}` : ''}`

/** The intro from what the edition carries: true to its picks, never a promise. */
export function introOf(cityName: string, edition: DigestEdition, nights: readonly ReadNight[]): string {
  const kinds: string[] = []
  const has = (re: RegExp) => nights.some((n) => re.test(`${n.categorySlug ?? ''} ${n.categoryName ?? ''}`))
  if (has(/festival/i)) kinds.push('festivals')
  if (has(/music|concert|gig/i)) kinds.push('live music')
  if (has(/comedy/i)) kinds.push('comedy')
  if (has(/theatre|arts|performance/i)) kinds.push('theatre')
  const free = nights.some((n) => n.isFree)
  const list = [...kinds, ...(free ? ['free things to do'] : [])]
  const words = list.length === 0 ? 'plenty to do' : list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  return `Here is the best of this ${edition === 'weekend' ? 'weekend' : 'week'} in ${cityName}: ${words}. Our top picks to help you plan it.`
}

/** The edition for one city, read and picked; the drawing is buildWhatsOn's. */
export async function readWhatsOnEdition(
  admin: Admin,
  input: { readonly citySlug: string; readonly cityName: string; readonly edition: DigestEdition; readonly now: Date; readonly origin: string; readonly unsubscribeUrl: string },
): Promise<{ readonly edition: WhatsOnInput; readonly period: { start: string; end: string } }> {
  const { citySlug, cityName, edition, now, origin } = input
  const period = resolveDigestPeriod(now, edition)
  const periodEnd = endOfLocalDayUtc(new Date(`${period.end}T12:00:00Z`), PLATFORM_TIME_ZONE)
  const later = new Date(periodEnd.getTime() + 120 * 86_400_000)
  const [own, near, ahead] = await Promise.all([
    readNights(admin, [citySlug], null, periodEnd.toISOString(), now, 400),
    readNights(admin, DRIVE_CITIES[citySlug] ?? [], null, periodEnd.toISOString(), now, 200),
    readNights(admin, [citySlug], periodEnd.toISOString(), later.toISOString(), now, 300),
  ])
  const since = now.getTime() - 7 * 86_400_000
  const [nights, driveNights, laterNights] = await Promise.all([
    toNights(own, now, origin),
    toNights(near, now, origin),
    toNights(ahead.filter((r) => r.created_at !== null && Date.parse(r.created_at) >= since), now, origin),
  ])
  const slots = selectSlots({ nights, driveNights, laterNights, now })
  const cityNameOf = (slug: string) => slug.replace(/(^|-)([a-z])/g, (_m, s: string, c: string) => `${s ? ' ' : ''}${c.toUpperCase()}`)
  const range = `${period.start}T12:00:00Z`
  const datesLabel = nightDates(range, `${period.end}T12:00:01Z`, 'UTC')
  const year = period.end.slice(0, 4)
  const hero = CITY_HERO_PHOTOS[citySlug] ?? null
  return {
    period,
    edition: {
      edition,
      editionId: `${edition}-${citySlug}-${period.start}`,
      cityName,
      citySlug,
      datesLabel: `${datesLabel} ${year}`,
      subjectDates: datesLabel,
      areaLabel: `${cityName} & Surrounds`,
      heroImage: { desktop: compose(origin, 'hero-d', hero), mobile: compose(origin, 'hero-m', hero) },
      intro: introOf(cityName, edition, [slots.featured, ...slots.highlights, slots.free].filter((n): n is ReadNight => n !== null)),
      featured: slots.featured
        ? { ...slots.featured.pick, blurb: blurbOf(slots.featured), featImage: { desktop: compose(origin, 'feat-d', slots.featured.image), mobile: compose(origin, 'feat-m', slots.featured.image) } }
        : null,
      highlights: slots.highlights.map((n) => ({ ...n.pick, image: compose(origin, 'card', n.image) })),
      free: slots.free?.pick ?? null,
      gem: slots.gem?.pick ?? null,
      drive: slots.drive ? { ...slots.drive.pick, cityName: cityNameOf(slots.drive.citySlug) } : null,
      alerts: slots.alerts.map((n) => n.pick),
      origin,
      unsubscribeUrl: input.unsubscribeUrl,
      manageUrl: `${origin}/newsletter/city`,
      referUrl: `${origin}/newsletter/refer`,
    },
  }
}
