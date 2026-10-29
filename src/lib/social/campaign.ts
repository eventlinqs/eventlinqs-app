import type { Cta } from '@/lib/events/cta'
import { isEventLinqsListing, isListingsOrganisation } from '@/lib/listings/shown-organiser'
import { carriesBannedWord } from './words'

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
export type PieceKind = 'week_ahead' | 'discovery_reel' | 'weekend_carousel' | 'venue_spotlight' | 'organiser_campaign' | 'partner_kit' | 'brand_campaign'

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
  /** The organisers' own names it quotes exactly (its nights' titles and hosts, its partner), set by planCampaign. */
  names?: string[]
}

/** A night to ask its organiser an image for (J5); the words wait for the project manager's text (Lawal, 14:59). */
export type ImageRequest = { eventId: string; hostName: string }

export type NightPick = { eventId: string; reason: string }

/** At most two nights of one venue and three of one category in a set of five (K6: no venue or category overload). */
const MAX_PER_VENUE = 2
const MAX_PER_CATEGORY = 3

/**
 * THE EDITORIAL SELECTION (K6): from the candidates, the nights a set carries and why each was picked. Scored on timing
 * (sooner first, a weekend night for a weekend guide), complete details (a venue, a line about it, a price or free
 * stated), media available (an approved image) and partner potential (a host with more than one night); free is
 * never scored down, and nothing is ever bought into a pick. No more than two of one venue or three of one category, so a set
 * is varied. The founder's leave-outs never come back.
 */
/** One night per title in a set: the key two nights share when they are the same night on two dates. */
const titleKey = (n: CampaignNight): string => n.title.trim().toLowerCase()

/** A night list with each title once, at its sooner date (the list is in date order). */
function oncePerTitle(nights: readonly CampaignNight[]): CampaignNight[] {
  const seen = new Set<string>()
  return nights.filter((n) => !seen.has(titleKey(n)) && Boolean(seen.add(titleKey(n))))
}

