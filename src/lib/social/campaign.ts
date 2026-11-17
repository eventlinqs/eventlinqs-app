import type { Cta } from '@/lib/events/cta'
import { tierOf } from '@/lib/events/relevance'
import { isEventLinqsListing, isListingsOrganisation } from '@/lib/listings/shown-organiser'
import type { PosterNight } from '@/lib/broadcast/daily-poster'
import { carriesBannedWord, quotableSummary } from './words'
import { getCategoryDisplayName } from '@/lib/hero-categories'
import { campaignStageOf } from './stages'
import { creditLine } from '@/lib/media/photo-credits'
import { STAND_INS, standInChooser, standInCredit, standInOf, standInUrl, type Sport, type StandIn } from './stand-ins'

/**
 * THE WEEKLY CAMPAIGN, PLANNED (the release checklist of 28 October 2026, sections B, C and J; Lawal's 13:53: strategy
 * approved, the 13:27 sample looks not; the project manager's 14:08: the planner's composition SLOTS follow the revised
 * samples in C:\dev\EVIDENCE\SOCIAL-V2-28OCT, chosen by category, and are not production looks until Lawal approves).
 *
 * From the week's real public nights, one campaign: per city, Monday's week ahead (to /city/<city>) and Thursday's
 * weekend guide (to /free/<city>/this-week); for the week, Wednesday's Discovery Reel (9:16 frames, three to five
 * nights), Friday's venue spotlight for attendees and, as a separate asset, the organiser campaign for organisers
 * (J11, to /organisers); a partner kit for every organiser or venue featured; and an image request to every
 * organiser whose night goes out with no approved photograph (J5).
 *
 * Every piece carries one audience, one of the two growth objectives, one purpose, one call to action and one
 * measurable outcome (C1, C2, J10), and its Instagram and Facebook versions (J13). A photograph appears in a slot only
 * where the store found an approved rights row for that night (J1 to J4); library and category photographs are never
 * offered to social, so with none the slide is typographic.
 *
 * Pure: the reads and writes are src/lib/social/store.ts's, so every rule here is driven by its own test.
 */

export type Audience = 'attendees' | 'organisers' | 'venues' | 'partners'
export type Objective = 'audience_growth' | 'organiser_growth'
export type PieceKind =
  | 'week_ahead'
  | 'discovery_reel'
  | 'weekend_carousel'
  | 'venue_spotlight'
  | 'organiser_campaign'
  | 'partner_kit'
  | 'brand_campaign'
  | 'daily_poster'
  | 'tonight_tomorrow'
  | 'category_spotlight'
  | 'coming_up'

/**
 * THE EDITION CITIES, in order (D5 of Lawal's final directive, 30 October 2026: 'Initially support Geelong and
 * Melbourne, with architecture for Ballarat, Bendigo and future cities'). Friday's Tonight and Tomorrow and the Category
 * Spotlight plan only for these; a city joins by one line here, on the project manager's word. The week ahead and the
 * weekend guide still plan for every guide city, as before.
 */
// Melbourne first (Lawal, 12 November 2026, 09:16 to 09:19; growth plan version 6): the weekly edition starts with it.
export const EDITION_CITIES: readonly string[] = ['melbourne', 'geelong']

/** A Category Spotlight needs this many of one category's nights in a city's week. */
export const SPOTLIGHT_MIN_NIGHTS = 3

/** The revised samples' compositions (14:08), as slots; the looks wait for Lawal's approval. */
export type Composition =
  | 'concert'
  | 'festival'
  | 'family'
  | 'free'
  | 'general'
  | 'venue_spotlight'
  | 'organiser_campaign'
  | 'contents_cover'
  | 'close'

export type CampaignCity = { slug: string; name: string }

/**
 * A night's venue as a slide may name it and a partner kit may be addressed to it, or null. Some imported listings
 * carry a research note where the venue belongs ("Organiser not named on listing", found on TEST by demonstration D,
 * 28 October 2026); a note is never drawn on a slide as a place, nor sent a partner kit.
 */
export function venueOf(name: string | null | undefined): string | null {
  const v = name?.trim() || null
  return v && /\bnot named\b|\bto be confirmed\b|\btbc\b/i.test(v) ? null : v
}

/**
 * The host a night is shown under and its partner kit is for (ruling A of 23 October 2026, src/lib/listings/shown-
 * organiser.ts): an EventLinqs listing, or any night the listings organisation holds, is its VENUE's, and that
 * organisation is named nowhere; an organiser's own night is its organisation's.
 */
export function hostOf(e: { listingSource: string | null; organisationName: string | null; organisationSlug: string | null; venueName: string | null }): string | null {
  const venue = venueOf(e.venueName)
  if (isEventLinqsListing({ listing_source: e.listingSource }) || isListingsOrganisation(e.organisationSlug)) return venue
  return e.organisationName?.trim() || venue
}

export type CampaignNight = {
  eventId: string
  slug: string
  title: string
  startDate: string
  /** When it ends; a night that runs over several days says so (AMCF's three). */
  endDate?: string | null
  timezone: string | null
  citySlug: string
  cityName: string
  venueName: string | null
  /** The venue row's own name, one spelling per place (the PM's 16:40, fix 4); null when only an operator is known. Absent: venueName. */
  placeName?: string | null
  /** The title as the source gave it, before postTitle cleaned it: its words still say what kind of night it is. */
  sourceTitle?: string
  /** The host the night is shown under: its organiser, or for a listing its venue. */
  host: string | null
  categorySlug: string | null
  summary: string | null
  /** A photograph with an APPROVED rights row for this night (J1 to J4), else null and the slide is typographic. */
  approvedPhotoUrl: string | null
  /** The credit that row requires, shown with the photograph. */
  photoCredit: string | null
  cta: Cta
  /** The one price line (ctaPriceLine), or null where none may be said. */
  priceLine: string | null
  /** events.venue_address, events.is_age_restricted and age_restriction_min: the daily poster prints the street and an 18+ only from these. */
  venueAddress?: string | null
  isAgeRestricted?: boolean
  ageMin?: number | null
  /** events.venue_id: a venue that said no to our posts has its nights left out (D3 (6)). */
  venueId?: string | null
}

/**
 * What a night's slide says in the approved treatments (Lawal, 28 October 19:52): the eyebrow, the date and time, the
 * entry line section E allows, its call to action, and the city. Absent on revisions planned before the treatments,
 * which the renderer reads from their older slots.
 */
export type NightSlideWords = { eyebrow: string; date: string; time: string; entry: string | null; action: string; city: string }

/** A slide as data: its composition and the words in each slot; /admin/social/piece/<id>/<n> draws it. */
export type Slide =
  | { t: 'cover'; composition: 'contents_cover'; chip: string; headline: string; line: string; contents: string[] }
  | { t: 'night'; composition: Composition; eventId: string; chip: string | null; when: string; day: string; title: string; meta: string; why: string | null; photo: string | null; credit: string | null; words?: NightSlideWords }
  | { t: 'programme'; composition: 'venue_spotlight'; heading: string; address: string; rows: { day: string; title: string; meta: string }[] }
  | { t: 'offer'; composition: 'organiser_campaign'; eyebrow: string; headline: string; points: string[]; url: string }
  | { t: 'end'; composition: 'close'; headline: string; line: string; url: string; foot: string | null }
  | { t: 'story'; composition: Composition; eventId: string; chip: string; when: string; title: string; meta: string; photo: string | null; credit: string | null; sticker: string; words?: NightSlideWords; line?: string | null }
  /** A brand piece naming no night: a photograph licensed for EventLinqs' own promotion (treatment A) or its own art (C). */
  | { t: 'brand'; composition: 'close'; headline: string; line: string; action: string; photo: string | null; credit: string | null }
  /** Family F, the daily poster: one night's verified facts, its photograph only from an approved row, and why (daily-posters.ts). */
  | { t: 'poster'; composition: 'daily_poster'; eventId: string; photo: string | null; credit: string | null; rights: string; night: PosterFacts }
  /*
   * THE 9.5 LOCKED LOOK (the PM's 17:10 of 15 November 2026, on WINDOW 6's locked-look-4.ts, scored 9.5 to 9.6 at 09:50):
   * a list post is its week's cover (the count, the biggest draws, a night's own photograph whole, or a photograph of the
   * lead night's kind across its top), a slide per day or pair of days holding the nights as gold timed cards, a slide
   * for each night with its own permitted photograph shown whole, and the ask on gold.
   */
  /** The cover: `photoEventId` is the night whose own photograph it shows whole; with none, `photo` is a stand-in band or null. */
  | { t: 'week_cover'; composition: 'contents_cover'; range: string; lines: [string, string, string]; draws: string | null; line: string; photoEventId: string | null; photo: string | null; credit: string | null; lead?: DayRow[] }
  /** A day or two days of the piece's nights, under a photograph of the lead night's kind (a stand-in) or none. */
  | { t: 'days'; composition: 'contents_cover'; day: string; date: string; rows: DayRow[]; photo: string | null; credit: string | null }
  /** A night with its own permitted photograph, shown whole: "an organiser's own permitted photograph always leads its night". */
  | { t: 'feature'; composition: Composition; eventId: string; startDate: string; eyebrow: string; title: string; accent: string | null; chip: string | null; photo: string | null; credit: string | null }
  /** Lawal's ask on gold, with the three to start with. */
  | { t: 'ask'; composition: 'close'; count: number; three: DayRow[] }
  /** Family E, a venue's week: its name, its nights as gold timed cards (each with its entry line), a photograph of their kind or none, the ask. */
  | { t: 'venue'; composition: 'venue_spotlight'; venue: string; eyebrow: string; accent: string; rows: DayRow[]; photo: string | null; credit: string | null }

/*
 * THE SOCIAL LOCK (Lawal, 15 November 2026, 20:52, item 1, relayed by the PM: "These are the photos you're keeping. This
 * is the concept ... This is the minimum we will ever publish"): the 22 posts of C:/dev/START-16OCT/SOCIAL-READY-15NOV are
 * the locked benchmark, and the product publishes only in that look. These are its slides; a piece holding any other
 * slide (the older planner look: the offer card, the brand card, the partner story, the daily poster) is kept out of the
 * week's plan and refused before approval and before publishing. The older look is kept behind OLDER_LOOK_IN_PLAN, never
 * deleted (law 13); it goes back on only when Lawal says so.
 */
export const LOCKED_SLIDES = ['week_cover', 'days', 'feature', 'ask', 'venue'] as const
export const OLDER_LOOK_IN_PLAN = false

/** True when every slide of a piece is drawn in the locked look. */
export function inLockedLook(slides: readonly Pick<Slide, 't'>[]): boolean {
  return slides.length > 0 && slides.every((s) => (LOCKED_SLIDES as readonly string[]).includes(s.t))
}

/** The older planner look's list slides: a list post drawn with them is drawn again in the locked look. */
const OLDER_LIST_SLIDES: readonly Slide['t'][] = ['cover', 'night', 'end']

/**
 * Why the lock keeps a piece from the plan and from publishing, or null when it may go. LAWAL'S A AND A (18 November 2026,
 * 00:12, OPS-DIRECTIVE-LOCKED-18NOV.md): "Allow professionally designed EventLinqs posters and stories without
 * photographs" and "Allow clean, branded EventLinqs designs for mixed-event slides"; "Remove all rules that incorrectly
 * classify photo-free designs as invalid". So a poster, a story, the brand and organiser pieces, a post that leads in type
 * and a day slide in the branded design are all admitted (the 15 November rules 'never a text-only post' and 'every day
 * slide carries a photograph' are withdrawn). Only a list post in the older look is kept back, and the hourly run draws it
 * again in the locked look. A photograph over a night it does not show is the publish gate's (piece-quality.ts), and the
 * wordmark sits off every photograph by the renderer's own design (day-cards.ts).
 */
export function lockRefusal(slides: readonly Slide[]): string | null {
  if (slides.some((s) => OLDER_LIST_SLIDES.includes(s.t))) return 'It is drawn in the older planner look (cover, night and end slides), so the hourly run draws it again in the locked look.'
  return null
}

/** One night on a day slide, as Lawal's gold timed card draws it; its start kept so a check before publishing reads drift. */
export type DayRow = { eventId: string; startDate: string; when: string; sub: string | null; title: string; place: string; free: boolean }

/** The facts a daily poster prints, kept on its slide; the store sets shortLink to the piece's own /e/ link. */
export type PosterFacts = Omit<PosterNight, 'photo'>

export type PlatformVersion = {
  /** The first line a person sees in the feed. */
  hook: string
  caption: string
  /** Instagram: feed 4:5 or 9:16; Facebook: 4:5 feed or 9:16 story. */
  crop: '4:5' | '9:16'
  /** The call to action as this platform lets a person act: Instagram has no link in a caption, Facebook does. */
  cta: string
}

export type PiecePlan = {
  kind: PieceKind
  city: string
  audience: Audience
  objective: Objective
  purpose: string
  nextStep: string
  /** The one number that says whether it worked, counted by EventLinqs or entered from the platform (J10, J16). */
  outcome: string
  link: string
  format: 'feed' | 'story'
  eventIds: string[]
  /** K6: each night picked, and the reason it was picked, said plainly. */
  picks: NightPick[]
  /** K5: photo led where an approved image exists, else type led (path B needs no image licence, K1). */
  mode: 'photo_led' | 'graphic_led' | 'type_led'
  slides: Slide[]
  caption: string
  versions: { instagram: PlatformVersion; facebook: PlatformVersion }
  partnerName: string | null
  /** The partner's night, whose own tracked link the kit carries (minted by the store). */
  partnerEventId: string | null
  message: string | null
  /** A daily poster's day (YYYY-MM-DD); no other kind has one. */
  posterDay?: string | null
  /** The organisers' own names it quotes exactly (its nights' titles and hosts, its partner), set by planCampaign. */
  names?: string[]
}

