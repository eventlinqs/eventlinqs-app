/**
 * WHICH NIGHT EACH DAY'S POSTER IS (family F, the daily poster; the directive's pipeline steps 1 and 2:
 * C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-DIRECTIVE-30OCT.md). One night per city per day, from the week's verified
 * nights, by the planner's own editorial ranking (selectNights), with variety: a host on yesterday's poster is passed
 * over when the day holds another. Each pick says why it was picked and how its image was decided (the rights gate:
 * photo-led only from an approved register row, else type-led), and both are kept on the piece.
 *
 * PURE: the same week gives the same posters, so a second press of Plan this week finds them made.
 */
import { dayInWeek, selectNights, type CampaignCity, type CampaignNight } from './campaign'

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
