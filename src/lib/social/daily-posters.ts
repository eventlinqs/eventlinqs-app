/**
 * WHICH NIGHT EACH DAY'S POSTER IS (family F, the daily poster; the directive's pipeline steps 1 and 2:
 * C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-DIRECTIVE-30OCT.md). One night per city per day, from the week's verified
 * nights, by the planner's own editorial ranking (selectNights), with variety: a host on yesterday's poster is passed
 * over when the day holds another. Each pick says why it was picked and how its image was decided (the rights gate:
 * photo-led only from an approved register row, else type-led), and both are kept on the piece.
 *
 * PURE: the same week gives the same posters, so a second press of Plan this week finds them made.
 */
import { creditsOf, dayInWeek, join, KIND_EMOJI, nightKind, postTitle, selectNights, siteOf, standardTags, tagsFor, tagWord, whyOf, type CampaignCity, type CampaignNight, type NightKind, type PiecePlan, type PosterFacts, type Slide } from './campaign'

const DAY_MS = 86_400_000

export type PosterPick = {
  city: string
  /** The day the poster is for, YYYY-MM-DD in Melbourne's calendar. */
  day: string
  eventId: string
  /** Why this night, said plainly (K6). */
  reason: string
  /** The rights gate's answer, and its reason (the directive's correction 1). */
  rights: 'photo' | 'type'
  rightsReason: string
}

export function planDailyPosters(input: { nights: readonly CampaignNight[]; cities: readonly CampaignCity[]; weekStart: string; excluded?: ReadonlySet<string> }): PosterPick[] {
  const picks: PosterPick[] = []
  for (const city of input.cities) {
    const week = input.nights.filter((n) => n.citySlug === city.slug && !(input.excluded?.has(n.eventId) ?? false))
    let yesterdayHost: string | null = null
    const postered = new Set<string>()
    for (let d = 0; d < 7; d++) {
      // One poster per event over several days (the PM's 03:10, class 7): a title already postered this week is not again.
      const today = week
        .filter((n) => dayInWeek(n, input.weekStart) === d && !postered.has(n.title.toLowerCase()))
        .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
      if (today.length === 0) {
        yesterdayHost = null
        continue
      }
      const fresh = today.filter((n) => !yesterdayHost || n.host !== yesterdayHost)
      const pool = fresh.length > 0 ? fresh : today
      const { nights, picks: why } = selectNights(pool, 1)
      const n = nights[0]
      if (!n) continue
      const passedOver = fresh.length < today.length && fresh.length > 0
      picks.push({
        city: city.slug,
        day: new Date(Date.parse(`${input.weekStart}T00:00:00Z`) + d * DAY_MS).toISOString().slice(0, 10),
        eventId: n.eventId,
        reason: `${why[0]?.reason ?? 'Picked.'}${passedOver ? ` ${yesterdayHost} was on yesterday's poster, so another host leads today.` : ''}`,
        rights: n.approvedPhotoUrl ? 'photo' : 'type',
        rightsReason: n.approvedPhotoUrl
          ? `Photo-led: an approved register row for this night (${n.photoCredit ?? 'its owner'}).`
          : 'Type-led: no approved photograph for this night on the register.',
      })
      yesterdayHost = n.host
      postered.add(n.title.toLowerCase())
    }
  }
  return picks
}

/**
 * The week's daily posters as pieces the store keeps and a person approves one by one (the directive's pipeline steps
 * 1 to 5). Each is one night: a feed poster (with its square) for attendees, sent to the night's own page through its
 * own /e/ link, which the store mints and writes onto the slide before it is kept. Nothing posts by itself.
 */
/**
 * THE DAILY POSTERS WAIT OUTSIDE THE WEEK'S PLAN (the PM's 20:40 of 15 November 2026, fix 6): they are still drawn in
 * the old planner look (a seller's pill, a raw street address, a calendar block), so the weekly plan leaves them out, and
 * with it the publishing queue, until they are in the 9.5 locked look. Turned back on here, never deleted (law 13).
 */
