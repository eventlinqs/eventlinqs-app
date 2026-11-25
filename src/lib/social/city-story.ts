import { midnightIn } from '@/lib/dates/zone-midnight'
import { dayRowOf, listEmoji, type CampaignNight, type Slide } from './campaign'
import { captionDay, iconRow, placeOfNight, relationshipOf, type CarouselNight } from './city-carousel'

/**
 * THE DAILY CITY STORY, TONIGHT'S PICKS (the PM's 01:02 item 4 of 25 November 2026: "Stories: one a day per active city
 * from the week's nights (tonight's picks ...), through the publishing path the engine already has"; the playbook's
 * section 3a: "STORY: daily, for people who already follow: tonight's picks"). A story is one 9:16 frame, so it is the
 * cover of the locked look drawn in type: "TONIGHT IN" / the city, in the accent / the day and date, the picks counted,
 * and tonight's two best picks as cards beneath (day-cards.ts leadRoom: two in a story). It is EventLinqs' own designed
 * artwork, made by the carousel's make step (./carousel-make.ts) into a finished file for the creative intake, posted only
 * after the PM's verify, in the story band (18:00, cadence.ts STARTING_CALENDAR). Pure.
 *
 * Which picks: tonight's nights in the city starting at least two hours after the story's band (the timing engine holds a
 * piece of nights ahead until two hours before the first doors), one per title, organisers with a relationship first
 * (as the carousel ranks them), then the soonest; a story needs two, or it is not made that day.
 */
export const STORY_PICKS = 2
/** The story band's hour in Melbourne (cadence.ts STARTING_CALENDAR's story band). */
export const STORY_HOUR = 18
const ZONE = 'Australia/Melbourne'
const H = 3_600_000
const RANK = { permission: 0, ticketing: 1, writing: 2 } as const

/** When a day's story goes: its band, 18:00 on that day in Melbourne. Pure. */
export function storyPostAt(day: string): Date {
  return new Date(midnightIn(new Date(`${day}T12:00:00Z`), ZONE).getTime() + STORY_HOUR * H)
}

/** The day whose story is made now: today in Melbourne, while its band is still at least an hour away; else none. Pure. */
export function storyDayToDraw(now: Date): string | null {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return storyPostAt(today).getTime() - now.getTime() >= H ? today : null
}

/** The frame's date line, in capitals ("WED 25 NOV"). Pure. */
export function storyDateLine(day: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00Z`)).replace(/,/g, '').toUpperCase()
}

export type CityStoryDesign = {
  readonly picks: CarouselNight[]
  readonly slides: Slide[]
  readonly captions: { readonly instagram: string; readonly facebook: string }
  readonly link: string
}

/** Tonight's picks and the story's frame and words, or null when the night holds fewer than two picks. Pure. */
export function cityStoryDesign(input: {
  readonly city: { readonly slug: string; readonly name: string }
  readonly nights: readonly CampaignNight[]
  readonly day: string
  readonly origin: string
  readonly hop: string
  readonly tags: readonly string[]
}): CityStoryDesign | null {
  const band = storyPostAt(input.day).getTime()
  const end = midnightIn(new Date(band + 12 * H), ZONE).getTime()
  const seen = new Set<string>()
  const picks = input.nights
    .filter((n) => n.citySlug === input.city.slug)
    .map((n) => ({ ...n, free: n.cta.state === 'free_open' || n.cta.state === 'free_registration', categoryName: n.categoryName ?? null, relationship: relationshipOf(n) }))
    .filter((n) => {
      const at = Date.parse(n.startDate)
      return Number.isFinite(at) && at >= band + 2 * H && at < end
    })
    .sort((a, b) => (a.relationship ? RANK[a.relationship] : 3) - (b.relationship ? RANK[b.relationship] : 3) || Date.parse(a.startDate) - Date.parse(b.startDate))
    .filter((n) => {
      const key = n.title.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, STORY_PICKS)
    .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  if (picks.length < STORY_PICKS) return null
  const cover: Slide = {
    t: 'week_cover',
    composition: 'contents_cover',
    range: `TONIGHT'S PICKS`,
    lines: ['TONIGHT IN', input.city.name.toUpperCase(), storyDateLine(input.day)],
    accentLine: 1,
    draws: iconRow(picks),
    line: '',
    photoEventId: null,
    photo: null,
    credit: null,
    lead: picks.map((n) => dayRowOf(n)),
  }
  const link = `${input.origin.replace(/\/+$/, '')}/city/${input.city.slug}`
  const lines = picks.map((n) => {
    const place = placeOfNight(n)
    return `${captionDay(n)}: ${n.title}${place ? `, ${place}` : ''}`
  })
  const head = `${listEmoji(picks, false)} Tonight in ${input.city.name}, ${captionDay(picks[0])}.`
  const tags = input.tags.slice(0, 3).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
  const caption = (action: string) => [head, '', ...lines, '', action, ...(tags ? ['', tags] : [])].join('\n')
  return {
    picks,
    slides: [cover],
    captions: { instagram: caption('Every event and where to book: link in our bio.'), facebook: caption(`Every event and where to book: ${input.hop}`) },
    link,
  }
}

/** The story's timeline as the timing engine holds it: preferred at its band, useful until two hours before its first pick's doors. Pure. */
export function storyTimeline(day: string, picks: readonly Pick<CampaignNight, 'startDate'>[]): { readonly preferredAt: string; readonly latestAt: string; readonly expiresAt: string } {
  const band = storyPostAt(day)
  const first = Math.min(...picks.map((n) => Date.parse(n.startDate)))
  const dayEnd = midnightIn(new Date(band.getTime() + 12 * H), ZONE).getTime()
  const latest = Math.min(dayEnd, first - 2 * H)
  return { preferredAt: band.toISOString(), latestAt: new Date(latest).toISOString(), expiresAt: new Date(Math.max(latest, Math.min(dayEnd, first))).toISOString() }
}