/** A night to ask its organiser an image for (J5); the words wait for the project manager's text (Lawal, 14:59). */
export type ImageRequest = { eventId: string; hostName: string }

export type NightPick = { eventId: string; reason: string }

/** At most two nights of one venue and three of one category in a set of five (K6: no venue or category overload). */
const MAX_PER_VENUE = 2

/** Law 18 in the picks: the guide's own tier; tier 1 leads, tier 4 never goes in a post (Lawal's 14:07 of 15 November 2026). */
// Law 18 (c), tier then date: a tier is worth more than any place in the date order (readCampaignNights reads at most
// 400 nights, 2 points a place, so 1000 a tier always leads), so a Friday arena show is never pushed out of the week by
// Monday's bar shows (15 November 2026, the first week's drawings).
const TIER_SCORE: Readonly<Record<1 | 2 | 3, number>> = { 1: 2000, 2: 1000, 3: 0 }
const TIER_WORDS: Readonly<Record<1 | 2 | 3, string>> = { 1: 'a headline night', 2: 'a ticketed night', 3: 'a free or community night' }
// A session for children, toddlers or families named in the listing's own summary is tier 4 (law 18 (b): story time,
// toddler and baby sessions, classes), though its title names none: out-12's Ballarat asked for 'Show-and-Tell with
// Carly', "A show-and-tell session for children", read as tier 3 by its title alone (the PM's 02:25 fix 4).
const SESSION_SUMMARY = /\b(session|class|workshop|story ?time|playgroup)s?\b[^.]{0,30}\b(children|kids|toddlers?|babies|families|parents)\b/i
export function socialTierOf(n: Pick<CampaignNight, 'title' | 'venueName' | 'categorySlug' | 'cta'> & Partial<Pick<CampaignNight, 'summary'>>) {
  const t = tierOf({ title: n.title, venue: n.venueName, categorySlug: n.categorySlug, ticketed: n.cta.state === 'paid_native' || n.cta.state === 'paid_external' })
  return t < 4 && SESSION_SUMMARY.test(n.summary ?? '') ? 4 : t
}
const MAX_PER_CATEGORY = 3

/**
 * THE EDITORIAL SELECTION (K6): from the candidates, the nights a set carries and why each was picked. Scored on timing
 * (sooner first, a weekend night for a weekend guide), complete details (a venue, a line about it, a price or free
 * stated), media available (an approved image) and partner potential (a host with more than one night); free is
 * never scored down, and nothing is ever bought into a pick. No more than two of one venue or three of one category, so a set
 * is varied. The founder's leave-outs never come back.
 */
/**
 * THE BEST NIGHTS ACROSS NAMED DAYS (the PM's 15:45 of 15 November 2026, fix 3): the best of each day first, where the
 * day has one, then the best of the rest, so a weekend post holds Friday, Saturday and Sunday and never five Fridays.
 */
export function selectAcrossDays(
  candidates: readonly { n: CampaignNight; day: number }[],
  days: readonly number[],
  max: number,
): { nights: CampaignNight[]; picks: NightPick[] } {
  // One show, one line (the PM's 16:40, fix 2): a title already taken from an earlier day is never a later day's first.
  const firsts: string[] = []
  const titles = new Set<string>()
  for (const d of days) {
    const [best] = selectNights(candidates.filter((x) => x.day === d && !titles.has(titleKey(x.n))).map((x) => x.n), 1).nights
    if (best) {
      firsts.push(best.eventId)
      titles.add(titleKey(best))
    }
  }
  const all = selectNights(candidates.map((x) => x.n), candidates.length)
  const order = [...firsts, ...all.nights.filter((n) => !titles.has(titleKey(n))).map((n) => n.eventId)]
  const chosen = new Set(order.slice(0, max))
  const nights = all.nights.filter((n) => chosen.has(n.eventId))
  for (const id of chosen) {
    const c = nights.some((n) => n.eventId === id) ? null : candidates.find((x) => x.n.eventId === id)
    if (c) nights.push(c.n)
  }
  nights.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const reasons = new Map(all.picks.map((p) => [p.eventId, p.reason]))
  return { nights, picks: nights.map((n) => ({ eventId: n.eventId, reason: reasons.get(n.eventId) ?? `Picked: on ${whenOf(n)}; the best of its day.` })) }
}

/**
 * A LATER LIST POST'S NIGHTS (the PM's 16:40 of 15 November 2026, fix 3): chosen across its days from the nights no
 * earlier list post in the city carried; only when those leave room does it take one earlier night, its best, so two
 * list posts share at most one night. With too few, the caller drops the post.
 */
export function selectFresh(
  candidates: readonly { n: CampaignNight; day: number }[],
  days: readonly number[],
  max: number,
  listed: ReadonlySet<string>,
): { nights: CampaignNight[]; picks: NightPick[] } {
  const fresh = selectAcrossDays(candidates.filter((x) => !listed.has(x.n.eventId)), days, max)
  if (fresh.nights.length >= max) return fresh
  const taken = new Set(fresh.nights.map(titleKey))
  const shared = selectNights(candidates.filter((x) => listed.has(x.n.eventId) && !taken.has(titleKey(x.n))).map((x) => x.n), 1)
  if (shared.nights.length === 0) return fresh
  const nights = [...fresh.nights, ...shared.nights].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  return { nights, picks: [...fresh.picks, ...shared.picks] }
}

/** One night per title in a set: the key two nights share when they are the same night on two dates. */
const titleKey = (n: CampaignNight): string => n.title.trim().toLowerCase()

/** A night list with each title once, at its sooner date (the list is in date order). */
function oncePerTitle(nights: readonly CampaignNight[]): CampaignNight[] {
  const seen = new Set<string>()
  return nights.filter((n) => !seen.has(titleKey(n)) && Boolean(seen.add(titleKey(n))))
}

export function selectNights(
  candidates: readonly CampaignNight[],
  max: number,
  /** A Category Spotlight is one category by design, so it lifts that cap alone; the venue cap still holds. */
  opts: { readonly perCategory?: number; readonly perVenue?: number } = {},
): { nights: CampaignNight[]; picks: NightPick[] } {
  const perCategory = opts.perCategory ?? MAX_PER_CATEGORY
  const perVenue = opts.perVenue ?? MAX_PER_VENUE
  const hostCount = new Map<string, number>()
  for (const n of candidates) if (n.host) hostCount.set(n.host, (hostCount.get(n.host) ?? 0) + 1)
  const scored = candidates.flatMap((n, order) => {
    const tier = socialTierOf(n)
    if (tier === 4) return []
    const reasons: string[] = []
    let score = 100 - order * 2 + TIER_SCORE[tier]
    // The day leads the reason, as the founder's selection list has always read it ("Picked: on ..."); the tier follows.
    reasons.push(`on ${whenOf(n)}`)
    reasons.push(TIER_WORDS[tier])
    if (n.venueName && n.summary) {
      score += 10
      reasons.push('its details are complete')
    }
    if (n.priceLine) {
      score += 5
      reasons.push(n.cta.state === 'free_open' || n.cta.state === 'free_registration' ? 'it is free' : 'its price is known')
    }
    if (n.approvedPhotoUrl) {
      score += 8
      reasons.push('it has an image its owner approved')
    }
    if (n.host && (hostCount.get(n.host) ?? 0) > 1) {
      score += 4
      reasons.push(`${n.host} has more nights this week, a partner worth asking`)
    }
    return [{ n, score, reasons }]
  })
  scored.sort((a, b) => b.score - a.score)
  const venues = new Map<string, number>()
  const categories = new Map<string, number>()
  const kept: { n: CampaignNight; reasons: string[] }[] = []
  // One night per title in a set: a market on Saturday and Sunday is one pick, its sooner date (the directive's
  // section 5: no repetitive layouts).
  const titles = new Set<string>()
  for (const s of scored) {
    if (kept.length >= max) break
    const title = titleKey(s.n)
    if (titles.has(title)) continue
    const venue = (s.n.venueName ?? '').toLowerCase()
    const category = (s.n.categorySlug ?? '').toLowerCase()
    if (venue && (venues.get(venue) ?? 0) >= perVenue) continue
    if (category && (categories.get(category) ?? 0) >= perCategory) continue
    if (venue) venues.set(venue, (venues.get(venue) ?? 0) + 1)
    if (category) categories.set(category, (categories.get(category) ?? 0) + 1)
    titles.add(title)
    kept.push(s)
  }
  kept.sort((a, b) => Date.parse(a.n.startDate) - Date.parse(b.n.startDate))
  return { nights: kept.map((k) => k.n), picks: kept.map((k) => ({ eventId: k.n.eventId, reason: `Picked: ${k.reasons.join('; ')}.` })) }
}

function modeOf(nights: readonly CampaignNight[]): PiecePlan['mode'] {
  return nights.some((n) => n.approvedPhotoUrl) ? 'photo_led' : 'type_led'
}

export type CampaignPlan = { pieces: PiecePlan[]; imageRequests: ImageRequest[] }

const AUDIENCES: readonly Audience[] = ['attendees', 'organisers', 'venues', 'partners']
const OBJECTIVES: readonly Objective[] = ['audience_growth', 'organiser_growth']
const DAY_MS = 24 * 60 * 60 * 1000
const ZONE = 'Australia/Melbourne'
/** The most nights a curated piece carries (the Discovery Reel's frames are these, its cover and its close). */
export const MAX_NIGHTS = 5
const MAX_PARTNERS = 12

/** The Monday a week starts, in Melbourne, as YYYY-MM-DD. */
export function weekStartOf(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday)
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  return new Date(today - dow * DAY_MS).toISOString().slice(0, 10)
}

function local(iso: string, tz: string | null, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? ZONE, ...opts }).format(new Date(iso))
}

/** "Sat 31 Oct · 7.30pm" */
export function whenOf(n: CampaignNight): string {
  const date = local(n.startDate, n.timezone, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '')
  const time = local(n.startDate, n.timezone, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(':', '.').replace(/\s/g, '').toLowerCase()
  return `${date} · ${time}`
}

/**
 * A cover's line for a night (the PM's 15:45 of 15 November 2026, fix 1): its day and title, then on a line of its own
 * its venue and time, as a weekly list names the place, so with no photograph the list itself is the picture.
 */
export function coverLine(day: string, n: CampaignNight, sessions: readonly CampaignNight[] = []): string {
  const timeOf = (x: CampaignNight) => whenOf(x).split(' \u00b7 ')[1] ?? ''
  /* One show, one line (the PM's 16:40, fix 2): a show on several days carries them all, 'Fri 7pm, Sun 1.30pm'. */
  const all = sessions.length > 1 ? [...sessions].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate)) : []
  const when = all.length > 1 ? all.map((x) => `${local(x.startDate, x.timezone, { weekday: 'short' })} ${timeOf(x)}`).join(', ') : timeOf(n)
  const sub = [placeOf(n), when].filter((x): x is string => Boolean(x && x.trim())).join(' \u00b7 ')
  return sub ? `${day} ${n.title}\n${sub}` : `${day} ${n.title}`
}

/** "SAT" */
export function dayOf(n: CampaignNight): string {
  return local(n.startDate, n.timezone, { weekday: 'short' }).toUpperCase()
}

/**
 * THE SPOTLIGHTS DRAWN FROM TOMORROW (the PM's 09:35 of 16 November 2026): the category and venue spotlights take no
 * night on or before the day they are drawn, since the week's plan places the week ahead and the soonest nights first
 * (planMoments, earliest deadline first) and a piece is held whole once any of its nights has ended. Out-14's two
 * Melbourne spotlights each carried a Monday 7:30 pm night, drawn on that Monday, and could not have gone whole. Drawn
 * before the week begins, the whole week (0).
 */
export function spotlightsFromDay(now: Date, weekStart: string): number {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const today = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / DAY_MS)
  return Math.max(0, today + 1)
}

/** The Melbourne day index of a night within the week starting weekStart: 0 Monday to 6 Sunday, or -1 outside it. */
export function dayInWeek(n: CampaignNight, weekStart: string): number {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(n.startDate))
  const diff = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / DAY_MS)
  return diff >= 0 && diff <= 6 ? diff : -1
}

/**
 * WHAT KIND OF NIGHT IT IS, FROM ITS OWN WORDS (the PM's 16:40 of 15 November 2026, fix 1): a stand-in photograph and
 * "Live at" follow the night itself, never its category alone. A talk, an "Evening with", a stories evening or a
 * reading is a talk; a recital, a quartet or an orchestra is classical; jazz is named; a gig is certain only from a
 * band, a DJ, a tour or live music in its title or summary. Null when its words do not say.
 * Out-12's first draw (15 November 2026, ended 23:30): a whole day of dance shows, theatre, matches, Christmas nights or a food market had
 * no kind, so its slide had no photograph; each is now read from its own words (a match from its title's 'v'), and a
 * music night at a concert hall or an estate is a concert, as one at an arena already was.
 */