// Lawal's A (18 November 2026, 00:12): 'Allow professionally designed EventLinqs posters and stories without photographs'.
export const DAILY_POSTERS_IN_PLAN = true

/**
 * A DAILY POSTER'S CAPTION, NATURAL AND OF ITS OWN KIND (Lawal, 18 November 2026, 00:12 and 00:17): his Kate Ceberano
 * caption is the quality reference, never a template. An emoji led hook phrased for the night's kind, one line of
 * experience (the night's own words, or its kind's), then place (the city never twice), date and time, then tickets and our
 * hashtags. No exclamation mark and no long dash (the copy law). Pure.
 */
/** The part of the day a night starts in, where it is held: a daytime event is never a 'night' (the PM's 03:10, class 1). */
export function partOfDay(iso: string, tz: string | null): 'morning' | 'afternoon' | 'night' {
  const h = Number(new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)))
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night'
}

type Part = ReturnType<typeof partOfDay>

/**
 * A POST ON ITS NIGHT'S OWN DAY SAYS SO (the PM's 06:39 of 18 November 2026, item 1: Fine Lines and Wine, to post on
 * Wednesday 18 November at 9 am for 6 pm that day, read 'Coming up in Geelong.'). A poster is drawn before its slot is
 * known, and a feed piece may go on any day up to its night's start (cadence.ts windowOf), so the line is set at the
 * moment it posts: on the night's own day it reads 'Tonight', 'Today' or 'This afternoon' by the night's local start
 * (partOfDay), and 'Coming up' stays only for a later day. Only that exact line changes. The publisher posts every caption
 * through this (store.ts publishDuePieces), and the pack shows each caption through it at its slot. Pure.
 */
