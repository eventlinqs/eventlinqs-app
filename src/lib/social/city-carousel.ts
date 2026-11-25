import { dayRowOf, featureSlideOf, listEmoji, type CampaignNight, type Slide } from './campaign'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { goHop } from './go-hop'
import { getCityBanner } from '@/lib/images/city-photo'

/**
 * "THINGS TO DO IN [CITY] THIS WEEK", THE WEEKLY CITY CAROUSEL (Lawal's yes, 25 November 2026, 00:47; the PM's 01:12 and
 * C:\dev\START-16OCT\SOCIAL-BENCHMARK-PLAYBOOK-25NOV.md section 5). One carousel per city per week, posted Monday
 * morning in the engine's own window. This file holds its rules as pure functions, each with its test
 * (tests/unit/social/city-carousel.test.ts): which eight events, the cover's date strip and icon row, and the caption.
 *
 * Which events (section 5, "the engine chooses, every rule from the rows"):
 *   - eight events in the seven days from the post, never one that starts before the post goes out;
 *   - one per title (a show's later nights are its one card);
 *   - spread across at least three categories and at least four days, and at least one free event when the week has one;
 *   - ahead of others: organisers who gave photo permission, organisers on EventLinqs ticketing, then organisers we are
 *     writing to (each one a relationship), then the rest, sooner first.
 * Public, fresh and a live booking hop are the reader's to hold (the nights it passes in are the guide's own).
 */

export const CAROUSEL_EVENTS = 8
export const CAROUSEL_MIN_CATEGORIES = 3
export const CAROUSEL_MIN_DAYS = 4
const WEEK_MS = 7 * 86_400_000

/** Why a night leads: the organiser's relationship with us, strongest first. */
export type Relationship = 'permission' | 'ticketing' | 'writing'
const RANK: Readonly<Record<Relationship, number>> = { permission: 0, ticketing: 1, writing: 2 }

export type CarouselNight = CampaignNight & {
  readonly free: boolean
  /** The category's own name as the guide prints it (event_categories.name), or null. */
  readonly categoryName: string | null
  readonly relationship: Relationship | null
}

export type CarouselChoice = {
  readonly nights: CarouselNight[]
  /** Each rule the week could not meet, said plainly; empty when every rule is met. */
  readonly short: string[]
}

const ZONE = 'Australia/Melbourne'
/** A night's day on its own clock, as the guide prints it (yyyy-mm-dd). */
export function dayOf(n: Pick<CampaignNight, 'startDate' | 'timezone'>): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: n.timezone ?? ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(n.startDate))
}
const titleKey = (n: CampaignNight) => n.title.trim().toLowerCase()
/** Permission, then ticketing, then writing, then the rest. */
const rankOf = (n: CarouselNight) => (n.relationship ? RANK[n.relationship] : 3)

/** The eight events, as section 5 chooses them. Pure. */
export function chooseCarouselNights(candidates: readonly CarouselNight[], postAt: Date): CarouselChoice {
  const from = postAt.getTime()
  const inWeek = candidates
    .filter((n) => {
      const at = Date.parse(n.startDate)
      return Number.isFinite(at) && at > from && at < from + WEEK_MS
    })
    .sort((a, b) => rankOf(a) - rankOf(b) || Date.parse(a.startDate) - Date.parse(b.startDate))
  const seen = new Set<string>()
  const pool = inWeek.filter((n) => !seen.has(titleKey(n)) && Boolean(seen.add(titleKey(n))))

  const chosen: CarouselNight[] = []
  const take = (n: CarouselNight) => {
    chosen.push(n)
    pool.splice(pool.indexOf(n), 1)
  }
  const free = pool.find((n) => n.free)
  if (free) take(free)
  while (chosen.length < CAROUSEL_EVENTS && pool.length > 0) {
    const cats = new Set(chosen.map((n) => n.categoryName).filter(Boolean))
    const days = new Set(chosen.map(dayOf))
    const needCat = cats.size < CAROUSEL_MIN_CATEGORIES
    const needDay = days.size < CAROUSEL_MIN_DAYS
    const widens = pool.find((n) => (needCat && n.categoryName && !cats.has(n.categoryName)) || (needDay && !days.has(dayOf(n))))
    take(widens ?? pool[0])
  }
  chosen.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))

  const short: string[] = []
  const cats = new Set(chosen.map((n) => n.categoryName).filter(Boolean)).size
  const days = new Set(chosen.map(dayOf)).size
  if (chosen.length < CAROUSEL_EVENTS) short.push(`the seven days hold ${chosen.length} events, not ${CAROUSEL_EVENTS}`)
  if (cats < CAROUSEL_MIN_CATEGORIES) short.push(`the events chosen span ${cats} categories, not ${CAROUSEL_MIN_CATEGORIES}`)
  if (days < CAROUSEL_MIN_DAYS) short.push(`the events chosen fall on ${days} days, not ${CAROUSEL_MIN_DAYS}`)
  return { nights: chosen, short }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function parts(at: Date): { d: number; m: number; y: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number)
  return { d, m: m - 1, y }
}