export type NightKind = 'talk' | 'classical' | 'jazz' | 'comedy' | 'festival' | 'gig' | 'dance' | 'theatre' | 'christmas' | 'market' | 'sport' | 'family'
const TALK_WORDS = /\b(an evening with|in conversation|conversation with|talks?|lecture|author|q\s?&\s?a|keynote|panel|stories|storytelling|spoken word|poetry|reading|historian|memoir)\b/i
const CLASSICAL_WORDS = /\b(recital|quartet|orchestra|symphon(y|ic)|chamber|sonatas?|concerto|choir|choral|opera|soprano|mezzo|baritone|tenor|philharmonic|art song|lieder|cantata|baroque|piano)\b/i
// A tour is a gig only as a named tour ('Australian Made Tour 2026', 'World Tour'), never a studio, guided or walking tour
// (the PM's 22:41 fix 3: 'MESS Studio Tours', a daytime studio tour, stood under a concert crowd).
const GIG_WORDS = /\b(bands?|djs?|live music|gigs?|album launch|ep launch|headline show|singer-songwriters?|rappers?|musicians)\b|\b(world|national|australian|farewell|reunion|anniversary|headline|album|arena|stadium|made)\s+tour\b|\btour\s+20\d\d\b|\bon tour\b/i
const DANCE_WORDS = /\b(ballet|ballerinas?|dancers|dance (academy|school|studio|company|movement|show|showcase|performance|concert|recital|eisteddfod|troupe))\b|\bdance\b[^.]{0,30}\b(show|showcase|performance|recital)\b/i
const THEATRE_WORDS = /\b(drama|dramatic|players|pantomime|panto|stage play|the musical|a musical|courtroom|shakespeare|playwright|theatre company)\b/i
const CHRISTMAS_WORDS = /\b(christmas|xmas|carols?|santa)\b/i
const MARKET_WORDS = /\b(produce|food|farmers'?|growers'?)\b[^.]{0,40}\bmarkets?\b|\bmarkets?\b[^.]{0,40}\b(produce|food|farmers|growers)\b/i
// A match names its two sides ('Australia v England Mens T20I', 'Melbourne United vs New Zealand Breakers'); a run club
// or a class in the sports category is no match, so a crowd in the stands never stands over it.
const MATCH_WORDS = /\s(v|vs\.?)\s|\b(t20i?|odi|test match|grand final|semi final|derby)\b/i
// The PM's 02:25 fix 3: a daytime family or children's show is a family show, never a gig (out-12 put a pyrotechnic rock
// crowd over 'Pevan & Sarah in Concert 2026', a 10:30 am children's concert). No stand-in is licensed for it, so a slide
// it leads takes the next night's kind.
const FAMILY_WORDS = /\b(family|families|kids|children|children's|childrens|toddlers?|preschool|little ones)\b/i
const FAMILY_CATEGORIES = ['family', 'kids', 'children']
/** The night's local start hour, 0 to 23. */
function localHour(n: Pick<CampaignNight, 'startDate' | 'timezone'>): number {
  return Number(new Intl.DateTimeFormat('en-AU', { timeZone: n.timezone ?? ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date(n.startDate)))
}
// The PM's 02:25 fix 2: sport carries its sport, read from the match's own words (its title names its sides).
const NBL_TEAMS = /\b(melbourne united|south east melbourne phoenix|sydney kings|perth wildcats|brisbane bullets|cairns taipans|adelaide 36ers|illawarra hawks|tasmania jackjumpers|new zealand breakers)\b/i
const A_LEAGUE_TEAMS = /\b(melbourne victory|melbourne city|western united|sydney fc|western sydney wanderers|adelaide united|brisbane roar|central coast mariners|newcastle jets|perth glory|wellington phoenix|macarthur fc|auckland fc)\b/i
/** A match's own sport, or null where its words name none (then only a stadium crowd with no sport named stands over it). */
export function sportOf(n: Pick<CampaignNight, 'title' | 'summary' | 'sourceTitle'>): Sport | null {
  const words = `${n.sourceTitle ?? n.title} ${n.summary ?? ''}`
  if (FIGHT_WORDS.test(words)) return 'combat'
  if (/\b(basketball|nbl|wnbl)\b/i.test(words) || NBL_TEAMS.test(words)) return 'basketball'
  if (/\b(cricket|t20i?|odi|test match|big bash|bbl|wbbl|sheffield shield)\b/i.test(words)) return 'cricket'
  if (/\b(soccer|a-league|matildas|socceroos)\b/i.test(words) || A_LEAGUE_TEAMS.test(words)) return 'football'
  if (/\b(afl|aflw)\b/i.test(words)) return 'afl'
  if (/\b(rugby|nrl|wallabies|super rugby)\b/i.test(words)) return 'rugby'
  if (/\b(tennis|australian open)\b/i.test(words)) return 'tennis'
  return null
}
/** Seated nights, and the standing crowds that never stand over them where they are as many (the PM's 02:25 fix 1). */
const SEATED_KINDS: readonly NightKind[] = ['talk', 'classical', 'theatre', 'comedy']
const STANDING_KINDS: readonly NightKind[] = ['gig', 'festival', 'sport']
// The PM's 03:45 fixes 1 to 3: a seated night by its kind, its own words (a psychic, 'An evening with') or its room (a
// recital hall, a theatre, a concert hall: the room makes a seated night, never a recital); a standing night is a gig, a
// festival or a match in no such room (an arena, a stadium, an estate, a pub or club stands).
const SEATED_ROOM = /\b(recital|theatre|theater|hall|playhouse|athenaeum|centre|center|auditorium|chapel|church|cathedral|the capital|opera house|story house|play house)\b/i
const STANDING_ROOM = /\b(arena|stadium|bowl|forum|racecourse|showgrounds|park|oval|ground|estate)\b/i
const SEATED_WORDS = /\b(psychic|medium|an evening with|in conversation)\b/i
export function seatedNight(n: Pick<CampaignNight, 'title' | 'summary' | 'venueName' | 'host' | 'categorySlug' | 'sourceTitle'> & Partial<Pick<CampaignNight, 'startDate' | 'timezone'>>): boolean {
  const kind = nightKind(n)
  if (kind && SEATED_KINDS.includes(kind)) return true
  if (SEATED_WORDS.test(n.sourceTitle ?? n.title)) return true
  const room = `${n.venueName ?? ''} ${n.host ?? ''}`
  return SEATED_ROOM.test(room) && !STANDING_ROOM.test(room)
}
export function standingNight(n: Pick<CampaignNight, 'title' | 'summary' | 'venueName' | 'host' | 'categorySlug' | 'sourceTitle'> & Partial<Pick<CampaignNight, 'startDate' | 'timezone'>>): boolean {
  const kind = nightKind(n)
  return Boolean(kind && STANDING_KINDS.includes(kind)) && !seatedNight(n)
}
// A fight is a match by its own words, whatever category its source filed it in (out-12: 'Humanoid Fighting Championship'
// is filed as music on production, and drew a concert stage).
const FIGHT_WORDS = /\b(fighting|fight night|boxing|kickboxing|mma|ufc|wrestling|muay thai)\b/i
/**
 * The listing's words without its room's own name (the PM's 03:45 fix 1, at its cause): Searows' summary reads 'tickets
 * through Melbourne Recital Centre', and 'recital' in the room's name made a pop night classical. The venue's and host's
 * names are taken out whole before any word decides a kind; the room is read only where a rule names it (jazz, a
 * headline venue, a seated room).
 */
function withoutRooms(text: string, n: Pick<CampaignNight, 'venueName' | 'host'>): string {
  let out = text
  for (const room of [n.venueName, n.host]) {
    const r = (room ?? '').trim()
    if (r.length < 4) continue
    const esc = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(?<!\\w)${esc}(?!\\w)`, 'gi'), () => ' ')
  }
  return out
}

export function nightKind(n: Pick<CampaignNight, 'title' | 'summary' | 'venueName' | 'host' | 'categorySlug' | 'sourceTitle'> & Partial<Pick<CampaignNight, 'startDate' | 'timezone'>>): NightKind | null {
  const words = withoutRooms(`${n.sourceTitle ?? n.title} ${n.summary ?? ''}`, n)
  // A daytime show with family words, or listed as a family show, before 3 pm (fix 3).
  if (n.startDate && localHour({ startDate: n.startDate, timezone: n.timezone ?? null }) < 15 && (FAMILY_WORDS.test(words) || FAMILY_CATEGORIES.includes((n.categorySlug ?? '').toLowerCase()))) return 'family'
  // A night whose own title calls it a concert is music before any talk word in its summary (out-12: 'Pevan & Sarah in
  // Concert 2026', whose singalongs "teach reading, maths and feelings", read as a talk).
  if (/\bconcert\b/i.test(n.sourceTitle ?? n.title) && !CLASSICAL_WORDS.test(words) && !DANCE_WORDS.test(words)) return 'gig'
  const isMusic = ['music', 'concert', 'concerts', 'gig', 'gigs'].includes((n.categorySlug ?? '').toLowerCase())
  if (FIGHT_WORDS.test(n.sourceTitle ?? n.title)) return 'sport'
  if (TALK_WORDS.test(words)) return 'talk'
  // A sports night that names its two sides is a match whatever else its words say (a band at half time is no gig).
  if (['sports', 'sport'].includes((n.categorySlug ?? '').toLowerCase()) && MATCH_WORDS.test(n.sourceTitle ?? n.title)) return 'sport'
  if (/\bjazz/i.test(`${words} ${n.venueName ?? ''} ${n.host ?? ''}`)) return 'jazz'
  if (DANCE_WORDS.test(words)) return 'dance'
  if (CHRISTMAS_WORDS.test(words)) return 'christmas'
  if (CLASSICAL_WORDS.test(words)) return 'classical'
  if (n.categorySlug === 'comedy' || /\b(comedy|comedian|stand-?up)\b/i.test(words)) return 'comedy'
  if (n.categorySlug === 'festival' || /\bfestival\b/i.test(words)) return 'festival'
  if (GIG_WORDS.test(words)) return 'gig'
  const music = isMusic
  // A music night at an arena, a stadium, a bowl or the Forum is a concert by its own venue (15 November 2026: LANY and
  // Two Door Cinema Club at John Cain Arena name no band word), so a gig's stand-in shows its kind; so is one at a concert
  // hall, a theatre or an estate (out-12: 'The Kim Wilde: Closer Tour' at Costa Hall, Boyz II Men at Mt Duneed Estate).
  if (music && headlineWeight({ venueName: n.venueName, categorySlug: n.categorySlug }) <= 3) return 'gig'
  if (n.categorySlug === 'theatre' || THEATRE_WORDS.test(words)) return 'theatre'
  if (MARKET_WORDS.test(words)) return 'market'
  return null
}

/** The place a post names (fix 4): the venue row's own name; with no venue row, the listing's venue name. */
export function placeOf(n: Pick<CampaignNight, 'venueName' | 'placeName'>): string | null {
  return n.placeName === undefined ? n.venueName : n.placeName
}

/** The composition a night's slide takes, by its category and admission (the 14:08's list). */
/** The categories that are a performance on a stage, so a slide may say "Live at" the venue. */
const MUSIC_CATEGORIES: readonly string[] = ['music', 'concert', 'concerts', 'gig', 'gigs']

export function compositionFor(n: Pick<CampaignNight, 'categorySlug' | 'cta'>): Composition {
  const c = (n.categorySlug ?? '').toLowerCase()
  if (['music', 'concert', 'concerts', 'gig', 'gigs', 'nightlife', 'comedy', 'theatre', 'performing-arts'].includes(c)) return 'concert'
  if (['festival', 'festivals', 'community', 'celebration', 'arts'].includes(c)) return 'festival'
  if (['family', 'kids', 'children'].includes(c)) return 'family'
  if (n.cta.state === 'free_open' || n.cta.state === 'free_registration') return 'free'
  return 'general'
}

/**
 * Where a night is, as a line names it: the venue and its city, or the venue alone when its own name already holds the
 * city (the PM's 23:45 of 17 November 2026, fix (d): never 'Her Majesty's Theatre Ballarat, Ballarat').
 */
function metaOf(n: CampaignNight): string {
  if (!n.venueName) return n.cityName
  const holdsCity = new RegExp(`\\b${n.cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(n.venueName)
  return holdsCity ? n.venueName : `${n.venueName}, ${n.cityName}`
}

/**
 * A line the headline hunt composes for a night (src/lib/listings/headline-hunt.ts huntSummary): true, and right on a
 * guide row, but it says nothing a post's own date, venue and seller do not already say. Held to huntSummary's output
 * by tests/unit/social/post-words.test.ts.
 */
export const HUNT_SUMMARY_LINE = /^[A-Z][^.]*? on a (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening)(, free entry|, tickets through [^.]+)?\.$/

function whyOf(n: CampaignNight): string | null {
  const s = (quotableSummary(n.summary, [n.title, n.host]) ?? '').replace(/\s+/g, ' ').trim()
  /* The PM's 15:45 of 15 November 2026, fix 4: the headline hunt's composed line ('An event on a Monday evening,
     tickets through ...') repeats what the slide already shows; with no summary of its own a night shows none. */
  if (!s || HUNT_SUMMARY_LINE.test(s)) return null
  const first = s.match(/^.*?[.?](\s|$)/)?.[0]?.trim() ?? s
  return first.length <= 140 ? first : `${first.slice(0, 137).replace(/\s+\S*$/, '')}.`
}

/** "Fri 20 to Sun 22 Nov" for a night over several days, else "Sat 31 Oct". */
export function dateOf(n: CampaignNight): string {
  const day = (iso: string) => local(iso, n.timezone, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '')
  const start = day(n.startDate)
  if (!n.endDate) return start
  const sameDay = local(n.startDate, n.timezone, { year: 'numeric', month: 'numeric', day: 'numeric' }) === local(n.endDate, n.timezone, { year: 'numeric', month: 'numeric', day: 'numeric' })
  if (sameDay || Date.parse(n.endDate) - Date.parse(n.startDate) < 20 * 60 * 60 * 1000) return start
  const [sw, sd, sm] = start.split(' ')
  const [ew, ed, em] = day(n.endDate).split(' ')
  return sm === em ? `${sw} ${sd} to ${ew} ${ed} ${em}` : `${sw} ${sd} ${sm} to ${ew} ${ed} ${em}`
}

/**
 * The treatments' words for a night, every one from its stored facts: the entry line only where section E lets it be
 * said (a stated price, or free that is verified free), and the action as the five states word it.
 */
export function nightWords(n: CampaignNight): NightSlideWords {
  const time = whenOf(n).split(' · ')[1] ?? ''
  const span = dateOf(n).includes(' to ')
  /* "Live at" is a performance's word; a trivia or club night (nightlife) shares the concert look but is only "At". */
  // "Live at" only on a music night (the PM's 16:40, fix 1): never on a talk, a comedy night or a stories evening.
  const kind = nightKind(n)
  const music = MUSIC_CATEGORIES.includes((n.categorySlug ?? '').toLowerCase())
  const live = kind === 'gig' || kind === 'jazz' || kind === 'classical' || (kind === null && music) ? 'Live at' : 'At'
  const place = placeOf(n) ?? n.venueName
  const entry =
    n.priceLine && /\$\s?\d/.test(n.priceLine)
      ? n.priceLine
      : n.cta.state === 'free_open'
        ? 'Free, no ticket needed'
        : n.cta.state === 'free_registration'
          ? 'Free, register first'
          : null
  return {
    eyebrow: place ? `${live} ${place}` : n.cityName,
    date: dateOf(n),
    time: time ? (span ? `From ${time}` : time) : '',
    entry,
    action: postAction(n),
    city: n.cityName,
  }
}

/**
 * ONE CALL ON A POST (the PM's 15:45 of 15 November 2026, fix 5): a post sends people to the night's EventLinqs page,
 * which carries the seller's own link, so the pill names one address, ours, and never a second one beside it. It
 * never says EventLinqs sells a ticket another site sells (E4, E7): the page is where the times and the ticket link are.
 */
export function postAction(n: Pick<CampaignNight, 'cta'>): string {
  if (n.cta.state === 'paid_native') return 'Tickets at eventlinqs.com.au'
  if (n.cta.state === 'paid_external') return 'Times and tickets at eventlinqs.com.au'
  return 'Times and details at eventlinqs.com.au'
}

/**
 * A POST'S TITLE (the PM's 15:45 of 15 November 2026, fix 2): a source's room or venue suffix glued on with a dash
 * comes off (the venue has its own line), and a title in parts joined by spaced dashes keeps its main name: the first
 * part, a colon, the second. Never a spaced dash on a post.
 */
/**
 * ONE TITLE CLEANER FOR EVERY SLIDE AND STORY (the PM's 10:40 of 16 November 2026, item 2: out-15's JazzLab showed
 * '"Songbird: The Eva Cassidy Experience"' in its source's own quotation marks, and a post never shows a title wrapped in
 * quotes). It strips quotes wrapping the whole title, straight or curly, double or single (a pair, with no quote of
 * that family left inside), a stray double quote left at one end with no partner, brackets wrapping the whole title,
 * and stray separators at either end (a dash, colon, semicolon, comma, bar, slash, bullet, asterisk, tilde, underscore).
 * Quotes inside a title stay ('"Songbird" Starring Tarryn Stokes', 'The "Big" Night'), as do an apostrophe and a title's
 * own closing mark (Oklahoma!, What Now?). postTitle and shortTitle call it, so every row, card, ask, cover, story and
 * caption title passes through it. Pure.
 */
const DOUBLE_QUOTES = '"\u201C\u201D\u201E\u00AB\u00BB'
const SINGLE_QUOTES = "'\u2018\u2019"
const STRAY_ENDS = /^[\s\u2013\u2014:;,|\/\\\u2022*~_-]+|[\s\u2013\u2014:;,|\/\\\u2022*~_-]+$/g
export function cleanTitle(title: string): string {
  let t = title.replace(/\s+/g, ' ').trim()
  for (let pass = 0; pass < 6; pass += 1) {
    const before = t
    t = t.replace(STRAY_ENDS, '')
    const first = t.charAt(0)
    const last = t.charAt(t.length - 1)
    const inner = t.slice(1, -1)
    const family = DOUBLE_QUOTES.includes(first) && DOUBLE_QUOTES.includes(last) ? DOUBLE_QUOTES : SINGLE_QUOTES.includes(first) && SINGLE_QUOTES.includes(last) ? SINGLE_QUOTES : null
    if (t.length > 2 && family && ![...inner].some((c) => family === DOUBLE_QUOTES && family.includes(c))) t = inner.trim()
    else if (t.length > 2 && ((first === '(' && last === ')') || (first === '[' && last === ']')) && !/[()[\]]/.test(inner)) t = inner.trim()
    else {
      const doubles = [...t].filter((c) => DOUBLE_QUOTES.includes(c)).length
      if (doubles === 1 && DOUBLE_QUOTES.includes(first)) t = t.slice(1).trim()
      else if (doubles === 1 && DOUBLE_QUOTES.includes(last)) t = t.slice(0, -1).trim()
    }
    if (t === before) break
  }
  return t
}

export function postTitle(title: string, venue: string | null): string {
  let t = cleanTitle(title)
  const suffix = t.match(/^(.*\S)\s*[-\u2013\u2014]\s*([^-\u2013\u2014]{2,40})$/)
  if (suffix) {
    const tail = suffix[2].trim().toLowerCase()
    const v = (venue ?? '').trim().toLowerCase()
    if (/\b(room|stage|bar|lounge|hall|studio|basement|front bar|band room|courtyard)\b/.test(tail) || (v && (tail === v || v.includes(tail)))) t = suffix[1].trim()
  }
  const parts = t.split(/\s+[-\u2013\u2014]\s+/)
  if (parts.length >= 2) t = `${parts[0].trim()}: ${parts[1].trim()}`
  return cleanTitle(t)
}

/**
 * A TITLE SHORTENED BY RULE (the PM's 17:10 of 15 November 2026: "titles shortened by rule from the event's own words,
 * never cut mid word"; out-4 cut "Anne Sofie von Otter & Kristian..." and "Geelong Dance Movement: A Passage..."). A
 * title longer than its room keeps the longest of its own names that fits: the words before one of its own joins (a
 * colon, a bar, a parenthesis, a comma, "with", "featuring", "presents", a plus, or an ampersand between two names of
 * two words or more). Never an ellipsis and never a word cut: a title with no join that fits is kept whole and wraps.
 */
export function shortTitle(title: string, max: number): string {
  const t = cleanTitle(title)
  if (t.length <= max) return t
  const cuts: number[] = []
  for (const re of [/:\s/g, /\s\|\s/g, /\s\(/g, /,\s/g, /\s(?:with|featuring|feat\.|ft\.|presents|starring)\s/gi, /\s\+\s/g]) {
    for (const m of t.matchAll(re)) if (m.index !== undefined) cuts.push(m.index)
  }
  for (const m of t.matchAll(/\s&\s/g)) {
    const i = m.index ?? -1
    if (i > 0 && t.slice(0, i).trim().split(' ').length >= 2 && t.slice(i + 3).trim().split(' ').length >= 2) cuts.push(i)
  }
  const fits = cuts.filter((i) => i >= 4 && i <= max).sort((a, b) => b - a)
  return cleanTitle(fits.length > 0 ? t.slice(0, fits[0]).replace(/[\s,:;|&+(]+$/, '').trim() : t)
}

/**
 * A CARD'S TITLE (the PM's 17:40 fix 4): the performer before a colon wins over a tour name ('Kate Ceberano: Australian Made
 * Tour 2026' reads 'Kate Ceberano'); after 'presents', the show's own name ('GSODA Junior Players presents Curtain Up'
 * reads 'Curtain Up'); a plural's possessive takes its apostrophe ('Mens' reads "Men's"); then shortTitle's room.
 */
export function cardTitle(title: string, max: number): string {
  let t = title.replace(/\s+/g, ' ').trim()
  t = t.replace(/\b(Men|Women|Children)s\b/g, (_m: string, who: string) => `${who}'s`)
  const presents = /^\S.{2,}?\s+presents?:?\s+(\S.{2,})$/i.exec(t)
  if (presents) t = presents[1]
  const colon = /^(\S.*?):\s+(.+)$/.exec(t)
  if (colon && /\b(tour|world tour|in concert|live in [A-Z][a-z]+|(19|20)\d\d)\b/i.test(colon[2])) t = colon[1]
  return shortTitle(t, max)
}

/** The room a title has on a gold timed card (two lines), on the ask (one line) and on a cover's draws. */
export const CARD_TITLE_MAX = 48
export const ASK_TITLE_MAX = 34
const DRAW_TITLE_MAX = 30
/** A Led by name keeps up to 44 letters (shortened by rule, never dropped: the PM's 20:40 fix 1). */
const DRAW_NAME_MAX = 44

/** "7:30 pm" at the night's own place. */
export function clockOf(iso: string, tz: string | null): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  ) as Record<string, string>
  return `${parts.hour}:${parts.minute} ${String(parts.dayPeriod ?? '').toLowerCase()}`.trim()
}

/** The night's local date, YYYY-MM-DD. */
function ymdOf(iso: string, tz: string | null): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** "Fri 20" */
function shortDay(iso: string, tz: string | null): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? ZONE, weekday: 'short', day: 'numeric' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])) as Record<string, string>
  return `${p.weekday} ${p.day}`
}