export function onItsDay(caption: string, slides: readonly Slide[], at: Date): string {
  const poster = slides.find((s) => s.t === 'poster')
  if (!poster || poster.t !== 'poster') return caption
  const night = poster.night
  const day = (when: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: night.timezone ?? 'Australia/Melbourne' }).format(new Date(when))
  if (day(at) !== day(night.startDate)) return caption
  const part = partOfDay(night.startDate, night.timezone ?? null)
  const word = part === 'morning' ? 'Today' : part === 'afternoon' ? 'This afternoon' : 'Tonight'
  return caption
    .split('\n')
    .map((line) => (line === `Coming up in ${night.cityName}.` ? `${word} in ${night.cityName}.` : line === 'Coming up.' ? `${word}.` : line))
    .join('\n')
}
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
const EMOJI = KIND_EMOJI
/** The kind of event, on the line under its title (class 3), in words true of its time of day (class 1); `at` is ' in <city>', or nothing where the title holds the city (class 4). */
const KIND: Record<NightKind | 'other', (p: Part, at: string) => string> = {
  gig: (_p, at) => `Live music${at}.`,
  jazz: (p, at) => {
    const w = p === 'night' ? 'evening' : p
    return `${an(w)} ${w} of jazz${at}.`
  },
  classical: (_p, at) => `In concert${at}.`,
  dance: (p, at) => `${an(p)} ${p} of dance${at}.`,
  festival: (_p, at) => `A festival${at}.`,
  comedy: (_p, at) => `Stand-up comedy${at}.`,
  theatre: (_p, at) => `On stage${at}.`,
  talk: (_p, at) => `In conversation${at}.`,
  family: (_p, at) => `A family day out${at}.`,
  sport: (_p, at) => `Game day${at}.`,
  market: (p, at) => `A market ${p}${at}.`,
  christmas: (_p, at) => `Christmas${at}.`,
  other: (_p, at) => `Coming up${at}.`,
}
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * THE KIND SAID TWICE, THE WHOLE CLASS (the PM's 06:39 of 18 November 2026, item 2): Showtime Bendigo read 'An afternoon
 * of dance in Bendigo.' then 'A dance performance at Ulumbarra Theatre.', and two Play House nights 'A performance at The
 * Play House.'. A night's own line stays only where it adds something beyond its kind (the words the kind line says), its
 * venue and its city (the pin line's), and the words every such line is made of.
 */
const KIND_SAYS: Record<NightKind | 'other', readonly string[]> = {
  gig: ['live', 'music', 'gig', 'gigs', 'concert'],
  jazz: ['jazz', 'live', 'music'],
  classical: ['concert', 'classical', 'music', 'live'],
  dance: ['dance', 'dancing'],
  festival: ['festival'],
  comedy: ['comedy', 'stand-up', 'standup', 'comedian'],
  theatre: ['stage', 'theatre', 'theater', 'show', 'play'],
  talk: ['talk', 'conversation'],
  family: ['family', 'day', 'out'],
  sport: ['game', 'match', 'day'],
  market: ['market', 'markets'],
  christmas: ['christmas'],
  other: [],
}
const FILLER = new Set(['a', 'an', 'the', 'at', 'in', 'on', 'of', 'performance', 'performances', 'event', 'events', 'night', 'evening', 'afternoon', 'morning', 'session'])
function addsNothing(line: string, kind: NightKind | 'other', venue: string | null, city: string): boolean {
  let rest = line.toLowerCase()
  for (const place of [venue, city]) if (place) rest = rest.split(place.toLowerCase()).join(' ')
  const words = rest.split(/[^a-z0-9-]+/).filter(Boolean)
  return words.every((w) => FILLER.has(w) || KIND_SAYS[kind].includes(w))
}
const holds = (text: string, place: string) => new RegExp(`\\b${esc(place)}\\b`, 'i').test(text)

function partsOf(iso: string, tz: string | null): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>
}
const timeOf = (parts: Record<string, string>) =>
  // A time with a full stop, as the approved samples write it ('7.30 pm'; caption standard version 2).
  (parts.minute === '00' ? `${parts.hour} ${String(parts.dayPeriod ?? '').toLowerCase()}` : `${parts.hour}.${parts.minute} ${String(parts.dayPeriod ?? '').toLowerCase()}`).trim()

/**
 * The date line: one day ('Thursday 19 November · 6.30 pm'), or the days of an event that runs over several, from its own
 * sessions ('Friday 20 to Sunday 22 November · 9 am'; class 7); the time where every session starts at it.
 */
function dateLine(n: CampaignNight, sessions: readonly CampaignNight[]): string {
  // A run is consecutive days only (the pack of 18 November 2026, 05:43: a weekly show read 'Thursday 19 to Thursday 26
  // November'): from this night, each next session on the next day; a session a week on is another night, never the run.
  const dayKey = (x: CampaignNight) => Date.parse(`${new Intl.DateTimeFormat('en-CA', { timeZone: x.timezone ?? 'Australia/Melbourne' }).format(new Date(x.startDate))}T00:00:00Z`)
  const others = sessions.filter((x) => x.eventId !== n.eventId).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const all = [n]
  for (const x of others) {
    const gap = (dayKey(x) - dayKey(all[all.length - 1])) / 86_400_000
    if (gap === 1) all.push(x)
    else if (gap > 1) break
  }
  const first = partsOf(all[0].startDate, all[0].timezone ?? null)
  const last = partsOf(all[all.length - 1].startDate, all[all.length - 1].timezone ?? null)
  const sameTime = all.every((x) => timeOf(partsOf(x.startDate, x.timezone ?? null)) === timeOf(first))
  if (all.length === 1 || (first.day === last.day && first.month === last.month)) return `${first.weekday} ${first.day} ${first.month} \u00b7 ${timeOf(partsOf(n.startDate, n.timezone ?? null))}`
  const days = first.month === last.month ? `${first.weekday} ${first.day} to ${last.weekday} ${last.day} ${last.month}` : `${first.weekday} ${first.day} ${first.month} to ${last.weekday} ${last.day} ${last.month}`
  return sameTime ? `${days} \u00b7 ${timeOf(first)}` : days
}

export type CaptionOptions = { readonly platform: 'instagram' | 'facebook'; readonly link: string; readonly sessions?: readonly CampaignNight[] }

/**
 * THE ONE CAPTION A NIGHT POSTS WITH, CAPTION STANDARD VERSION 2 (C:/dev/GROWTH/CAPTION-STANDARD-18NOV.md; Lawal's Kate
 * Ceberano caption of 18 November 2026, 00:12, as the base; his 20:44 approval for every new caption; the PM's 20:45 rules):
 *   1. THE HOOK: the night's kind's emoji, then who or what, and where, in a shape of its own kind (two nights of different
 *      kinds never share one); at most one exclamation mark, there only;
 *   2. ONE LINE ON THE EXPERIENCE: the night's own words; where it has none, its tour as Lawal wrote his ('Experience
 *      the Australian Made Tour at Her Majesty's Theatre this Thursday, 19 November, at 7 pm.'), or its kind;
 *   3. THE SIGNPOSTS, one emoji each: the place (the city once in a line), the date and time, the price or free entry;
 *   4. THE LINK LINE, led by its own emoji: on Instagram the link in our bio, on Facebook the event page itself;
 *   5. A SHARE LINE of its kind, with no emoji, where the price is shown (the third sample carries both; Lawal's own
 *      caption, with no price, carries neither);
 *   6. HASHTAGS LAST, on both platforms: the city's events, the night, #EventLinqs.
 * No blank lines, a time with a full stop ('7.30 pm'), as the golden cases stand (tests/unit/social/caption-golden.test.ts,
 * the PM's 21:40). At most five emoji, never two in a row, never inside a name or a title. It IS each platform's posted
 * version (store.ts publishDuePieces posts rev.versions[platform].caption). No long dash. Pure.
 */
export function posterCaption(n: CampaignNight, city: CampaignCity, site: string, opts: CaptionOptions = { platform: 'instagram', link: `https://www.${site}/events/${n.slug}` }): string {
  const kind = nightKind(n) ?? 'other'
  const part = partOfDay(n.startDate, n.timezone ?? null)
  // No emoji inside a name or a title, and the only exclamation mark is the hook's own (the standard's limits).
  const title = plainWords(postTitle(n.title, n.venueName))
  const [who, second] = splitTitle(title)
  const inCity = holds(title, city.name) ? '' : ` in ${city.name}`
  const toCity = holds(title, city.name) ? '' : ` to ${city.name}`
  const own = whyOf(n)
  // One place name per night (class 4): '... at Archive Wine Bar, Belmont.' keeps the venue and leaves the city to the place line.
  const why = own && n.venueName ? own.replace(new RegExp(`${esc(n.venueName)},\\s*[A-Z][A-Za-z' ]+(?=[.;]|$)`), n.venueName) : own
  const words = why && !addsNothing(why, kind, n.venueName, city.name) ? plainWords(why).replace(/!+/g, '.') : null
  // The kind said in words ('A night of dance.'); a night of no known kind has none, and then no line is invented.
  const kindLine = kind === 'other' ? null : KIND[kind](part, '')
  // A title's second part is what is experienced, unless it names who presents it ('Showtime: The Entertainers Performing
  // Arts Studio'). A tour, a show or a season is said as Lawal said his: its year left off ('the Australian Made Tour').
  const named = second && !/\b(studio|academy|school|company|ensemble|presents?)\b/i.test(second) ? second : null
  const tour = named && /\b(tour|show|season)\b/i.test(named) ? named.replace(/\s+(?:19|20)\d{2}$/, '') : null
  const tourName = tour ? `${/^the\b/i.test(tour) ? '' : 'the '}${tour}` : null
  const parts = partsOf(n.startDate, n.timezone ?? null)
  const experience = words
    ? words
    : tourName
      ? `Experience ${tourName}${n.venueName ? ` at ${n.venueName}` : ''} this ${parts.weekday}, ${parts.day} ${parts.month}, at ${timeOf(parts)}.`
      : named
        ? kindLine
          ? `${named}, ${kindLine.charAt(0).toLowerCase()}${kindLine.slice(1)}`
          : `${named}.`
        : kindLine
  // A tour with words of its own takes the tour into the hook, and its words under it (caption standard version 2's third
  // sample: 'Kim Wilde is bringing her Closer Tour to Geelong!'; never a pronoun guessed from a name, so 'the').
  const hook = words && tourName && kind === 'gig' ? `${who} is bringing ${tourName}${toCity}!` : HOOK[kind](who, inCity, toCity, part)
  const place = n.venueName ? (holds(n.venueName, city.name) ? n.venueName : `${n.venueName}, ${city.name}`) : city.name
  const free = n.cta.state === 'free_open' || n.cta.state === 'free_registration'
  const price = free
    ? n.cta.state === 'free_registration' ? 'Free, with registration' : 'Free entry'
    : n.priceLine && /\$\s?\d/.test(n.priceLine) ? `Tickets ${n.priceLine.charAt(0).toLowerCase()}${n.priceLine.slice(1)}` : null
  const lead = free ? 'Event details' : 'Event details and tickets'
  const credits = creditsOf([n])
  return join([
    `${EMOJI[kind]} ${who.includes('!') ? hook.replace(/!$/, '.') : hook}`,
    ...(experience ? [experience] : []),
    `\u{1F4CD} ${place}`,
    `\u{1F4C5} ${dateLine(n, opts.sessions ?? [])}`,
    ...(price ? [`\u{1F4B2} ${price}`] : []),
    ...(opts.platform === 'instagram' ? [`\u{1F39F} ${lead}: link in our bio`] : [`\u{1F39F} ${lead}:`, opts.link]),
    // The share line where the price is shown, as the third sample; Lawal's own caption, with no price, carries none.
    ...(price ? [SHARE[kind]] : []),
    // A third party photograph shows its credit (law 17 (d)): creditsOf says one only where the night's own photo is used.
    ...(credits ? [credits] : []),
    posterTags(city, who),
  ])
}

/** A name or a line with no emoji in it: the caption's five are its own signposts, never a source's. */
function plainWords(text: string): string {
  return text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/\s{2,}/g, ' ').trim()
}

