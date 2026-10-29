/**
 * WHICH NIGHT EACH DAY'S POSTER IS (family F, the daily poster; the directive's pipeline steps 1 and 2:
 * C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-DIRECTIVE-30OCT.md). One night per city per day, from the week's verified
 * nights, by the planner's own editorial ranking (selectNights), with variety: a host on yesterday's poster is passed
 * over when the day holds another. Each pick says why it was picked and how its image was decided (the rights gate:
 * photo-led only from an approved register row, else type-led), and both are kept on the piece.
 *
 * PURE: the same week gives the same posters, so a second press of Plan this week finds them made.
 */
import { creditsOf, dayInWeek, join, pickLine, selectNights, siteOf, tagsFor, versionsOf, type CampaignCity, type CampaignNight, type PiecePlan, type PosterFacts } from './campaign'

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
    for (let d = 0; d < 7; d++) {
      const today = week.filter((n) => dayInWeek(n, input.weekStart) === d).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
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
    }
  }
  return picks
}

/**
 * The week's daily posters as pieces the store keeps and a person approves one by one (the directive's pipeline steps
 * 1 to 5). Each is one night: a feed poster (with its square) for attendees, sent to the night's own page through its
 * own /e/ link, which the store mints and writes onto the slide before it is kept. Nothing posts by itself.
 */
export function dailyPosterPieces(input: { nights: readonly CampaignNight[]; cities: readonly CampaignCity[]; weekStart: string; origin: string; excluded?: ReadonlySet<string> }): PiecePlan[] {
  const site = siteOf(input.origin)
  const byId = new Map(input.nights.map((n) => [n.eventId, n]))
  const pieces: PiecePlan[] = []
  for (const pick of planDailyPosters(input)) {
    const n = byId.get(pick.eventId)
    const city = input.cities.find((c) => c.slug === pick.city)
    if (!n || !city) continue
    const photo = pick.rights === 'photo' ? n.approvedPhotoUrl : null
    const hook = `${n.title}, ${n.venueName ? `at ${n.venueName}, ` : ''}${city.name}.`
    const body = [pickLine(n), '', creditsOf([n])]
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
      caption: join([hook, '', ...body, '', `The night: ${site}/events/${n.slug}`, '', tagsFor(city, null)]),
      versions: versionsOf(hook, body, page, 'The night is at the link in our bio.', 'The night:', '4:5', tagsFor(city, null)),
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