const isFree = (n: Pick<CampaignNight, 'cta'>) => n.cta.state === 'free_open' || n.cta.state === 'free_registration'

/**
 * Law 18 (a)'s headline weight inside tier 1: "stadium, arena, estate concert, major theatre or concert hall, festival",
 * read from the venue's own name, so an arena show leads a talk at a concert hall (the week of 16 November 2026).
 */
export function headlineWeight(n: Pick<CampaignNight, 'venueName' | 'categorySlug'>): number {
  const v = n.venueName ?? ''
  if (/\b(stadium|cricket ground|mcg|aami park|kardinia park)\b/i.test(v)) return 0
  if (/\b(arena|music bowl|festival hall|forum)\b/i.test(v)) return 1
  if (/\b(estate|racecourse|showgrounds|flemington)\b/i.test(v)) return 2
  if (/\b(theatre|hall|centre|athenaeum|playhouse|house)\b/i.test(v)) return 3
  return n.categorySlug === 'festival' ? 4 : 5
}

/** Tier, then (in tier 1) headline weight, then date: the order a slide names its nights in (law 18), the biggest draw first. */
function byDraw(a: CampaignNight, b: CampaignNight): number {
  const ta = socialTierOf(a)
  const tb = socialTierOf(b)
  if (ta !== tb) return ta - tb
  if (ta === 1 && headlineWeight(a) !== headlineWeight(b)) return headlineWeight(a) - headlineWeight(b)
  return Date.parse(a.startDate) - Date.parse(b.startDate)
}

/** A night's date label in one post: its first time, and every day it plays there. */
export type NightLabel = { time: string; day: string; first: string }

/**
 * ONE NIGHT, ONE DATE LABEL (the PM's 18:45 fix 1: "a run reads the same on every slide"): the one function a post's cover,
 * day slides and ask read a night's dates from. A night over several days reads its first and last ("Fri 20 to Sun 22");
 * a show with sessions on several days names them ("Fri 20 & Sat 21", over three "Thu 19 to Sat 21"); its time is the
 * night's own, as its caption prints it.
 */
export function nightLabel(n: CampaignNight, sessions: readonly CampaignNight[] = []): NightLabel {
  const all = [n, ...sessions.filter((x) => x.eventId !== n.eventId)].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const first = all[0]
  if (dateOf(n).includes(' to ') && n.endDate) {
    return { time: clockOf(n.startDate, n.timezone), day: `${shortDay(n.startDate, n.timezone)} to ${shortDay(n.endDate, n.timezone)}`, first: n.startDate }
  }
  const byDay = new Map<string, CampaignNight>()
  for (const x of all) if (!byDay.has(ymdOf(x.startDate, x.timezone))) byDay.set(ymdOf(x.startDate, x.timezone), x)
  const d = [...byDay.values()].map((x) => shortDay(x.startDate, x.timezone))
  // ONE TIME PER NIGHT (the PM's 23:45 of 17 November 2026, fix (a)): the time is this night's own, the one its caption
  // prints; it was the first session's, so Alastair Campbell's 3 pm row read '11:30 am' beside a caption of 3pm.
  return { time: clockOf(n.startDate, n.timezone), day: d.length === 1 ? d[0] : d.length === 2 ? `${d[0]} & ${d[1]}` : `${d[0]} to ${d[d.length - 1]}`, first: first.startDate }
}

/** A night as Lawal's gold timed card: its time over its date label, its title by rule, its place, and FREE. */
export function dayRowOf(n: CampaignNight, label: NightLabel = nightLabel(n)): DayRow {
  return {
    eventId: n.eventId,
    startDate: n.startDate,
    when: label.time,
    sub: label.day,
    title: cardTitle(n.title, CARD_TITLE_MAX),
    place: placeLine(n),
    free: isFree(n),
  }
}

/**
 * The place a card names: the venue's own name with its spaces made single (the PM's 20:40 fix 2: 'Tan Track  (Pillars of
 * Wisdom)'), or nothing when only an operator is known (fix 3: 'Bendigo Venues and Events' runs venues, it is not one),
 * so the line is the time alone.
 */
export function placeLine(n: Pick<CampaignNight, 'venueName' | 'placeName' | 'cityName'>): string {
  const place = (placeOf(n) ?? n.venueName ?? '').replace(/\s+/g, ' ').trim()
  return place && !isOperatorName(place) ? place : ''
}

/** A name that says it runs venues or events rather than being a place: 'X Venues and Events', '... Pty Ltd'. */
export function isOperatorName(name: string): boolean {
  return /\b(venues?|events?)\s+(and|&)\s+(venues?|events?)\b/i.test(name) || /\b(pty|ltd|inc|incorporated)\b\.?/i.test(name)
}