/** A title's first part (who or what) and its second (the tour or show), split at its first colon: 'Kate Ceberano: Australian Made Tour 2026'. */
function splitTitle(title: string): [string, string | null] {
  const at = title.indexOf(': ')
  return at > 0 ? [title.slice(0, at).trim(), title.slice(at + 2).trim() || null] : [title, null]
}

/** THE HOOK, of the night's own kind (two kinds never share a shape); `inCity` and `toCity` are empty where the title holds the city. */
const HOOK: Record<NightKind | 'other', (who: string, inCity: string, toCity: string, p: Part) => string> = {
  gig: (who, _i, to) => `${who} is coming${to}!`,
  jazz: (who, inCity, _t, p) => `${who}: ${an(p === 'night' ? 'evening' : p).toLowerCase()} ${p === 'night' ? 'evening' : p} of jazz${inCity}.`,
  classical: (who, inCity) => `${who}, in concert${inCity}.`,
  dance: (who, inCity) => `${who} takes the stage${inCity}.`,
  festival: (who, inCity) => `${who} is on${inCity}!`,
  comedy: (who, _i, to) => `${who} brings the laughs${to}!`,
  theatre: (who, inCity) => `${who}, on stage${inCity}.`,
  talk: (who, inCity) => `${who}, in conversation${inCity}.`,
  family: (who, inCity) => `A family day out${inCity}: ${who}.`,
  sport: (who, inCity) => `Game day${inCity}: ${who}.`,
  market: (who, inCity) => `${who}, a market${inCity}.`,
  christmas: (who, inCity) => `Christmas${inCity}: ${who}.`,
  other: (who, inCity) => `${who}${inCity}.`,
}