/**
 * The cover's date strip: the post's day to six days on, written with "to", never a dash ("23 to 29 NOV 2026"; across
 * a month "30 NOV to 6 DEC 2026"; across a year "28 DEC 2026 to 3 JAN 2027"). Pure.
 */
export function dateStrip(postAt: Date): string {
  return weekWords(postAt, (m) => MONTHS[m], true)
}

/** The week in a caption's words: "30 Nov to 6 Dec", the year only when the week crosses one. Pure. */
export function captionWeek(postAt: Date): string {
  return weekWords(postAt, (m) => MONTHS[m][0] + MONTHS[m].slice(1).toLowerCase(), false)
}

function weekWords(postAt: Date, month: (m: number) => string, withYear: boolean): string {
  const a = parts(postAt)
  const b = parts(new Date(postAt.getTime() + 6 * 86_400_000))
  if (a.y !== b.y) return `${a.d} ${month(a.m)} ${a.y} to ${b.d} ${month(b.m)} ${b.y}`
  const tail = withYear ? ` ${b.y}` : ''
  if (a.m !== b.m) return `${a.d} ${month(a.m)} to ${b.d} ${month(b.m)}${tail}`
  return `${a.d} to ${b.d} ${month(b.m)}${tail}`
}

/**
 * The cover's icon row, from the week's real events: the number of events, then up to four labels present, the most
 * common categories first and FREE when one is free ("8 EVENTS · MUSIC · COMEDY · FAMILY · FREE"). Pure.
 */
export function iconRow(nights: readonly CarouselNight[]): string {
  const count = new Map<string, number>()
  for (const n of nights) if (n.categoryName) count.set(n.categoryName.toUpperCase(), (count.get(n.categoryName.toUpperCase()) ?? 0) + 1)
  const hasFree = nights.some((n) => n.free)
  const labels = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c).slice(0, hasFree ? 3 : 4)
  if (hasFree) labels.push('FREE')
  return [`${nights.length} ${nights.length === 1 ? 'EVENT' : 'EVENTS'}`, ...labels].join(' · ')
}

/** A night's day as a caption line names it: its weekday and date, never a relative day ("Tue 1 Dec"). Pure. */
export function captionDay(n: Pick<CampaignNight, 'startDate' | 'timezone'>): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: n.timezone ?? ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(n.startDate)).replace(/,/g, '')
}

/** A night's place as its caption line names it: the place the listing gives, else its venue, else none. Pure. */
export function placeOfNight(n: Pick<CampaignNight, 'placeName' | 'venueName'>): string | null {
  return n.placeName?.trim() || n.venueName?.trim() || null
}

/**
 * The caption (section 5): one hook line naming the city and the week's dates, one line per event with its day and its
 * place, the question, the one action, then at most three tags. No relative day anywhere, so the hook names the dates and
 * never says "this week" (the playbook's no-relative-date; the cover's own words say it). Each line names its night and
 * its venue, as the creative intake's fact gate reads every caption. Facebook carries the piece's own counted /go hop
 * (./go-hop.ts, its mark replaced by the piece's id at the handoff); Instagram carries no link and says "link in our bio"
 * once (the bio reaches /ig). Pure.
 */
