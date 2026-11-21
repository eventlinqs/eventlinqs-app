/**
 * THE EDITION'S PICKS, TRANSPARENT AND PURE (Lawal's brief of 21 November 2026, sections 4 and 5:
 * C:\dev\START-16OCT\NEWSLETTER-BRIEF-LAWAL-21NOV.md). Every slot is filled only from real nights still on; a slot the
 * city's supply cannot fill is left out, never invented. The rank is written here, not in a model: law 18's tier first
 * (a ticketed night at a headline venue, then every other ticketed night and free festivals, then markets and community,
 * library sessions and classes last), then a night with its own photograph, then an EventLinqs ticketed night among
 * equals (the brief allows it 'among similarly relevant events'), then the soonest. Category variety across the photo
 * slots: no two highlights of one category while another is there to choose. No night appears twice in an edition.
 */
import { tierOf, type Tier } from '@/lib/events/relevance'

export type EditionNight = {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly startDate: string
  readonly endDate: string | null
  readonly venue: string | null
  readonly categorySlug: string | null
  readonly categoryName: string | null
  readonly isFree: boolean
  /** Sold by ticket, ours or another site's (relevance.ts 'ticketed'). */
  readonly ticketed: boolean
  /** Sold through EventLinqs' own checkout. */
  readonly ticketedHere: boolean
  /** The image the slot would show; null when none can be shown. */
  readonly image: string | null
  /** The event page's own photograph (not a composed poster, not a stand in). */
  readonly ownPhoto: boolean
  /** When it was first listed, for the Ticket Alert. */
  readonly listedAt: string | null
}

export type EditionSlots<N extends EditionNight> = {
  readonly featured: N | null
  readonly highlights: readonly N[]
  readonly free: N | null
  readonly gem: N | null
  readonly drive: N | null
  readonly alerts: readonly N[]
}

/** The edition's tier of a night: law 18's own (src/lib/events/relevance.ts), never a second rule. */
export const tierOfNight = (n: EditionNight): Tier => tierOf({ title: n.title, venue: n.venue, categorySlug: n.categorySlug, ticketed: n.ticketed })

/** The rank, written out: a smaller key comes first. */
export function rankKey(n: EditionNight): readonly number[] {
  return [tierOfNight(n), n.ownPhoto ? 0 : n.image ? 1 : 2, n.ticketedHere ? 0 : 1, Date.parse(n.startDate)]
}

function byRank(a: EditionNight, b: EditionNight): number {
  const ka = rankKey(a)
  const kb = rankKey(b)
  for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] - kb[i]
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
}

/** A night just announced: first listed inside the last `days` days. */
export const JUST_ANNOUNCED_DAYS = 7

/**
 * The picks. `nights` are the edition's own (the city, the period, still listed); `driveNights` the period's nights in
 * the cities a drive away; `laterNights` the city's ticketed nights after the period, for the Ticket Alert.
 */
export function selectSlots<N extends EditionNight>(input: {
  readonly nights: readonly N[]
  readonly driveNights: readonly N[]
  readonly laterNights: readonly N[]
  readonly now: Date
}): EditionSlots<N> {
  const used = new Set<string>()
  const take = (n: N | undefined | null): N | null => {
    if (!n) return null
    used.add(n.id)
    return n
  }
  const ranked = [...input.nights].sort(byRank)
  const fresh = (n: N) => !used.has(n.id)

  // Don't Miss: the strongest night with an image, never a library session or class.
  const featured = take(ranked.find((n) => n.image !== null && tierOfNight(n) < 4))

  // More highlights: three with images, tier 4 never, a category not yet shown first.
  const highlights: N[] = []
  const seen = new Set<string>(featured?.categorySlug ? [featured.categorySlug] : [])
  for (const pass of [0, 1]) {
    for (const n of ranked) {
      if (highlights.length === 3) break
      if (!fresh(n) || n.image === null || tierOfNight(n) === 4) continue
      if (pass === 0 && n.categorySlug && seen.has(n.categorySlug)) continue
      highlights.push(n)
      used.add(n.id)
      if (n.categorySlug) seen.add(n.categorySlug)
    }
  }

  // Free: the best free night left (a library session only when nothing else is free).
  const free = take(ranked.find((n) => fresh(n) && n.isFree))

  // Hidden gem: a night away from the headline venues, not a session: tier 2 or 3 left, the soonest.
  const gem = take(
    [...ranked]
      .filter((n) => fresh(n) && (tierOfNight(n) === 2 || tierOfNight(n) === 3))
      .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))[0],
  )

  // Worth the drive: the strongest ticketed or festival night in a city a drive away.
  const drive = take([...input.driveNights].filter((n) => fresh(n) && tierOfNight(n) <= 2).sort(byRank)[0])

  // Ticket alert: up to two ticketed nights after the period, first listed in the last week, strongest first.
  const since = input.now.getTime() - JUST_ANNOUNCED_DAYS * 86_400_000
  const alerts = [...input.laterNights]
    .filter((n) => fresh(n) && n.ticketed && tierOfNight(n) <= 2 && n.listedAt !== null && Date.parse(n.listedAt) >= since)
    .sort(byRank)
    .slice(0, 2)
  for (const a of alerts) used.add(a.id)

  return { featured, highlights, free, gem, drive, alerts }
}

/** The cities a drive away, for Worth the Drive (Victoria's four; a city outside them has none yet). */
export const DRIVE_CITIES: Readonly<Record<string, readonly string[]>> = {
  melbourne: ['geelong', 'ballarat', 'bendigo'],
  geelong: ['melbourne', 'ballarat'],
  ballarat: ['melbourne', 'bendigo', 'geelong'],
  bendigo: ['melbourne', 'ballarat'],
}