/** THE SHARE LINE, of the night's own kind; never an emoji (the five are the hook and the four signposts). */
const SHARE: Record<NightKind | 'other', string> = {
  gig: 'Bring the friend who knows every word.',
  jazz: 'Bring someone who loves a late set.',
  classical: 'Bring someone who loves a live concert.',
  dance: 'Send this to someone who would love it.',
  festival: 'Tag who you are going with.',
  comedy: 'Tag the friend who needs a laugh.',
  theatre: 'Send this to your theatre friend.',
  talk: 'Send this to someone who would want to hear it.',
  family: 'Send this to the family.',
  sport: 'Tag who you are going with.',
  market: 'Send this to who you would go with.',
  christmas: 'Send this to the family.',
  other: 'Send this to who you would go with.',
}

/** HASHTAGS LAST (Lawal's model: '#BallaratEvents #KateCeberano #EventLinqs'): campaign.ts standardTags, the one rule. */
export function posterTags(city: CampaignCity, who: string): string {
  return standardTags(city, tagWord(who))
}

/** Both platforms' posted versions of a night's caption, in the piece's own crop. */
export function nightVersions(n: CampaignNight, city: CampaignCity, origin: string, crop: '4:5' | '9:16', sessions: readonly CampaignNight[] = []): PiecePlan['versions'] {
  const site = siteOf(origin)
  const link = `${origin}/events/${n.slug}`
  const instagram = posterCaption(n, city, site, { platform: 'instagram', link, sessions })
  const facebook = posterCaption(n, city, site, { platform: 'facebook', link, sessions })
  const hook = instagram.split('\n')[0]
  return {
    instagram: { hook, caption: instagram, crop, cta: 'link in our bio' },
    facebook: { hook, caption: facebook, crop, cta: link },
  }
}