export function selectNights(candidates: readonly CampaignNight[], max: number): { nights: CampaignNight[]; picks: NightPick[] } {
  const hostCount = new Map<string, number>()
  for (const n of candidates) if (n.host) hostCount.set(n.host, (hostCount.get(n.host) ?? 0) + 1)
  const scored = candidates.map((n, order) => {
    const reasons: string[] = []
    let score = 100 - order * 2
    reasons.push(`on ${whenOf(n)}`)
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
    return { n, score, reasons }
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
    if (venue && (venues.get(venue) ?? 0) >= MAX_PER_VENUE) continue
    if (category && (categories.get(category) ?? 0) >= MAX_PER_CATEGORY) continue
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
const MAX_NIGHTS = 5
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

/** "SAT" */
export function dayOf(n: CampaignNight): string {
  return local(n.startDate, n.timezone, { weekday: 'short' }).toUpperCase()
}

/** The Melbourne day index of a night within the week starting weekStart: 0 Monday to 6 Sunday, or -1 outside it. */
export function dayInWeek(n: CampaignNight, weekStart: string): number {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(n.startDate))
  const diff = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / DAY_MS)
  return diff >= 0 && diff <= 6 ? diff : -1
}

/** The composition a night's slide takes, by its category and admission (the 14:08's list). */
/** The categories that are a performance on a stage, so a slide may say "Live at" the venue. */
const LIVE_CATEGORIES: readonly string[] = ['music', 'concert', 'concerts', 'gig', 'gigs', 'comedy', 'theatre', 'performing-arts']

export function compositionFor(n: Pick<CampaignNight, 'categorySlug' | 'cta'>): Composition {
  const c = (n.categorySlug ?? '').toLowerCase()
  if (['music', 'concert', 'concerts', 'gig', 'gigs', 'nightlife', 'comedy', 'theatre', 'performing-arts'].includes(c)) return 'concert'
  if (['festival', 'festivals', 'community', 'celebration', 'arts'].includes(c)) return 'festival'
  if (['family', 'kids', 'children'].includes(c)) return 'family'
  if (n.cta.state === 'free_open' || n.cta.state === 'free_registration') return 'free'
  return 'general'
}

function metaOf(n: CampaignNight): string {
  return n.venueName ? `${n.venueName}, ${n.cityName}` : n.cityName
}

function whyOf(n: CampaignNight): string | null {
  const s = (n.summary ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
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
  const live = LIVE_CATEGORIES.includes((n.categorySlug ?? '').toLowerCase()) ? 'Live at' : 'At'
  const entry =
    n.priceLine && /\$\s?\d/.test(n.priceLine)
      ? n.priceLine
      : n.cta.state === 'free_open'
        ? 'Free, no ticket needed'
        : n.cta.state === 'free_registration'
          ? 'Free, register first'
          : null
  return {
    eyebrow: n.venueName ? `${live} ${n.venueName}` : n.cityName,
    date: dateOf(n),
    time: time ? (span ? `From ${time}` : time) : '',
    entry,
    action: n.cta.action,
    city: n.cityName,
  }
}

function nightSlide(n: CampaignNight): Slide {
  return {
    words: nightWords(n),
    t: 'night',
    composition: compositionFor(n),
    eventId: n.eventId,
    chip: n.cta.chip,
    when: whenOf(n),
    day: dayOf(n),
    title: n.title,
    meta: metaOf(n),
    why: whyOf(n),
    photo: n.approvedPhotoUrl,
    credit: n.approvedPhotoUrl ? n.photoCredit : null,
  }
}

/** "3 are free, 2 need tickets." from the nights' own states; a night with no price is not counted as either. */
function splitLine(nights: readonly CampaignNight[]): string {
  const free = nights.filter((n) => n.cta.state === 'free_open' || n.cta.state === 'free_registration').length
  const paid = nights.filter((n) => n.cta.state === 'paid_native' || n.cta.state === 'paid_external').length
  const parts: string[] = []
  if (free > 0) parts.push(`${free === nights.length ? 'All' : free} ${free === 1 ? 'is' : 'are'} free`)
  if (paid > 0) parts.push(`${paid} ${paid === 1 ? 'needs' : 'need'} tickets`)
  return parts.length === 0 ? 'Times and places in each.' : `${parts.join(', ')}. Times and places in each.`
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five']
const countWord = (k: number): string => COUNT_WORDS[k] ?? String(k)

/** One line a pick: the place pin for a free night, the ticket for a paid one (the 13:27 (6), kept by the 13:53). */
function pickLine(n: CampaignNight): string {
  const mark = n.cta.state === 'paid_native' || n.cta.state === 'paid_external' ? '🎟' : '📍'
  const price = n.priceLine ? ` ${n.priceLine}.` : ''
  return `${mark} ${whenOf(n)}, ${n.title}, ${metaOf(n)}.${price}`
}

function tagsFor(city: CampaignCity, extra: string | null): string {
  return [`#${city.slug}`, `#${city.slug}events`, extra].filter(Boolean).slice(0, 3).join(' ')
}

function creditsOf(nights: readonly CampaignNight[]): string {
  const credits = [...new Set(nights.map((n) => (n.approvedPhotoUrl ? n.photoCredit : null)).filter((c): c is string => Boolean(c)))]
  return credits.length === 0 ? '' : credits.map((c) => `Photo: ${c}`).join('\n')
}

/**
 * The page a piece sends people to must list every night it advertises (J15): /free/<city>/this-week lists only free
 * nights, so a set with any other night goes to /city/<city>, which lists them all.
 */
export function destinationOf(nights: readonly CampaignNight[], city: CampaignCity): { path: string; allFree: boolean } {
  const allFree = nights.every((n) => n.cta.state === 'free_open' || n.cta.state === 'free_registration')
  return allFree ? { path: `/free/${city.slug}/this-week`, allFree } : { path: `/city/${city.slug}`, allFree }
}

function siteOf(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '')
}

/** A caption with no two blank lines in a row and nothing trailing. */
function join(lines: readonly string[]): string {
  return lines.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim()
}

/**
 * The Instagram and Facebook versions (J13). Instagram: the hook first, no link in a caption (it is not tappable), the
 * call to action points at the link in bio. Facebook: the same hook, the link written in full because it is tappable
 * and unfurls, at most one tag.
 */
function versionsOf(hook: string, body: readonly string[], link: string, igCta: string, fbCta: string, crop: '4:5' | '9:16', tags: string): PiecePlan['versions'] {
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
}): CampaignPlan {
  const { origin, weekStart } = input
  const site = siteOf(origin)
  const inWeek = input.nights
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

  for (const city of input.cities) {
    const week = inWeek.filter((x) => x.n.citySlug === city.slug).map((x) => x.n)
    /* Monday: the week ahead, to the city page. */
    const { nights: ahead, picks: aheadPicks } = selectNights(week, MAX_NIGHTS)
    if (ahead.length >= 2) {
      const hook = `${countWord(ahead.length)} things on in ${city.name} this week.`
      const body = [...ahead.map(pickLine), '', creditsOf(ahead)]
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
        slides: [
          { t: 'cover', composition: 'contents_cover', chip: `This week · ${city.name}`, headline: hook, line: splitLine(ahead), contents: ahead.map((n) => `${dayOf(n)} ${n.title}`) },
          ...ahead.map(nightSlide),
          { t: 'end', composition: 'close', headline: "Send this to whoever you're going with.", line: `Everything on in ${city.name} this week, by day, with times and places:`, url: `${site}/city/${city.slug}`, foot: 'Save this for later.' },
        ],
        caption: join([hook, '', ...body, '', `The whole week: ${site}/city/${city.slug}`, '', tagsFor(city, null)]),
        versions: versionsOf(hook, body, `${origin}/city/${city.slug}`, 'The whole week is at the link in our bio.', 'The whole week:', '4:5', tagsFor(city, null)),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(ahead)
    }

    /* Thursday: the weekend guide carousel, paired with the roundup edition, to the city's free week page. */
    const { nights: weekend, picks: weekendPicks } = selectNights(inWeek.filter((x) => x.n.citySlug === city.slug && x.day >= 4).map((x) => x.n), MAX_NIGHTS)
    if (weekend.length >= 2) {
      const wDest = destinationOf(weekend, city)
      const hook = `${countWord(weekend.length)} things on in ${city.name} this weekend.`
      const body = [...weekend.map(pickLine), '', creditsOf(weekend)]
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
        slides: [
          { t: 'cover', composition: 'contents_cover', chip: `This weekend · ${city.name}`, headline: hook, line: splitLine(weekend), contents: weekend.map((n) => `${dayOf(n)} ${n.title}`) },
          ...weekend.map(nightSlide),
          { t: 'end', composition: 'close', headline: 'Plan the weekend.', line: wDest.allFree ? `Every free thing on in ${city.name} this week, by day, with times and maps:` : `Everything on in ${city.name} this week, by day, with times and places:`, url: `${site}${wDest.path}`, foot: 'Save this for Saturday.' },
        ],
        caption: join([hook, '', ...body, '', `${wDest.allFree ? 'Every free thing this week' : 'The whole week'}: ${site}${wDest.path}`, '', tagsFor(city, '#thisweekend')]),
        versions: versionsOf(hook, body, `${origin}${wDest.path}`, wDest.allFree ? 'Every free thing this week is at the link in our bio.' : 'The whole week is at the link in our bio.', wDest.allFree ? 'Every free thing this week:' : 'The whole week:', '4:5', tagsFor(city, '#thisweekend')),
        partnerName: null,
        partnerEventId: null,
        message: null,
      })
      feature(weekend)
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
    const body = [...reel.map(pickLine), '', creditsOf(reel)]
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
      slides: [
        { t: 'cover', composition: 'contents_cover', chip: `${city.name} · this week`, headline: hook, line: splitLine(reel), contents: reel.map((n) => `${dayOf(n)} ${n.title}`) },
        ...reel.map(nightSlide),
        { t: 'end', composition: 'close', headline: 'Which one are you going to?', line: `Tell us below, and send this to whoever's coming. The whole week in ${city.name}:`, url: `${site}${rDest.path}`, foot: null },
      ],
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
  for (const { n } of inWeek) if (n.host) hosts.set(n.host, [...(hosts.get(n.host) ?? []), n])
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
      slides: [
        { ...(nightSlide(first) as Extract<Slide, { t: 'night' }>), composition: 'venue_spotlight' },
        { t: 'programme', composition: 'venue_spotlight', heading: `This week at ${name}`, address: first.venueName ? `${first.venueName}, ${city.name}` : city.name, rows: nights.slice(0, 4).map((n) => ({ day: dayOf(n), title: n.title, meta: [whenOf(n).split(' · ')[1], n.priceLine].filter(Boolean).join(' · ') })) },
      ],
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
    const body = [line, ...(photo ? ['', `Photo: ${photo.credit}`] : [])]
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

  /* The names each piece quotes exactly: its nights' own titles and hosts, and its partner's (pieceRefusal). */
  const byId = new Map(input.nights.map((n) => [n.eventId, n]))
  for (const p of pieces) {
    const nights = p.eventIds.map((id) => byId.get(id)).filter((n): n is CampaignNight => n !== undefined)
    p.names = [...new Set([...nights.flatMap((n) => [n.title, n.host ?? '']), p.partnerName ?? ''].filter((s) => s.trim() !== ''))]
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
  return issues
}
