/**
 * WHICH NIGHT EACH DAY'S POSTER IS (family F, the daily poster; the directive's pipeline steps 1 and 2:
 * C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-DIRECTIVE-30OCT.md). One night per city per day, from the week's verified
 * nights, by the planner's own editorial ranking (selectNights), with variety: a host on yesterday's poster is passed
 * over when the day holds another. Each pick says why it was picked and how its image was decided (the rights gate:
 * photo-led only from an approved register row, else type-led), and both are kept on the piece.
 *
 * PURE: the same week gives the same posters, so a second press of Plan this week finds them made.
 */
import { creditsOf, dayInWeek, join, nightKind, postTitle, selectNights, siteOf, tagsFor, whyOf, type CampaignCity, type CampaignNight, type NightKind, type PiecePlan, type PosterFacts } from './campaign'

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
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
const EMOJI: Record<NightKind | 'other', string> = {
  gig: '\u{1F3B6}',
  jazz: '\u{1F3B7}',
  classical: '\u{1F3BB}',
  dance: '\u{1F483}',
  festival: '\u{1F3AA}',
  comedy: '\u{1F602}',
  theatre: '\u{1F3AD}',
  talk: '\u{1F399}',
  family: '\u{1F388}',
  sport: '\u{1F3DF}',
  market: '\u{1F6CD}',
  christmas: '\u{1F384}',
  other: '\u2728',
}
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
/** The experience line where the night has no words of its own, true of its time of day. */
const KIND_LINE: Record<NightKind | 'other', (p: Part) => string> = {
  gig: () => 'Live music, up close.',
  jazz: () => 'Jazz the way it is meant to be heard, live.',
  classical: () => 'Music played the way it was written, in the room.',
  dance: () => 'Dance, live on stage.',
  festival: () => 'A festival to lose the day in.',
  comedy: () => 'New material and big laughs.',
  theatre: (p) => (p === 'night' ? 'An evening at the theatre.' : `${an(p)} ${p} at the theatre.`),
  talk: () => 'A conversation worth hearing in person.',
  family: () => 'A day out for the whole family.',
  sport: () => 'The game, live.',
  market: () => 'Stalls, food and makers to browse.',
  christmas: () => 'The season, out and about.',
  other: () => 'Something worth going out for.',
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const holds = (text: string, place: string) => new RegExp(`\\b${esc(place)}\\b`, 'i').test(text)

function partsOf(iso: string, tz: string | null): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>
}
const timeOf = (parts: Record<string, string>) =>
  (parts.minute === '00' ? `${parts.hour} ${String(parts.dayPeriod ?? '').toLowerCase()}` : `${parts.hour}:${parts.minute} ${String(parts.dayPeriod ?? '').toLowerCase()}`).trim()

/**
 * The date line: one day ('Thursday 19 November · 6.30 pm'), or the days of an event that runs over several, from its own
 * sessions ('Friday 20 to Sunday 22 November · 9 am'; class 7); the time where every session starts at it.
 */
function dateLine(n: CampaignNight, sessions: readonly CampaignNight[]): string {
  const all = [n, ...sessions.filter((x) => x.eventId !== n.eventId)].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const first = partsOf(all[0].startDate, all[0].timezone ?? null)
  const last = partsOf(all[all.length - 1].startDate, all[all.length - 1].timezone ?? null)
  const sameTime = all.every((x) => timeOf(partsOf(x.startDate, x.timezone ?? null)) === timeOf(first))
  if (all.length === 1 || (first.day === last.day && first.month === last.month)) return `${first.weekday} ${first.day} ${first.month} \u00b7 ${timeOf(partsOf(n.startDate, n.timezone ?? null))}`
  const days = first.month === last.month ? `${first.weekday} ${first.day} to ${last.weekday} ${last.day} ${last.month}` : `${first.weekday} ${first.day} ${first.month} to ${last.weekday} ${last.day} ${last.month}`
  return sameTime ? `${days} \u00b7 ${timeOf(first)}` : days
}

export type CaptionOptions = { readonly platform: 'instagram' | 'facebook'; readonly link: string; readonly sessions?: readonly CampaignNight[] }

/**
 * THE ONE CAPTION A NIGHT POSTS WITH (Lawal's Kate Ceberano caption as the reference, 18 November 2026; the PM's 03:10
 * classes): the kind's emoji and the title alone; the kind of event in words true of its time of day, the city only where
 * the title does not hold it; the night's own words (or its kind's), with no second place name beside the city; the
 * place, the city once; the date, or the days of a run; tickets where it sells them, 'Free entry' where it is free; then,
 * on Instagram, the link in bio and our tags, on Facebook the whole link. It IS each platform's posted version
 * (store.ts publishDuePieces posts rev.versions[platform].caption). No exclamation mark and no long dash. Pure.
 */
export function posterCaption(n: CampaignNight, city: CampaignCity, site: string, opts: CaptionOptions = { platform: 'instagram', link: `https://www.${site}/events/${n.slug}` }): string {
  const kind = nightKind(n) ?? 'other'
  const part = partOfDay(n.startDate, n.timezone ?? null)
  const at = holds(n.title, city.name) ? '' : ` in ${city.name}`
  const own = whyOf(n)
  // One place name per night (class 4): '... at Archive Wine Bar, Belmont.' keeps the venue and leaves the city to the place line.
  const why = own && n.venueName ? own.replace(new RegExp(`${esc(n.venueName)},\\s*[A-Z][A-Za-z' ]+(?=[.;]|$)`), n.venueName) : own
  const place = n.venueName ? (holds(n.venueName, city.name) ? n.venueName : `${n.venueName}, ${city.name}`) : city.name
  const free = n.cta.state === 'free_open' || n.cta.state === 'free_registration'
  const access = free
    ? [n.cta.state === 'free_registration' ? 'Free, with registration.' : 'Free entry.', '\u{1F517} Event details:']
    : ['\u{1F39F} Event details and tickets:']
  return join([
    `${EMOJI[kind]} ${n.title}`,
    KIND[kind](part, at),
    why ?? KIND_LINE[kind](part),
    '',
    `\u{1F4CD} ${place}`,
    `\u{1F4C5} ${dateLine(n, opts.sessions ?? [])}`,
    '',
    ...access,
    opts.platform === 'instagram' ? 'At the link in our bio.' : opts.link,
    // A third party photograph shows its credit (law 17 (d)): creditsOf says one only where the night's own photo is used.
    ...(creditsOf([n]) ? ['', creditsOf([n])] : []),
    ...(opts.platform === 'instagram' ? ['', tagsFor(city, null)] : []),
  ])
}

/** Both platforms' posted versions of a night's caption, in the piece's own crop. */
export function nightVersions(n: CampaignNight, city: CampaignCity, origin: string, crop: '4:5' | '9:16', sessions: readonly CampaignNight[] = []): PiecePlan['versions'] {
  const site = siteOf(origin)
  const link = `${origin}/events/${n.slug}`
  const instagram = posterCaption(n, city, site, { platform: 'instagram', link, sessions })
  const facebook = posterCaption(n, city, site, { platform: 'facebook', link, sessions })
  const hook = instagram.split('\n')[0]
  return {
    instagram: { hook, caption: instagram, crop, cta: 'At the link in our bio.' },
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
    const sessions = input.nights.filter((x) => x.citySlug === n.citySlug && x.title.toLowerCase() === n.title.toLowerCase())
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