/**
 * A PARTNER KIT'S CAPTION IS OF ITS KIND (the PM's 03:10, class 8: 'X, featured on EventLinqs this week.' was too thin): the
 * one poster caption for its night, on both platforms, in the kit's own story crop. Applied where the week's pieces are
 * put together (store.ts planNow), so drawing and the hourly redraw read the same words.
 */
export function withKitCaptions(pieces: readonly PiecePlan[], nights: readonly CampaignNight[], cities: readonly CampaignCity[], origin: string): PiecePlan[] {
  const byId = new Map(nights.map((n) => [n.eventId, { ...n, title: postTitle(n.title, n.venueName) }]))
  return pieces.map((p) => {
    if (p.kind !== 'partner_kit') return p
    const n = byId.get(p.eventIds[0] ?? '')
    const city = cities.find((c) => c.slug === p.city)
    if (!n || !city) return p
    const versions = nightVersions(n, city, origin, p.versions.instagram.crop)
    return { ...p, caption: versions.instagram.caption, versions }
  })
}

export function dailyPosterPieces(given: { nights: readonly CampaignNight[]; cities: readonly CampaignCity[]; weekStart: string; origin: string; excluded?: ReadonlySet<string> }): PiecePlan[] {
  // A post's title, never a source's raw one (the PM's 15:45 of 15 November 2026, fix 2; campaign.ts postTitle).
  const input = { ...given, nights: given.nights.map((n) => ({ ...n, title: postTitle(n.title, n.venueName) })) }
  const site = siteOf(input.origin)
  const byId = new Map(input.nights.map((n) => [n.eventId, n]))
  const pieces: PiecePlan[] = []
  for (const pick of planDailyPosters(input)) {
    const n = byId.get(pick.eventId)
    const city = input.cities.find((c) => c.slug === pick.city)
    if (!n || !city) continue
    const photo = pick.rights === 'photo' ? n.approvedPhotoUrl : null
    // Its sessions this week (one poster names the days of a run, class 7), and both posted versions from the one caption.
    const sessions = input.nights.filter((x) => x.citySlug === n.citySlug && x.title.toLowerCase() === n.title.toLowerCase() && dayInWeek(x, input.weekStart) >= 0)
    const versions = nightVersions(n, city, input.origin, '4:5', sessions)
    const page = `${input.origin}/events/${n.slug}`
    pieces.push({
      kind: 'daily_poster',
      city: city.slug,
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: `One night in ${city.name}: ${n.title}`.slice(0, 200),
      nextStep: `Open ${n.title} on ${site}`.slice(0, 200),
      outcome: "Taps through this poster's own link, then presses out and claims from there",
      link: page,
      format: 'feed',
      eventIds: [n.eventId],
      picks: [{ eventId: n.eventId, reason: `${pick.reason} ${pick.rightsReason}` }],
      mode: photo ? 'photo_led' : 'type_led',
      slides: [
        {
          t: 'poster',
          composition: 'daily_poster',
          eventId: n.eventId,
          photo,
          credit: photo ? n.photoCredit : null,
          rights: pick.rightsReason,
          night: {
            title: n.title,
            startDate: n.startDate,
            endDate: n.endDate ?? null,
            timezone: n.timezone,
            cityName: city.name,
            venueName: n.venueName,
            venueAddress: n.venueAddress ?? null,
            cta: n.cta,
            priceLine: n.priceLine,
            isAgeRestricted: n.isAgeRestricted ?? false,
            ageMin: n.ageMin ?? null,
            shortLink: null,
          },
        },
      ],
      caption: versions.instagram.caption,
      versions,
      partnerName: null,
      partnerEventId: null,
      message: null,
      posterDay: pick.day,
      names: [...new Set([n.title, n.host ?? ''].filter((s) => s.trim() !== ''))],
    })
  }
  return pieces
}