export function carouselCaption(input: {
  readonly city: string
  readonly postAt: Date
  readonly nights: readonly CarouselNight[]
  readonly platform: 'facebook' | 'instagram'
  /** Facebook's one link: the piece's counted /go hop. */
  readonly hop: string
  readonly tags: readonly string[]
}): string {
  // Caption standard version 2 (caption-marks.ts): it leads with the nights' own emoji (campaign.ts listEmoji), one only.
  const lines = [`${listEmoji(input.nights, false)} Things to do in ${input.city}, ${captionWeek(input.postAt)}.`, '']
  for (const n of input.nights) {
    const place = placeOfNight(n)
    lines.push(`${captionDay(n)}: ${n.title}${place ? `, ${place}` : ''}${n.free ? ' (free)' : ''}`)
  }
  lines.push('', 'Which one are you going to?', '')
  lines.push(input.platform === 'instagram' ? 'Every event and where to book: link in our bio.' : `Every event and where to book: ${input.hop}`)
  const tags = input.tags.slice(0, 3)
  if (tags.length) lines.push('', tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '))
  return lines.join('\n')
}

/** The licensed photograph of the city itself for the cover (law 46 (f): its licence recorded in the media register). */
export type CityPhoto = { readonly url: string; readonly credit: string | null }

/**
 * A CITY'S OWN COVER PHOTOGRAPH FOR THE CAROUSEL, where its guide's banner cannot serve (WINDOW 5C, 25 November 2026):
 * Melbourne's guide shows the photo-day spine's skyline, which the media register refuses for a post. Chosen by looking
 * at four Wikimedia Commons quality images of the city (C:\dev\EVIDENCE\EL-25NOV\city-carousel\melbourne-photo): a City
 * Circle tram on a spring street, the playbook's "bright and in season" with one of its named subjects; the night shots
 * of Flinders Street Station and the Northbank were not bright. Kept at 1920 wide in public/social/cities. CC BY-SA 4.0
 * asks for the author, the licence and the source wherever it is shown: the credit says the first two, the register's
 * row holds the page.
 */
export const CITY_COVERS: Readonly<Record<string, { src: string; author: string; licence: 'CC BY-SA 4.0'; page: string }>> = {
  melbourne: {
    src: '/social/cities/melbourne-city-circle-tram.jpg',
    author: 'Dietmar Rabich',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Melbourne_(AU),_City_Circle_Tram_--_2019_--_1547.jpg',
  },
}

/**
 * A night's organiser's relationship with us, as the carousel ranks it (the playbook's section 5): a photograph with its
 * rights recorded, then a night on EventLinqs ticketing, then an organiser we are writing to, when the reader names those
 * nights. Pure.
 */
export function relationshipOf(n: Pick<CampaignNight, 'eventId' | 'approvedPhotoUrl' | 'cta'>, writing?: ReadonlySet<string>): Relationship | null {
  if (n.approvedPhotoUrl) return 'permission'
  if (n.cta.ticketingByEventLinqs) return 'ticketing'
  return writing?.has(n.eventId) ? 'writing' : null
}

/** A guide night as the carousel reads it: whether it is free, its category's own name, its organiser's relationship. Pure. */
export function carouselNightOf(n: CampaignNight, writing?: ReadonlySet<string>): CarouselNight {
  return { ...n, free: n.cta.state === 'free_open' || n.cta.state === 'free_registration', categoryName: n.categoryName ?? null, relationship: relationshipOf(n, writing) }
}

/**
 * The first night starts at least this long after the post: the timing engine holds a piece of nights still ahead until two
 * hours before the first one's doors (timing.ts AHEAD_LEAD_MINUTES), so a first night from 6pm keeps Monday's daytime
 * bands open to the carousel.
 */
export const CAROUSEL_LEAD_HOURS = 12

export type CarouselDesign = {
  readonly nights: CarouselNight[]
  readonly slides: Slide[]
  readonly captions: { readonly instagram: string; readonly facebook: string }
  /** The page the post sends people to: the city's guide, which lists every night it shows. */
  readonly link: string
  readonly picks: { readonly eventId: string; readonly reason: string }[]
  /** Each rule the week could not meet, said plainly; empty when every rule is met. */
  readonly short: string[]
}

/**
 * THE CAROUSEL'S DESIGN, IN THE LOCKED LOOK (the 9.5 look's own slides, src/lib/broadcast/day-cards.ts): the cover over the
 * city's own licensed photograph ("THINGS TO DO IN" / the city, in the accent / "THIS WEEK", the date strip, the icon row,
 * and the photograph's licence credit, which law 17 as narrowed keeps), one feature slide per event (its own permitted
 * photograph, the organiser's, printed with no credit; else drawn in type: its day, time and place, its name, its entry
 * line, its category or FREE), and the ask. It is the brief the make step renders into finished files for the creative
 * intake (./carousel-make.ts), never a piece planned by itself: law 37 posts only a photograph whole or a finished file
 * (law37.ts). Null when the city has no licensed photograph of its own, or the week holds fewer than two events. Pure.
 */
export function carouselDesign(input: {
  readonly city: { readonly slug: string; readonly name: string }
  readonly nights: readonly CarouselNight[]
  readonly postAt: Date
  readonly origin: string
  readonly cityPhoto: CityPhoto | null
  readonly tags: readonly string[]
}): CarouselDesign | null {
  if (!input.cityPhoto) return null
  const from = input.postAt.getTime() + CAROUSEL_LEAD_HOURS * 3_600_000
  const choice = chooseCarouselNights(input.nights.filter((n) => Date.parse(n.startDate) >= from), input.postAt)
  const nights = choice.nights
  if (nights.length < 2) return null
  const cover: Slide = {
    t: 'week_cover',
    composition: 'contents_cover',
    range: dateStrip(input.postAt),
    lines: ['THINGS TO DO IN', input.city.name.toUpperCase(), 'THIS WEEK'],
    accentLine: 1,
    draws: iconRow(nights),
    line: '',
    photoEventId: null,
    photo: input.cityPhoto.url,
    credit: input.cityPhoto.credit,
  }
  const features: Slide[] = nights.map((n) => ({
    ...featureSlideOf(n),
    photo: n.approvedPhotoUrl ?? null,
    credit: null,
    chip: n.free ? 'FREE' : n.categoryName ? n.categoryName.toUpperCase() : null,
  }))
  const ask: Slide = { t: 'ask', composition: 'close', count: nights.length, three: nights.slice(0, 3).map((n) => dayRowOf(n)) }
  const caption = (platform: 'instagram' | 'facebook') =>
    carouselCaption({ city: input.city.name, postAt: input.postAt, nights, platform, hop: goHop(input.origin, 'facebook'), tags: input.tags })
  const why = (n: CarouselNight) =>
    [`on ${captionDay(n)}`, n.categoryName ?? null, n.free ? 'free' : null, n.relationship ? `its organiser ${n.relationship === 'permission' ? 'gave photo permission' : n.relationship === 'ticketing' ? 'sells on EventLinqs' : 'is one we write to'}` : null]
      .filter((x): x is string => Boolean(x))
      .join(', ')
  return {
    nights,
    slides: [cover, ...features, ask],
    captions: { instagram: caption('instagram'), facebook: caption('facebook') },
    link: `${input.origin.replace(/\/+$/, '')}/city/${input.city.slug}`,
    picks: nights.map((n) => ({ eventId: n.eventId, reason: `Picked: ${why(n)}.` })),
    short: choice.short,
  }
}

/**
 * The carousel's timeline as the timing engine holds a piece of nights still ahead (timing.ts timingOf, and the intake's
 * timing gate): preferred at the post's own time; useful until two hours before its first night's doors and never past the
 * end of the post's day; expired when its first night starts, or at the end of the post's day. A missed Monday is never
 * posted later (law 42). Pure.
 */
export function carouselTimeline(postAt: Date, nights: readonly Pick<CampaignNight, 'startDate'>[]): { readonly preferredAt: string; readonly latestAt: string; readonly expiresAt: string } {
  const first = Math.min(...nights.map((n) => Date.parse(n.startDate)))
  const dayEnd = midnightIn(new Date(midnightIn(postAt, ZONE).getTime() + 36 * 3_600_000), ZONE).getTime()
  const latest = Math.min(dayEnd, first - 2 * 3_600_000)
  const expires = Math.max(latest, Math.min(dayEnd, first))
  return { preferredAt: postAt.toISOString(), latestAt: new Date(latest).toISOString(), expiresAt: new Date(expires).toISOString() }
}

/** When the week's carousel goes out: the window's opening, 06:00 on the week's Monday in Melbourne (law 44). */
export function carouselPostAt(weekStart: string): Date {
  return new Date(midnightIn(new Date(`${weekStart}T12:00:00Z`), ZONE).getTime() + 6 * 3_600_000)
}

/**
 * Each city's own licensed photograph for its cover (the playbook's section 5: "a real, professional photograph of the
 * city itself ... licensed stock with its licence recorded"): the city guide's banner where one is ruled (Geelong,
 * Ballarat, Bendigo: Wikimedia Commons, author and licence on record, credited where its licence asks). Never the site's
 * photo-day spine: the media register refuses any photograph from the stock library for a post
 * (social_assets_never_the_library, read on production 25 November 2026), so Melbourne, whose guide shows the spine's
 * skyline, takes its own (CITY_COVERS) first. A city with neither has its cover drawn in type. The cover draws one only
 * when the media register holds it as EventLinqs' own photograph (store.ts slideImagesNow, social_brand_images).
 */
export function cityCoverPhotos(cities: readonly { readonly slug: string }[], origin: string): Map<string, CityPhoto> {
  const out = new Map<string, CityPhoto>()
  for (const c of cities) {
    const own = CITY_COVERS[c.slug]
    if (own) {
      out.set(c.slug, { url: `${origin.replace(/\/+$/, '')}${own.src}`, credit: `Photo: ${own.author}, ${own.licence}` })
      continue
    }
    const banner = getCityBanner(c.slug)
    if (banner) out.set(c.slug, { url: `${origin.replace(/\/+$/, '')}${banner.src}`, credit: banner.credit ? `Photo: ${banner.credit.author}, ${banner.licence}` : null })
  }
  return out
}