/** At most four nights a day slide, as the 9.5 sample's week (fitted at the square's size by the text guard). */
export const ROWS_PER_DAY_SLIDE = 4
/** In type a day slide may hold five, so two short days are one full slide rather than one half empty (the PM's 18:45 fix 4). */
export const ROWS_IN_TYPE = 5

/** "16 to 22 November", "30 November to 2 December", or one day "20 November", from the nights' own dates. */
export function rangeOf(nights: readonly CampaignNight[], sessionsOf: (n: CampaignNight) => readonly CampaignNight[] = () => []): string {
  // A run's every session counts (the PM's 18:45 fix 1: Bendigo's weekend read 21 November while it ran 20 to 22).
  const days = nights.flatMap((n) =>
    [n, ...sessionsOf(n)].flatMap((x) => [x.startDate, ...(x.endDate && dateOf(x).includes(' to ') ? [x.endDate] : [])].map((iso) => ({ iso, tz: x.timezone }))),
  )
  days.sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso))
  const fmt = (d: { iso: string; tz: string | null }) => local(d.iso, d.tz, { day: 'numeric', month: 'long' })
  const [first, last] = [days[0], days[days.length - 1]]
  if (!first) return ''
  const [fd, fm] = fmt(first).split(' ')
  const [ld, lm] = fmt(last).split(' ')
  if (fmt(first) === fmt(last)) return fmt(first)
  return fm === lm ? `${fd} to ${ld} ${lm}` : `${fd} ${fm} to ${ld} ${lm}`
}

/** "Led by LANY and Two Door Cinema Club": the piece's biggest draws (tier 1, then 2), by name, or null. */
/**
 * ONE RANKING FEEDS THE LED BY LINE AND THE ASK (the PM's 20:40 fix 1: Geelong's Led by named Geelong Dance Movement
 * while its ask opened with Leisurefest, because a name over 30 letters was dropped from the line and not from the
 * ask). The order is the cover's own photographed night, then law 18's draw; the Led by nights are its first one or
 * two of tier 1 or 2, and over a stand-in only nights of the photograph's kind (the PM's 20:40 fix 5); the ask's first
 * lines are those nights, in that order.
 */
export function ledOf(nights: readonly CampaignNight[], photographed: CampaignNight | null = null, kind: NightKind | null = null, crowd = false): { order: CampaignNight[]; led: CampaignNight[]; line: string | null } {
  const order = [...(photographed ? [photographed] : []), ...[...nights].filter((n) => n.eventId !== photographed?.eventId).sort(byDraw)]
  // Under a crowd stand-in only nights that stand are named (the PM's 03:45 fix 2): never a seated night under a crowd.
  const candidates = order.filter((n) => n === photographed || (socialTierOf(n) <= 2 && (kind === null || nightKind(n) === kind) && (!crowd || standingNight(n))))
  const seen = new Set<string>()
  const named = candidates.filter((n) => {
    const t = cardTitle(n.title, DRAW_NAME_MAX)
    return !seen.has(t) && Boolean(seen.add(t))
  })
  if (named.length === 0) return { order, led: [], line: null }
  const [a, b] = named.map((n) => cardTitle(n.title, DRAW_NAME_MAX))
  const two = b ? `Led by ${a} and ${b}` : null
  const fitsTwo = two !== null && two.length <= (photographed ? 90 : 46)
  return { order, led: fitsTwo ? named.slice(0, 2) : named.slice(0, 1), line: fitsTwo ? two : `Led by ${a}` }
}

export function drawsOf(nights: readonly CampaignNight[], photographed: CampaignNight | null = null, kind: NightKind | null = null): string | null {
  return ledOf(nights, photographed, kind).line
}

/** The day slides' heading: "Wednesday" and "18 Nov", or for two days "Mon & Tue" and "16 & 17 Nov". */
function headingOf(days: readonly CampaignNight[][]): { day: string; date: string } {
  const seen = new Set<string>()
  const firsts = days.map((d) => d[0]).filter((n) => {
    const key = ymdOf(n.startDate, n.timezone)
    return !seen.has(key) && Boolean(seen.add(key))
  })
  const dm = (n: CampaignNight) => local(n.startDate, n.timezone, { day: 'numeric', month: 'short' }).split(' ')
  if (firsts.length === 1) return { day: local(firsts[0].startDate, firsts[0].timezone, { weekday: 'long' }), date: dm(firsts[0]).join(' ') }
  const [first, last] = [firsts[0], firsts[firsts.length - 1]]
  const [a, b] = [dm(first), dm(last)]
  const wd = (n: CampaignNight) => local(n.startDate, n.timezone, { weekday: 'short' })
  const join = firsts.length === 2 ? ' & ' : ' to '
  return { day: `${wd(first)}${join}${wd(last)}`, date: a[1] === b[1] ? `${a[0]}${join}${b[0]} ${b[1]}` : `${a.join(' ')}${join}${b.join(' ')}` }
}

/**
 * A LIST POST IN THE 9.5 LOCKED LOOK (the PM's 17:10 of 15 November 2026): the cover, the day slides, a slide for each
 * night with its own permitted photograph (at most two), and the ask. A night's own photograph leads it: the cover shows
 * the biggest such night's whole; with none, the cover and each day slide take a stand-in of their lead night's kind
 * (stand-ins.ts), credited and named in the caption as not that night. Every word is the night's own.
 */
export function lockedListSlides(
  nights: readonly CampaignNight[],
  lines: [string, string, string],
  origin: string,
  /** One show, one line (the PM's 16:40, fix 2): a show's other sessions in the piece's days, said under its time. */
  sessionsOf: (n: CampaignNight) => readonly CampaignNight[] = () => [],
  /** The week's one chooser (the PM's 22:41 fix 2: no photograph twice in the week's feed); alone, the piece's own. */
  weekPick?: (kind: NightKind | null, use?: 'venue', sport?: Sport | null, how?: { stageOnly?: boolean; avoid?: ReadonlySet<string> }) => StandIn | null,
): Slide[] {
  const ordered = [...nights].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const chooser = weekPick ?? standInChooser(`${ordered[0]?.citySlug ?? ''} ${lines.join(' ')}`)
  /* The post's own shot families (the PM's 03:45 fix 4): a pyrotechnic shot once, and a family already drawn in this
     post passed over while another is free, so no post shows two near identical crowds. */
  const postShots = new Set<string>()
  const pick = (kind: NightKind | null, use?: 'venue', sport?: Sport | null, stageOnly = false) => {
    const s = chooser(kind, use, sport, { stageOnly, avoid: postShots })
    if (s?.shot) postShots.add(s.shot)
    return s
  }
  /* The PM's 17:40 fix 1 (rule one: one photo, one subject): a cover's stand-in stands over the night it is led by, which
     the cover names; since the PM's 22:41 fix 1 a day slide's stands over its first night by draw of the photograph's kind. */
  /* The first of these nights by draw whose kind still has a stand-in unused this week (out-12: a kind's set can run out
     in a week; the next night's kind then leads, never a repeat). Only the stand-in returned is taken from the week. */
  const firstPicked = (ns: readonly CampaignNight[]): { night: CampaignNight; standIn: StandIn } | null => {
    for (const n of [...ns].sort(byDraw)) {
      const kind = nightKindOf(n)
      if (!hasStandIn(kind)) continue
      // A cover stands over the night it is led by: a seated night takes a stage or room, never a crowd (03:45 fix 2).
      const s = pick(kind, undefined, kind === 'sport' ? sportOf(n) : null, !standingNight(n))
      if (s) return { night: n, standIn: s }
    }
    return null
  }
  const own = [...ordered].filter((n) => n.approvedPhotoUrl).sort(byDraw)
  const lead = own[0] ?? null
  /* LAWAL'S SOCIAL LOCK (15 November 2026, 20:52): every post leads with a photograph, as every benchmark post does
     (A-LOCK-1's cover leads with AMCF's own under "Led by LANY and Two Door Cinema Club"). With no night's own photograph,
     the cover is led by the first night by draw whose kind has a licensed stand-in (photographed first, the one ranking
     of the PM's 20:40 fix 1), and its stand-in stands over that night alone, which the cover names (the PM's 17:40 rule
     one: one photo, one subject). Out-9: Melbourne's week, Geelong's and Bendigo's covers were in type because their
     single top draw had no such kind. */
  const coverPick = lead ? null : firstPicked(ordered.filter((n) => socialTierOf(n) <= 2))
  const coverStandIn = coverPick ? coverPick.standIn : null
  const ledBy = ledOf(ordered, lead, coverStandIn ? coverStandIn.kind : null, Boolean(coverStandIn?.shot))
  const cover: Slide = {
    t: 'week_cover',
    composition: 'contents_cover',
    range: rangeOf(ordered, sessionsOf),
    lines,
    draws: ledBy.line,
    // The PM's 17:40 fix 5: the out-4 cover's line, "2 are free, 3 need tickets. Tap through for each night."
    line: splitLine(ordered),
    photoEventId: lead ? lead.eventId : null,
    photo: lead ? lead.approvedPhotoUrl : coverStandIn ? standInUrl(origin, coverStandIn) : null,
    credit: lead ? (lead.photoCredit ? creditLine(lead.photoCredit) : null) : coverStandIn ? standInCredit(coverStandIn) : null,
  }

  /* One label per night in this post (fix 1), read by the cover, the day slides and the ask alike. */
  const labels = new Map(ordered.map((n) => [n.eventId, nightLabel(n, sessionsOf(n))]))
  const rowOf = (n: CampaignNight) => dayRowOf(n, labels.get(n.eventId))
  /* A day slide in type of one or two cards joins a neighbour in type when together they hold five or fewer (fix 4). */
  /* The PM's 22:41 fix 1: every day slide carries a photograph of its LEAD kind, as A-LOCK-2 to A-LOCK-5 do: the slide's
     first night by draw whose kind has a licensed stand-in; the stand-in stands over that night, which its card names.
     A slide with no such night stays in type and joins a neighbour in type (fix 4 of 18:45). */
  const ofOneKind = (ns: readonly CampaignNight[]) => ns.some((n) => hasStandIn(nightKindOf(n)))
  /* The PM's 02:25 fix 1: a day slide's band is of the kind most of its nights share, the first night as the slide
     lists them breaking a tie; a standing crowd (a gig's, a festival's) never stands over seated nights (a talk, a
     recital, theatre) as many as its own. A kind with no stand-in left this week passes to the next. Out-12's 01 put a
     rock crowd over Ben Macintyre's talk and Anne Sofie von Otter's recital, with LANY third. */
  const bandStandIn = (listed: readonly CampaignNight[]) => {
    const kinds = listed.map((n) => nightKindOf(n))
    const count = new Map<NightKind, number>()
    for (const k of kinds) if (k && hasStandIn(k)) count.set(k, (count.get(k) ?? 0) + 1)
    const seated = listed.filter((n) => seatedNight(n)).length
    const standing = listed.filter((n) => standingNight(n)).length
    // The PM's 03:45 fixes 2 and 3: a crowd only when every row stands; beside a seated night, a stage or room.
    const stageOnly = !(listed.length > 0 && standing === listed.length)
    const ranked = [...count.keys()].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || kinds.indexOf(a) - kinds.indexOf(b))
    const order = seated >= standing && seated > 0 ? [...ranked.filter((k) => !STANDING_KINDS.includes(k)), ...ranked.filter((k) => STANDING_KINDS.includes(k))] : ranked
    for (const k of order) {
      const first = listed.find((n) => nightKindOf(n) === k)
      const st = pick(k, undefined, k === 'sport' && first ? sportOf(first) : null, stageOnly)
      if (st) return st
    }
    return null
  }
  const groups = daySlideGroups(ordered)
  for (let i = 0; i < groups.length; i++) {
    const size = (g: CampaignNight[][]) => g.reduce((a, x) => a + x.length, 0)
    if (ofOneKind(groups[i].flat()) || size(groups[i]) > 2) continue
    const j = [i - 1, i + 1].find((x) => groups[x] && !ofOneKind(groups[x].flat()) && size(groups[x]) + size(groups[i]) <= ROWS_IN_TYPE)
    if (j === undefined) continue
    const [a, b] = j < i ? [j, i] : [i, j]
    groups.splice(a, 2, [...groups[a], ...groups[b]])
    i = a - 1
  }
  const daySlides: Slide[] = groups.map((days) => {
    const slideDays = new Set(days.flat().map((x) => ymdOf(x.startDate, x.timezone)))
    /* The draw decides which nights make the slide; day then clock orders them, a run by its first session on the
       slide's days (the PM's 18:45 fix 2: Leisurefest's Friday 9:00 am above the Friday 7:30 pm). */
    const key = (n: CampaignNight) => Math.min(...[n, ...sessionsOf(n)].filter((x) => slideDays.has(ymdOf(x.startDate, x.timezone))).map((x) => Date.parse(x.startDate)), Date.parse(n.startDate))
    const listed = [...days.flat()].sort((a, b) => key(a) - key(b))
    const s = bandStandIn(listed)
    return {
      t: 'days',
      composition: 'contents_cover',
      ...headingOf(days),
      rows: listed.map(rowOf),
      photo: s ? standInUrl(origin, s) : null,
      credit: s ? standInCredit(s) : null,
    }
  })

  const features: Slide[] = own.slice(0, 2).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate)).map((n) => featureSlideOf(n))
  // The ask names each night by the same date label as its card (fix 1).
  // The PM's 19:45 fix 1: the ask's first line is the night the cover is led by (its photograph's, else its first draw),
  // then the post's best by draw, free or ticketed alike.
  const ledIds = new Set(ledBy.led.map((n) => n.eventId))
  const askOrder = [...ledBy.led, ...ledBy.order.filter((n) => !ledIds.has(n.eventId))]
  // The PM's 02:25 fix 4 (law 18 (c) applied to the ask): never a tier 4 session among the three while a night of tiers 1
  // to 3 is on the post (out-12's Ballarat took Show-and-Tell with Carly over the Free Sunday Garden Tour).
  const askable = askOrder.some((n) => socialTierOf(n) < 4) ? askOrder.filter((n) => socialTierOf(n) < 4) : askOrder
  const chosen = askable.slice(0, 3)
  const firstOf = (n: CampaignNight) => Date.parse((labels.get(n.eventId) ?? nightLabel(n)).first)
  const askThree = [...chosen.filter((n) => ledIds.has(n.eventId)), ...chosen.filter((n) => !ledIds.has(n.eventId)).sort((a, b) => firstOf(a) - firstOf(b))]
  const three = askThree.map((n) => ({ ...rowOf(n), when: (labels.get(n.eventId) ?? nightLabel(n)).day, sub: null, title: cardTitle(n.title, ASK_TITLE_MAX) }))
  // A cover with no photograph lists its three lead nights as cards, so the page is never bare ground.
  const lead3 = cover.photo ? [] : [...ordered].sort(byDraw).slice(0, 3).sort((a, b) => Date.parse((labels.get(a.eventId) ?? nightLabel(a)).first) - Date.parse((labels.get(b.eventId) ?? nightLabel(b)).first)).map(rowOf)
  const coverSlide = cover.photo ? cover : { ...cover, lead: lead3 }
  // No repeat slide (the PM's 18:45 fix 3): a day slide whose every card is already on the cover adds nothing and drops.
  const onCover = new Set(lead3.map((r) => r.eventId))
  const kept = daySlides.filter((d) => !(d.t === 'days' && d.rows.every((r) => onCover.has(r.eventId))))
  return [coverSlide, ...kept, ...features, { t: 'ask', composition: 'close', count: ordered.length, three }]
}