/** The night as it is read again at approval: the columns a poster prints from. */
export type NightNow = {
  title: string
  start_date: string
  end_date: string
  status: string
  visibility: string
  venue_name: string | null
  venue_address: string | null
  is_age_restricted: boolean | null
  age_restriction_min: number | null
}

/**
 * What has changed since a daily poster was made, said for the founder (J15: facts are re-checked at approval). Every
 * fact the poster prints is read again from the night; an admission that moved means its chips, and any FREE badge,
 * would no longer be true. Empty when the poster still says only what is true.
 */
export function posterDrift(facts: PosterFacts, e: NightNow, admission: { state: string; priceLine: string | null }, now: Date): string[] {
  const name = facts.title
  const issues: string[] = []
  if (e.status !== 'published' || e.visibility !== 'public') issues.push(`${name}: it is no longer published and public.`)
  if (Date.parse(e.end_date) <= now.getTime()) issues.push(`${name}: it has ended.`)
  if (e.title !== facts.title) issues.push(`${name}: its title is now "${e.title}".`)
  if (Date.parse(e.start_date) !== Date.parse(facts.startDate)) issues.push(`${name}: its date or time has changed.`)
  if ((e.venue_name ?? null) !== (facts.venueName ?? null) || (e.venue_address ?? null) !== (facts.venueAddress ?? null)) issues.push(`${name}: its venue or street has changed.`)
  if ((e.is_age_restricted === true) !== facts.isAgeRestricted || (e.age_restriction_min ?? null) !== (facts.ageMin ?? null)) issues.push(`${name}: its age restriction has changed.`)
  if (admission.state !== facts.cta.state || (admission.priceLine ?? null) !== (facts.priceLine ?? null)) issues.push(`${name}: its admission has changed, so its chips and any FREE badge would no longer be true.`)
  return issues
}