/**
 * The day slides' groups: each day's nights, the biggest draw first, in slides of at most four cards, packed in day order
 * and balanced (twelve nights make three slides of four, five make three and two), never splitting a day unless it holds
 * more than four; a day over four is split into even parts.
 */
export function daySlideGroups(ordered: readonly CampaignNight[]): CampaignNight[][][] {
  const byDay = new Map<string, CampaignNight[]>()
  for (const n of ordered) {
    const key = ymdOf(n.startDate, n.timezone)
    byDay.set(key, [...(byDay.get(key) ?? []), n])
  }
  const parts: CampaignNight[][] = []
  for (const day of byDay.values()) {
    const sorted = [...day].sort(byDraw)
    const k = Math.ceil(sorted.length / ROWS_PER_DAY_SLIDE)
    const size = Math.ceil(sorted.length / k)
    for (let i = 0; i < sorted.length; i += size) parts.push(sorted.slice(i, i + size))
  }
  const total = parts.reduce((a, x) => a + x.length, 0)
  const slides = Math.max(1, Math.ceil(total / ROWS_PER_DAY_SLIDE))
  const target = total / slides
  const groups: CampaignNight[][][] = []
  let cur: CampaignNight[][] = []
  let rows = 0
  for (const [i, part] of parts.entries()) {
    const left = parts.slice(i).reduce((a, x) => a + x.length, 0)
    const full = rows + part.length > ROWS_PER_DAY_SLIDE
    // Close a slide once it holds its share, unless the rest would then need a slide more than the plan.
    const enough = rows >= target - 0.01 && Math.ceil(left / ROWS_PER_DAY_SLIDE) <= slides - groups.length - 1
    if (cur.length > 0 && (full || enough)) {
      groups.push(cur)
      cur = []
      rows = 0
    }
    cur.push(part)
    rows += part.length
  }
  if (cur.length > 0) groups.push(cur)
  return groups
}

/** The word a venue's week takes when every night is one kind: 'Four comedy nights this week'. */
const KIND_WORD: Record<NightKind, string> = { comedy: 'comedy', jazz: 'jazz', gig: 'live music', classical: 'classical', talk: 'talk', festival: 'festival', dance: 'dance', theatre: 'theatre', christmas: 'Christmas', market: 'market', sport: 'match', family: 'family' }

/**
 * FAMILY E, A VENUE'S WEEK (WINDOW 6's venuePiece, scored 9.5 at 09:50 on 15 November 2026): the venue's own name large,
 * its nights in clock order as gold timed cards with each night's entry line, a stand-in across the top only when every
 * night is of its kind, and the ask. The place is the venue row's own name (the PM's 16:40, fix 4), else its host's.
 */
export function venueSlideOf(host: string, nights: readonly CampaignNight[], origin: string, weekPick?: (kind: NightKind | null, use?: 'venue', sport?: Sport | null, how?: { stageOnly?: boolean; avoid?: ReadonlySet<string> }) => StandIn | null): Extract<Slide, { t: 'venue' }> {
  const ordered = [...nights].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const kinds = new Set(ordered.map((n) => nightKind(n)))
  const [kind] = [...kinds]
  const one = kinds.size === 1 && kind ? kind : null
  // Never a stand-in whose venue band the guard faulted (stand-ins.ts, venue: false; screen 3 of 16 November 2026).
  // A venue's week over a seated room takes a stage or room too, never a crowd (the PM's 03:45 fix 2, the same class).
  const s = one ? (weekPick ?? standInChooser())(one, 'venue', null, { stageOnly: !ordered.every((n) => standingNight(n)) }) : null
  const count = ordered.length
  const countWord = (['', 'One', 'Two', 'Three', 'Four', 'Five'][count] ?? String(count))
  return {
    t: 'venue',
    composition: 'venue_spotlight',
    venue: placeOf(ordered[0]) ?? host,
    eyebrow: `Venue · ${rangeOf(ordered)}`,
    accent: `${countWord} ${one ? `${KIND_WORD[one]} ` : ''}${nightsWord(ordered, count === 1)} this week`,
    rows: ordered.map((n) => ({ ...dayRowOf(n), place: nightWords(n).entry ?? '' })),
    photo: s ? standInUrl(origin, s) : null,
    credit: s ? standInCredit(s) : null,
  }
}

/** A night's kind for its stand-in: only where its own words say it (nightKind). */
function nightKindOf(n: CampaignNight): NightKind | null {
  return nightKind(n)
}

/** Whether a kind has a licensed stand-in photograph (stand-ins.ts). */
function hasStandIn(kind: NightKind | null): boolean {
  return kind !== null && STAND_INS.some((x) => x.kind === kind)
}

/** A night with its own permitted photograph, whole: its date and place, its name in up to two lines, its entry. */
export function featureSlideOf(n: CampaignNight): Extract<Slide, { t: 'feature' }> {
  const w = nightWords(n)
  const span = dateOf(n).includes(' to ')
  const place = placeOf(n) ?? n.venueName
  return {
    t: 'feature',
    composition: compositionFor(n),
    eventId: n.eventId,
    startDate: n.startDate,
    eyebrow: [w.date, span ? null : clockOf(n.startDate, n.timezone), place].filter((x): x is string => Boolean(x)).join(' · '),
    title: cardTitle(n.title, 40),
    accent: w.entry,
    chip: isFree(n) ? 'FREE ENTRY' : null,
    photo: String(n.approvedPhotoUrl),
    credit: n.photoCredit ? creditLine(n.photoCredit) : null,
  }
}

/**
 * The caption's line for the stand-ins a piece shows (the PM's 09:10 fix 1 of 15 November 2026): what each shows, that it
 * is from Pexels, and that it is not the night. Null when the piece shows none.
 */
export function picturedLine(slides: readonly Slide[]): string | null {
  const at: { n: number; subject: string }[] = []
  slides.forEach((sl, i) => {
    const s = 'photo' in sl ? standInOf(sl.photo) : null
    if (s) at.push({ n: i + 1, subject: s.subject })
  })
  if (at.length === 0) return null
  const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  if (at.length === 1) return `Pictured on slide ${at[0].n}: ${at[0].subject}, a photograph from Pexels, not this night.`
  return `Pictured on slides ${list(at.map((a) => String(a.n)))}: ${list(at.map((a) => a.subject))}, photographs from Pexels, not these nights.`
}

/** "3 are free, 2 need tickets. Tap through for each night." from the nights' own states; a night with no price is neither. */
export function splitLine(nights: readonly CampaignNight[]): string {
  const free = nights.filter((n) => n.cta.state === 'free_open' || n.cta.state === 'free_registration').length
  const paid = nights.filter((n) => n.cta.state === 'paid_native' || n.cta.state === 'paid_external').length
  const parts: string[] = []
  if (free > 0) parts.push(`${free === nights.length ? 'All' : free} ${free === 1 ? 'is' : 'are'} free`)
  if (paid > 0) parts.push(`${paid} ${paid === 1 ? 'needs' : 'need'} tickets`)
  return parts.length === 0 ? 'Tap through for each night.' : `${parts.join(', ')}. Tap through for each night.`
}

/**
 * NIGHTS OR THINGS (the PM's 20:40 fix 4: 'Five nights worth planning for' carried an 11:00 am studio tour): a headline
 * says nights only when every one starts at 5 pm or later where it is held; otherwise things.
 */
export function nightsWord(nights: readonly Pick<CampaignNight, 'startDate' | 'timezone'>[], one = false): string {
  const evening = nights.every((n) => Number(new Intl.DateTimeFormat('en-AU', { timeZone: n.timezone ?? ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date(n.startDate))) >= 17)
  return evening ? (one ? 'night' : 'nights') : one ? 'thing' : 'things'
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five']
const countWord = (k: number): string => COUNT_WORDS[k] ?? String(k)

/**
 * A SPOTLIGHT HOLDS ONLY ITS KIND (the PM's 23:45 of 17 November 2026, fix (b)): a music spotlight takes music nights only
 * (Melbourne's carried 'An Evening with Alastair Campbell', a talk filed as music), and a talk is spotlit only as a talk.
 */
const MUSIC_KINDS: readonly NightKind[] = ['gig', 'jazz', 'classical', 'festival', 'dance']
export function spotlightFits(categorySlug: string, n: CampaignNight): boolean {
  const kind = nightKind(n)
  if (MUSIC_CATEGORIES.includes(categorySlug.toLowerCase())) return kind !== null && MUSIC_KINDS.includes(kind)
  return kind !== 'talk' || /talk/i.test(categorySlug)
}

/** A spotlight's cover in natural words: '5 nights of / music in Melbourne / this week', or '5 music / events in ...'. */
export function spotlightLines(name: string, nights: readonly CampaignNight[], cityName: string): [string, string, string] {
  const evening = nightsWord(nights) === 'nights'
  return evening
    ? [`${nights.length} ${nights.length === 1 ? 'night' : 'nights'} of`, `${name.toLowerCase()} in ${cityName}`, 'this week']
    : [`${nights.length} ${name.toLowerCase()}`, `${nights.length === 1 ? 'event' : 'events'} in ${cityName}`, 'this week']
}

/** One line a pick: the place pin for a free night, the ticket for a paid one (the 13:27 (6), kept by the 13:53). */
export function pickLine(n: CampaignNight): string {
  const mark = n.cta.state === 'paid_native' || n.cta.state === 'paid_external' ? '🎟' : '📍'
  const price = n.priceLine ? ` ${n.priceLine}.` : ''
  return `${mark} ${whenOf(n)}, ${n.title}, ${metaOf(n)}.${price}`
}

export function tagsFor(city: CampaignCity, extra: string | null): string {
  return [`#${city.slug}`, `#${city.slug}events`, extra].filter(Boolean).slice(0, 3).join(' ')
}

export function creditsOf(nights: readonly CampaignNight[]): string {
  const credits = [...new Set(nights.map((n) => (n.approvedPhotoUrl ? n.photoCredit : null)).filter((c): c is string => Boolean(c)))]
  return credits.map((c) => creditLine(c)).filter((c): c is string => Boolean(c)).join('\n')
}

/**
 * The page a piece sends people to must list every night it advertises (J15): /free/<city>/this-week lists only free
 * nights, so a set with any other night goes to /city/<city>, which lists them all.
 */
export function destinationOf(nights: readonly CampaignNight[], city: CampaignCity): { path: string; allFree: boolean } {
  const allFree = nights.every((n) => n.cta.state === 'free_open' || n.cta.state === 'free_registration')
  return allFree ? { path: `/free/${city.slug}/this-week`, allFree } : { path: `/city/${city.slug}`, allFree }
}

export function siteOf(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '')
}

/** A caption with no two blank lines in a row and nothing trailing. */
export function join(lines: readonly string[]): string {
  return lines.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim()
}

/**
 * The Instagram and Facebook versions (J13). Instagram: the hook first, no link in a caption (it is not tappable), the
 * call to action points at the link in bio. Facebook: the same hook, the link written in full because it is tappable
 * and unfurls, at most one tag.
 */
export function versionsOf(hook: string, body: readonly string[], link: string, igCta: string, fbCta: string, crop: '4:5' | '9:16', tags: string): PiecePlan['versions'] {
  return {
    instagram: { hook, caption: join([hook, '', ...body, '', igCta, '', tags]), crop, cta: igCta },
    facebook: { hook, caption: join([hook, '', ...body, '', `${fbCta} ${link}`]), crop, cta: `${fbCta} ${link}` },
  }
}

/** Every piece is whole before it is kept: one audience, one objective, one purpose, one next step, one outcome, a real link. */
export function pieceRefusal(p: PiecePlan): string | null {
  if (!AUDIENCES.includes(p.audience)) return 'A piece needs one audience: attendees, organisers, venues or partners.'
  if (!OBJECTIVES.includes(p.objective)) return 'A piece needs one objective: audience growth or organiser growth.'
  if (p.purpose.trim().length < 3) return 'A piece needs one purpose.'
  if (p.nextStep.trim().length < 3) return 'A piece needs one call to action.'
  if (p.outcome.trim().length < 3) return 'A piece needs one measurable outcome.'
  if (!/^https:\/\/\S+$/.test(p.link)) return 'A piece needs the real page it sends people to.'
  if (p.slides.length === 0) return 'A piece needs its slides.'
  for (const text of [p.caption, p.versions.instagram.caption, p.versions.facebook.caption]) {
    if (/[!\u2013\u2014]/.test(text)) return 'A caption carries an exclamation mark or a long dash.'
  }
  /* The one rule of a post's words (words.ts carriesBannedWord): every word the piece says, its names taken out. */
  const said = [p.caption, p.versions.instagram.caption, p.versions.facebook.caption, p.message ?? '', p.nextStep, p.purpose, JSON.stringify(p.slides)]
  if (said.some((text) => carriesBannedWord(text, p.names ?? []))) return 'The words carry a banned word. Say community.'
  if ((p.kind === 'partner_kit') !== (p.partnerName !== null)) return 'A partner kit names its partner, and only a partner kit does.'
  if (p.kind === 'organiser_campaign' && p.eventIds.length > 0) return 'The organiser campaign advertises no night: it is its own asset (J11).'
  if (p.kind === 'brand_campaign' && (p.eventIds.length > 0 || p.picks.length > 0)) return 'A brand piece names no night, so no photograph on it is taken for one.'
  return null
}

/**
 * The week's campaign from its nights. Only cities with a weekly guide are planned, and only the routes that exist are
 * linked: /city/<city>, /free/<city>/this-week and /organisers.
 */
export function planCampaign(input: {
  nights: readonly CampaignNight[]
  cities: readonly CampaignCity[]
  weekStart: string
  origin: string
  /** K6: the nights the founder left out of this week's campaign. */
  excluded?: ReadonlySet<string>
  /**
   * The newest photograph licensed for EventLinqs' own promotion and tied to no night (the store's social_brand_images),
   * or none: the brand piece is then drawn in EventLinqs' own art (treatment C), never a stand-in photo.
   */
  brandPhoto?: { url: string; credit: string } | null
  /**
   * The first day of the week (0 is Monday) a spotlight's nights may fall on (spotlightsFromDay): a spotlight drawn on a
   * day of the week already under way carries nights from the next day on, so it can still go whole. 0, the default,
   * is the whole week.
   */
  spotlightsFrom?: number
}): CampaignPlan {
  const { origin, weekStart } = input
  const spotlightsFrom = input.spotlightsFrom ?? 0
  const site = siteOf(origin)
  // One chooser for the whole week's feed (the PM's 22:41 fix 2): no stand-in photograph twice in a week.
  const weekPick = standInChooser('the week')
  const nightsIn = input.nights.map((n) => ({ ...n, sourceTitle: n.sourceTitle ?? n.title, title: postTitle(n.title, n.venueName) }))
  const inWeek = nightsIn
    .map((n) => ({ n, day: dayInWeek(n, weekStart) }))
    .filter((x) => x.day >= 0 && !(input.excluded?.has(x.n.eventId) ?? false))
    .sort((a, b) => Date.parse(a.n.startDate) - Date.parse(b.n.startDate))
  const pieces: PiecePlan[] = []
  const featured = new Map<string, CampaignNight>()
  const shown = new Map<string, CampaignNight>()
  const feature = (nights: readonly CampaignNight[]) => {
    for (const n of nights) {
      shown.set(n.eventId, n)
      if (n.host && !featured.has(n.host)) featured.set(n.host, n)
    }
  }
  const outcomeOf = (page: string) => `Visits to ${page} through this post's own link, then presses out and tickets from there`
  /* What a stand-in shows, first in the caption after the hook (the PM's 09:10 fix 1 of 15 November 2026). */
  const pictured = (slides: readonly Slide[]) => {
    const line = picturedLine(slides)
    return line ? [line, ''] : []
  }

  /* One show, one line (the PM's 16:40, fix 2): every session of a title in the week, for its cover line. */
  const sessionsOf = (n: CampaignNight, days?: readonly number[]) =>
    inWeek.filter((x) => x.n.citySlug === n.citySlug && titleKey(x.n) === titleKey(n) && (!days || days.includes(x.day))).map((x) => x.n)
  for (const city of input.cities) {
    const week = inWeek.filter((x) => x.n.citySlug === city.slug).map((x) => x.n)
    /* Two list posts in one city and one week share at most one night (the PM's 16:40, fix 3). */
    const listed = new Set<string>()
    /* Monday: the week ahead, to the city page. */
    const { nights: ahead, picks: aheadPicks } = selectNights(week, MAX_NIGHTS)
    if (ahead.length >= 2) {
      for (const n of ahead) listed.add(n.eventId)
      const hook = `${countWord(ahead.length)} things on in ${city.name} this week.`
      const aheadSlides = lockedListSlides(ahead, [`${ahead.length} things on`, `in ${city.name}`, 'this week'], origin, (n) => sessionsOf(n), weekPick)
      const body = [...pictured(aheadSlides), ...ahead.map(pickLine), '', creditsOf(ahead)]
      pieces.push({
        kind: 'week_ahead',
        city: city.slug,
        audience: 'attendees',
        objective: 'audience_growth',
        purpose: `Show what is on in ${city.name} this week`,
        nextStep: `Open the week at ${site}/city/${city.slug}`,
        outcome: outcomeOf(`/city/${city.slug}`),
        link: `${origin}/city/${city.slug}`,
        format: 'feed',
        eventIds: ahead.map((n) => n.eventId),
        picks: aheadPicks,
        mode: modeOf(ahead),
        slides: aheadSlides,
        caption: join([hook, '', ...body, '', `The whole week: ${site}/city/${city.slug}`, '', tagsFor(city, null)]),
        versions: versionsOf(hook, body, `${origin}/city/${city.slug}`, 'The whole week is at the link in our bio.', 'The whole week:', '4:5', tagsFor(city, null)),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(ahead)
    }

    /* Thursday: the weekend guide carousel, paired with the roundup edition, to the city's free week page. */
    const { nights: weekend, picks: weekendPicks } = selectFresh(inWeek.filter((x) => x.n.citySlug === city.slug && x.day >= 4), [4, 5, 6], MAX_NIGHTS, listed)
    if (weekend.length >= 2) {
      for (const n of weekend) listed.add(n.eventId)
      const wDest = destinationOf(weekend, city)
      const hook = `${countWord(weekend.length)} things on in ${city.name} this weekend.`
      const weekendSlides = lockedListSlides(weekend, [`${weekend.length} things on`, `in ${city.name}`, 'this weekend'], origin, (n) => sessionsOf(n, [4, 5, 6]), weekPick)
      const body = [...pictured(weekendSlides), ...weekend.map(pickLine), '', creditsOf(weekend)]
      pieces.push({
        kind: 'weekend_carousel',
        city: city.slug,
        audience: 'attendees',
        objective: 'audience_growth',
        purpose: `Pick the weekend in ${city.name}`,
        nextStep: `Save it and open ${site}${wDest.path}`,
        outcome: outcomeOf(`${wDest.path}`),
        link: `${origin}${wDest.path}`,
        format: 'feed',
        eventIds: weekend.map((n) => n.eventId),
        picks: weekendPicks,
        mode: modeOf(weekend),
        slides: weekendSlides,
        caption: join([hook, '', ...body, '', `${wDest.allFree ? 'Every free thing this week' : 'The whole week'}: ${site}${wDest.path}`, '', tagsFor(city, '#thisweekend')]),
        versions: versionsOf(hook, body, `${origin}${wDest.path}`, wDest.allFree ? 'Every free thing this week is at the link in our bio.' : 'The whole week is at the link in our bio.', wDest.allFree ? 'Every free thing this week:' : 'The whole week:', '4:5', tagsFor(city, '#thisweekend')),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(weekend)
    }

    if (!EDITION_CITIES.includes(city.slug)) continue

    /* Friday: Tonight and Tomorrow, the city's Friday and Saturday nights, to the city page. Its words name the days,
       never 'tonight', so a piece that posts late is still true; a night that has ended holds it (pieceDependencies). */
    const { nights: friSat, picks: friSatPicks } = selectFresh(inWeek.filter((x) => x.n.citySlug === city.slug && (x.day === 4 || x.day === 5)), [4, 5], MAX_NIGHTS, listed)
    // Two posts, one list (fix 3): when Friday and Saturday's picks are the weekend's own, this later post drops itself.
    const sameAsWeekend = friSat.length === weekend.length && friSat.every((n) => weekend.some((w) => w.eventId === n.eventId))
    if (friSat.length >= 2 && !sameAsWeekend) {
      for (const n of friSat) listed.add(n.eventId)
      const days = `Friday and Saturday in ${city.name}`
      const hook = `${countWord(friSat.length)} things on ${days}.`
      const friSatSlides = lockedListSlides(friSat, [`${friSat.length} things on`, `in ${city.name}`, 'Fri and Sat'], origin, (n) => sessionsOf(n, [4, 5]), weekPick)
      const body = [...pictured(friSatSlides), ...friSat.map(pickLine), '', creditsOf(friSat)]
      pieces.push({
        kind: 'tonight_tomorrow',
        city: city.slug,
        audience: 'attendees',
        objective: 'audience_growth',
        purpose: `Pick a night out ${days}`,
        nextStep: `Open ${site}/city/${city.slug} and choose a night`,
        outcome: outcomeOf(`/city/${city.slug}`),
        link: `${origin}/city/${city.slug}`,
        format: 'feed',
        eventIds: friSat.map((n) => n.eventId),
        picks: friSatPicks,
        mode: modeOf(friSat),
        slides: friSatSlides,
        caption: join([hook, '', ...body, '', `The whole week: ${site}/city/${city.slug}`, '', tagsFor(city, null)]),
        versions: versionsOf(hook, body, `${origin}/city/${city.slug}`, 'The whole week is at the link in our bio.', 'The whole week:', '4:5', tagsFor(city, null)),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(friSat)
    }

    /* Coming Up: the consideration stage, T-20 to T-8 counted from the week's Monday (src/lib/social/stages.ts), to the
       city page. Each line prints its date, as a weekday alone would mislead this far out. */
    const monday = new Date(`${weekStart}T00:00:00Z`)
    const { nights: later, picks: laterPicks } = selectNights(
      nightsIn.filter((n) => n.citySlug === city.slug && !(input.excluded?.has(n.eventId) ?? false) && campaignStageOf(n, monday) === 'consideration'),
      MAX_NIGHTS,
    )
    if (later.length >= 2) {
      const hook = `${countWord(later.length)} ${nightsWord(later)} worth planning for in ${city.name}.`
      const laterSlides = lockedListSlides(later, [`${later.length} ${nightsWord(later)} worth`, 'planning for', `in ${city.name}`], origin, undefined, weekPick)
      const body = [...pictured(laterSlides), ...later.map(pickLine), '', creditsOf(later)]
      pieces.push({
        kind: 'coming_up',
        city: city.slug,
        audience: 'attendees',
        objective: 'audience_growth',
        purpose: `Show what is coming up in ${city.name}, while there is time to plan`,
        nextStep: `Save it and open ${site}/city/${city.slug}`,
        outcome: outcomeOf(`/city/${city.slug}`),
        link: `${origin}/city/${city.slug}`,
        format: 'feed',
        eventIds: later.map((n) => n.eventId),
        picks: laterPicks,
        mode: modeOf(later),
        slides: laterSlides,
        caption: join([hook, '', ...body, '', `Everything coming up: ${site}/city/${city.slug}`, '', tagsFor(city, null)]),
        versions: versionsOf(hook, body, `${origin}/city/${city.slug}`, 'Everything coming up is at the link in our bio.', 'Everything coming up:', '4:5', tagsFor(city, null)),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(later)
    }

    /* The Category Spotlight: the city's strongest category of the week, three nights or more, to its filtered view. */
    const byCategory = new Map<string, CampaignNight[]>()
    for (const n of week) if (n.categorySlug && dayInWeek(n, weekStart) >= spotlightsFrom && spotlightFits(n.categorySlug, n)) byCategory.set(n.categorySlug, [...(byCategory.get(n.categorySlug) ?? []), n])
    const strongest = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]
    if (strongest && strongest[1].filter((n) => !listed.has(n.eventId)).length >= SPOTLIGHT_MIN_NIGHTS) {
      const [slug, every] = strongest
      const all = every.filter((n) => !listed.has(n.eventId))
      const name = getCategoryDisplayName(slug)
      const { nights: spot, picks: spotPicks } = selectNights(all, MAX_NIGHTS, { perCategory: MAX_NIGHTS })
      // Three different nights, after one night per title (out-7, 18:57: three sessions of one show drew "1 family nights").
      if (spot.length < SPOTLIGHT_MIN_NIGHTS) continue
      const path = `/events?city=${city.slug}&category=${slug}`
      const hook = `${name} in ${city.name} this week: ${countWord(spot.length).toLowerCase()} ${nightsWord(spot) === 'nights' ? 'nights' : 'events'}.`
      const spotSlides = lockedListSlides(spot, spotlightLines(name, spot, city.name), origin, (n) => sessionsOf(n), weekPick)
      const body = [...pictured(spotSlides), ...spot.map(pickLine), '', creditsOf(spot)]
      pieces.push({
        kind: 'category_spotlight',
        city: city.slug,
        audience: 'attendees',
        objective: 'audience_growth',
        purpose: `Show the ${name.toLowerCase()} on in ${city.name} this week`,
        nextStep: `Open ${site}${path}`,
        outcome: outcomeOf(path),
        link: `${origin}${path}`,
        format: 'feed',
        eventIds: spot.map((n) => n.eventId),
        picks: spotPicks,
        mode: modeOf(spot),
        slides: spotSlides,
        caption: join([hook, '', ...body, '', `All of it: ${site}${path}`, '', tagsFor(city, null)]),
        versions: versionsOf(hook, body, `${origin}${path}`, 'All of it is at the link in our bio.', 'All of it:', '4:5', tagsFor(city, null)),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(spot)
    }
  }

  /* Wednesday: the Discovery Reel, three to five nights from the city with the most, as 9:16 frames (an animated
     editorial guide, never footage it does not have: J9). */
  const top = input.cities
    .map((c) => ({ c, nights: inWeek.filter((x) => x.n.citySlug === c.slug).map((x) => x.n) }))
    .sort((a, b) => b.nights.length - a.nights.length)[0]
  if (top && top.nights.length >= 3) {
    const { nights: reel, picks: reelPicks } = selectNights(top.nights, MAX_NIGHTS)
    const city = top.c
    const rDest = destinationOf(reel, city)
    const hook = `${countWord(reel.length)} things on in ${city.name} this week.`
    // Family F, the week as stories (the PM's 17:10 of 15 November 2026): the same locked slides, drawn at 9:16.
    const reelSlides = lockedListSlides(reel, [`${reel.length} things on`, `in ${city.name}`, 'this week'], origin, (n) => sessionsOf(n), weekPick)
    const body = [...pictured(reelSlides), ...reel.map(pickLine), '', creditsOf(reel)]
    pieces.push({
      kind: 'discovery_reel',
      city: city.slug,
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: `Show ${countWord(reel.length).toLowerCase()} things worth leaving the house for in ${city.name}`,
      nextStep: `Watch, then open ${site}${rDest.path}`,
      outcome: `Plays to the end and shares (entered from Instagram), then ${outcomeOf(`${rDest.path}`).toLowerCase()}`,
      link: `${origin}${rDest.path}`,
      format: 'story',
      eventIds: reel.map((n) => n.eventId),
      picks: reelPicks,
      mode: modeOf(reel),
      slides: reelSlides,
      caption: join([hook, '', ...body, '', `The week: ${site}${rDest.path}`, '', tagsFor(city, null)]),
      versions: versionsOf(hook, body, `${origin}${rDest.path}`, 'The week is at the link in our bio.', 'The week:', '9:16', tagsFor(city, null)),
      partnerName: null,
      partnerEventId: null,
      message: null,
    })
    feature(reel)
  }

  /* Friday: the venue spotlight for attendees, the host with the most nights this week, to its city's page. */
  const hosts = new Map<string, CampaignNight[]>()
  // Law 18 (Lawal's 14:07 of 15 November 2026, tier 4 never goes in a post): a host is counted by its nights a post may
  // carry, so a library's toddler and baby sessions never make it the venue of the week (out-6, 18:28).
  for (const { n, day } of inWeek) if (day >= spotlightsFrom && n.host && socialTierOf(n) !== 4) hosts.set(n.host, [...(hosts.get(n.host) ?? []), n])
  const spot = [...hosts.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  if (spot) {
    const [name, all] = spot
    /* One night per title here too: a weekly night on Thursday and Friday is one row, its sooner date (A5). */
    const nights = oncePerTitle(all)
    const first = nights[0]
    const city = input.cities.find((c) => c.slug === first.citySlug) ?? { slug: first.citySlug, name: first.cityName }
    const hook = `${name} this week.`
    const body = [...nights.slice(0, 4).map(pickLine), '', creditsOf(nights)]
    pieces.push({
      kind: 'venue_spotlight',
      city: city.slug,
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: `Show what is on at ${name} this week`,
      nextStep: `See every night in ${city.name} at ${site}/city/${city.slug}`,
      outcome: outcomeOf(`/city/${city.slug}`),
      link: `${origin}/city/${city.slug}`,
      format: 'feed',
      eventIds: nights.slice(0, 4).map((n) => n.eventId),
      picks: nights.slice(0, 4).map((n) => ({ eventId: n.eventId, reason: `Picked: one of ${all.length} nights at ${name} this week, the most of any host.` })),
      mode: modeOf(nights.slice(0, 4)),
      // Family E in the 9.5 locked look (the PM's 17:10 of 15 November 2026): one slide, the venue's week.
      slides: [venueSlideOf(name, nights.slice(0, 4), origin, weekPick)],
      caption: join([hook, '', ...body, '', `Every night in ${city.name}: ${site}/city/${city.slug}`, '', tagsFor(city, null)]),
      versions: versionsOf(hook, body, `${origin}/city/${city.slug}`, `Every night in ${city.name} is at the link in our bio.`, `Every night in ${city.name}:`, '4:5', tagsFor(city, null)),
      partnerName: null,
      partnerEventId: null,
      message: null,
    })
    feature(nights.slice(0, 4))
  }

  /* The organiser campaign: its own asset, for organisers, advertising no night (J11), to /organisers. */
  if (inWeek.length > 0) {
    const hook = 'Run regular nights in Victoria?'
    const body = [
      'List them on EventLinqs for free.',
      'We put them in front of people looking for something to do this week.',
      'When we feature your night, we send you a post of your own to share, with a link that counts who it sends.',
    ]
    pieces.push({
      kind: 'organiser_campaign',
      city: 'victoria',
      audience: 'organisers',
      objective: 'organiser_growth',
      purpose: 'Bring organisers and venues to list their nights on EventLinqs',
      nextStep: `List your nights at ${site}/organisers`,
      outcome: 'Organiser enquiries and listings started through this post\'s own link',
      link: `${origin}/organisers`,
      format: 'feed',
      eventIds: [],
      picks: [],
      mode: 'graphic_led',
      slides: [{ t: 'offer', composition: 'organiser_campaign', eyebrow: 'For venues and organisers', headline: hook, points: body, url: `${site}/organisers` }],
      caption: join([hook, '', ...body, '', `${site}/organisers`]),
      versions: versionsOf(hook, body, `${origin}/organisers`, 'The link to list is in our bio.', 'List your nights:', '4:5', '#victoriaevents'),
      partnerName: null,
      partnerEventId: null,
      message: null,
    })
  }

  /* The weekend brand piece (the approved "Say yes to this weekend"): names no night, so no photograph on it can be
     taken for one; to the browse page, every night in one place. */
  if (inWeek.length > 0) {
    const hook = 'Say yes to this weekend.'
    const line = `Gigs, festivals, markets and free nights across ${input.cities.map((c) => c.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}, in one place.`
    const photo = input.brandPhoto ?? null
    const brandCredit = photo ? creditLine(photo.credit) : null
    const body = [line, ...(brandCredit ? ['', brandCredit] : [])]
    pieces.push({
      kind: 'brand_campaign',
      city: 'victoria',
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: 'Bring people to EventLinqs to find their weekend',
      nextStep: `See what's on at ${site}/events`,
      outcome: outcomeOf('/events'),
      link: `${origin}/events`,
      format: 'feed',
      eventIds: [],
      picks: [],
      mode: photo ? 'photo_led' : 'graphic_led',
      slides: [{ t: 'brand', composition: 'close', headline: hook, line, action: "See what's on", photo: photo?.url ?? null, credit: photo?.credit ?? null }],
      caption: join([hook, '', ...body, '', `${site}/events`]),
      versions: versionsOf(hook, body, `${origin}/events`, "What's on is at the link in our bio.", "What's on:", '4:5', '#victoriaevents'),
      partnerName: null,
      partnerEventId: null,
      message: null,
    })
  }

  /* Partner kits: every organiser and venue featured, a 9:16 story for their own account and the message that ASKS
     (never assumes a Collab: J14). */
  for (const [name, n] of [...featured.entries()].slice(0, MAX_PARTNERS)) {
    const city = input.cities.find((c) => c.slug === n.citySlug) ?? { slug: n.citySlug, name: n.cityName }
    const hook = `${n.title}, featured on EventLinqs this week.`
    const body = [`${whenOf(n)}, ${metaOf(n)}.${n.priceLine ? ` ${n.priceLine}.` : ''}`]
    pieces.push({
      kind: 'partner_kit',
      city: city.slug,
      audience: 'partners',
      objective: 'audience_growth',
      purpose: `Ask ${name} whether they would share their night from their own account`,
      nextStep: `Send ${name} their story card and their own link`,
      outcome: `Visits through ${name}'s own link`,
      link: `${origin}/events/${n.slug}`,
      format: 'story',
      eventIds: [n.eventId],
      picks: [{ eventId: n.eventId, reason: `Picked: ${name} is featured in this week's campaign.` }],
      mode: modeOf([n]),
      slides: [{ t: 'story', composition: compositionFor(n), eventId: n.eventId, chip: 'Featured on EventLinqs', when: [whenOf(n), n.priceLine].filter(Boolean).join(' · '), title: n.title, meta: metaOf(n), photo: n.approvedPhotoUrl, credit: n.approvedPhotoUrl ? n.photoCredit : null, sticker: "Link sticker here: this night's own link on EventLinqs", words: nightWords(n), line: whyOf(n) }],
      caption: join([hook, '', ...body]),
      versions: versionsOf(hook, body, `${origin}/events/${n.slug}`, 'Link sticker: this night on EventLinqs.', 'The night:', '9:16', ''),
      partnerName: name,
      partnerEventId: n.eventId,
      /* Lawal's 14:59: no organiser message is drafted or stored until the project manager's text in his own voice lands. */
      message: null,
    })
  }

  /* J5, held by Lawal's 14:59: the nights shown with no usable image, so their organisers can be asked; the words wait
     for the project manager's text in his own voice, and nothing is drafted here. */
  const imageRequests: ImageRequest[] = []
  for (const n of shown.values()) {
    if (n.approvedPhotoUrl || !n.host) continue
    imageRequests.push({ eventId: n.eventId, hostName: n.host })
  }

  /* Two posts, one list (the PM's 15:45 of 15 November 2026, fix 3): a later piece with a cover whose list is an earlier
     cover piece's own, in the same city and format, drops itself, so no two posts in a week show the same nights. */
  const seenLists = new Set<string>()
  for (let i = 0; i < pieces.length; i++) {
    if (!pieces[i].slides.some((s) => s.t === 'cover')) continue
    const key = `${pieces[i].city}|${pieces[i].format}|${[...pieces[i].eventIds].sort().join(',')}`
    if (seenLists.has(key)) {
      pieces.splice(i, 1)
      i -= 1
    } else seenLists.add(key)
  }

  /* The names each piece quotes exactly: its nights' own titles and hosts, and its partner's (pieceRefusal). */
  const byId = new Map(nightsIn.map((n) => [n.eventId, n]))
  for (const p of pieces) {
    const nights = p.eventIds.flatMap((id) => {
      const n = byId.get(id)
      return n ? [n] : []
    })
    // A card quotes a night's name by rule (cardTitle, the PM's 17:40 fix 4): each of those is the organiser's own name too.
    const cardNames = (n: CampaignNight) => [CARD_TITLE_MAX, ASK_TITLE_MAX, DRAW_TITLE_MAX, 40].map((max) => cardTitle(n.title, max))
    p.names = [...new Set([...nights.flatMap((n) => [n.title, n.host ?? '', ...cardNames(n)]), p.partnerName ?? ''].filter((s) => s.trim() !== ''))]
  }

  return { pieces, imageRequests }
}

/* ------------------------------------------------------------------ K10: the creative QA every piece passes before approval */

/** Instagram's own caption limit, and the rule of at most three tags a post. */
const CAPTION_LIMIT: Record<'instagram' | 'facebook', number> = { instagram: 2200, facebook: 2200 }
const MAX_TAGS = 3

/**
 * The checks a piece's words pass before a person may approve it (K10, the ones window 3 can name until the direction's
 * section 13 lands; K12 deterministic): each platform version within its length, at most three tags, no exclamation
 * mark or long dash, a call to action in each, and the slides' places as their nights hold them.
 */
export function creativeRefusals(rev: { slides: Slide[]; versions: PiecePlan['versions'] }, nights: ReadonlyMap<string, { venueName: string | null; title: string }>): string[] {
  const issues: string[] = []
  for (const platform of ['instagram', 'facebook'] as const) {
    const v = rev.versions[platform]
    const name = platform === 'instagram' ? 'Instagram' : 'Facebook'
    if (!v?.caption?.trim()) {
      issues.push(`The ${name} words are empty.`)
      continue
    }
    if (v.caption.length > CAPTION_LIMIT[platform]) issues.push(`The ${name} words run to ${v.caption.length} characters, over ${CAPTION_LIMIT[platform]}.`)
    const tags = v.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []
    if (tags.length > MAX_TAGS) issues.push(`The ${name} words carry ${tags.length} tags, over ${MAX_TAGS}.`)
    if (/[!\u2013\u2014]/.test(v.caption)) issues.push(`The ${name} words carry an exclamation mark or a long dash.`)
    if (!v.cta?.trim()) issues.push(`The ${name} version has no call to action.`)
  }
  for (const s of rev.slides) {
    if (s.t !== 'night' && s.t !== 'story') continue
    const night = nights.get(s.eventId)
    if (!night) continue
    if (night.venueName && !s.meta.startsWith(night.venueName)) issues.push(`${s.title}: its place on the slide is not the night's venue, ${night.venueName}.`)
  }
  /* The locked look's cards: the place a card names is the night's venue (its venue row's own name, or the listing's). */
  const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '')
  for (const s of rev.slides) {
    if (s.t !== 'days') continue
    for (const r of s.rows) {
      const night = nights.get(r.eventId)
      if (!night?.venueName) continue
      const [a, b] = [squash(night.venueName), squash(r.place)]
      if (!a.includes(b) && !b.includes(a)) issues.push(`${r.title}: its place on the card is not the night's venue, ${night.venueName}.`)
    }
  }
  return issues
}
