import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntakeImage, IntakeInput, RestsOn } from '@/lib/creative/intake'
import { CANONICAL_HOST } from '@/lib/site-url'
import { standardTags, tagWord, weekStartOf, type CampaignCity, type CampaignNight, type Slide } from './campaign'
import { carouselDesign, carouselNightOf, carouselPostAt, carouselTimeline, cityCoverPhotos, placeOfNight, type CarouselDesign } from './city-carousel'
import { cityStoryDesign, storyDayToDraw, storyTimeline } from './city-story'
import { goHop } from './go-hop'

type Db = SupabaseClient

/**
 * THE WEEKLY CITY CAROUSEL, MADE (WINDOW 5C, 25 November 2026; the PM's 01:02 item 3 and 01:12; the playbook's section 5).
 * Law 37 posts only a permitted photograph whole or a finished file (law37.ts), and the creative policy of 23 November
 * (Lawal's words verbatim in CREATIVE-POLICY-LAW37-REVISED-23NOV.md, point 3) makes EventLinqs' own designed artwork a
 * first class format through the creative intake. So the carousel is MADE, never planned as a piece: its design
 * (city-carousel.ts carouselDesign) is drawn slide by slide exactly as /admin/social draws it (renderCampaignSlide, each
 * photograph asked of the register that minute), each slide stored once as a finished file in our own storage
 * (event-images/creative/<uuid>/), and the whole handed to the creative intake (store.ts receiveIntake) with what each
 * image rests on: the cover on the city's own licensed photograph, a night's slide on that night's permitted photograph or
 * on our own design, the ask on our own design. The intake's gates read every fact, right, time, destination and word
 * that minute; a record that passes becomes a creative piece UNAPPROVED and unscheduled for the PM's verify, and the
 * scheduler never posts it before its preferred time (store.ts creativePreferredAt). Nothing is approved, scheduled or
 * published here.
 *
 * When: from four days before the week's Monday (the Thursday's 06:40 run), so the PM verifies it before Monday's window;
 * one record a city a week (its brief id is the city and the week): a record received, passed or handed off is never made
 * twice; one held or expired is made again on the next day's run, its reasons kept on the record before it.
 */

/** The cities the carousel is made for (the PM's 01:02 item 3: "Melbourne first"). Another city is one more name here. */
export const CAROUSEL_CITIES: readonly string[] = ['melbourne']
/** How many days before the week's Monday the carousel is made: from the Thursday, for the PM's verify. */
export const CAROUSEL_DRAW_DAYS = 4
const DAY_MS = 86_400_000
const ORIGIN = `https://${CANONICAL_HOST}`

/** The week whose carousel is made now: its Monday and its post time, when that post is within CAROUSEL_DRAW_DAYS. Pure. */
export function carouselWeekToDraw(now: Date): { readonly weekStart: string; readonly postAt: Date } | null {
  const thisWeek = weekStartOf(now)
  const thisPost = carouselPostAt(thisWeek)
  const weekStart = now.getTime() < thisPost.getTime() ? thisWeek : new Date(Date.parse(`${thisWeek}T00:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10)
  const postAt = carouselPostAt(weekStart)
  return postAt.getTime() - now.getTime() <= CAROUSEL_DRAW_DAYS * DAY_MS ? { weekStart, postAt } : null
}

/** The one brief a city's carousel of a week is made under, the same on every run (a uuid made from the two). Pure. */
export function briefIdOf(city: string, weekStart: string): string {
  const h = createHash('sha256').update(`city-carousel|${city}|${weekStart}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** A finished slide's own file name in storage: the city, the week and its place in the carousel. Pure. */
export function slideFileName(city: string, weekStart: string, n: number): string {
  return `${city}-week-${weekStart}-${String(n).padStart(2, '0')}.jpg`
}

/**
 * The record handed to the creative intake: its nights and their facts as the guide holds them, each finished file with
 * what it rests on, both captions, the city's guide as its destination, and its timeline (city-carousel.ts
 * carouselTimeline). Pure.
 */
export function carouselIntake(input: {
  readonly briefId: string
  readonly design: CarouselDesign
  readonly images: readonly IntakeImage[]
  readonly postAt: Date
}): IntakeInput {
  const { design } = input
  return {
    briefId: input.briefId,
    eventIds: design.nights.map((n) => n.eventId),
    format: 'feed',
    images: [...input.images],
    captions: { instagram: design.captions.instagram, facebook: design.captions.facebook },
    destinations: ['instagram', 'facebook'],
    facts: design.nights.map((n) => ({ eventId: n.eventId, title: n.title, startDate: n.startDate, endDate: n.endDate ?? null, venue: placeOfNight(n), organiser: n.organiser ?? null })),
    link: design.link,
    // A city post is judged by its saves and shares (post-kind.ts; the playbook's sections 3a and 4).
    objective: 'engagement',
    ...carouselTimeline(input.postAt, design.nights),
  }
}

/** What the register gives a slide's photograph that minute (store.ts slideImagesNow's UsableImage, as far as this needs). */
export type SlidePicture = { readonly url: string; readonly assetId: string; readonly kind?: 'photo' | 'artwork' } | null

/**
 * What each slide rests on, and the slides as they will be drawn: the cover on the city's own photograph (none: no
 * carousel), each night on its own permitted photograph where the register holds it as a photograph, else drawn in type
 * on our own design (an organiser's poster is never altered, so it is never laid into a slide), the ask on our own design.
 * Pure.
 */
export function restsOnOfSlides(
  slides: readonly Slide[],
  pictures: ReadonlyMap<number, SlidePicture>,
  registered: ReadonlySet<string>,
): { readonly slides: Slide[]; readonly restsOn: RestsOn[] } | { readonly refused: string } {
  const cover = pictures.get(0) ?? null
  if (slides[0]?.t !== 'week_cover' || !cover || !registered.has(cover.assetId)) {
    return { refused: "the city's own photograph is not in the media register as EventLinqs' own for this minute, so no cover can be drawn" }
  }
  const out: Slide[] = []
  const restsOn: RestsOn[] = []
  slides.forEach((s, i) => {
    if (i === 0) {
      out.push(s)
      restsOn.push({ kind: 'city_photo', assetId: cover.assetId })
      return
    }
    const p = pictures.get(i) ?? null
    if (s.t === 'feature' && s.photo && p && p.kind !== 'artwork' && registered.has(p.assetId) && p.url === s.photo) {
      out.push(s)
      restsOn.push({ kind: 'asset', assetId: p.assetId })
      return
    }
    out.push(s.t === 'feature' ? { ...s, photo: null, credit: null } : s)
    restsOn.push({ kind: 'own_design' })
  })
  return { slides: out, restsOn }
}

export type CarouselMade = { readonly city: string; readonly weekStart: string; readonly state: 'made' | 'kept' | 'refused'; readonly line: string }

/** The make step's own hands, each replaced in a test: the store's readers and the intake, the renderer, the storage. */
export type CarouselDeps = {
  readonly readCities: (db: Db) => Promise<CampaignCity[]>
  readonly readNights: (db: Db, cities: readonly CampaignCity[], weekStart: string, now: Date) => Promise<CampaignNight[]>
  readonly pictures: (db: Db, slides: readonly Slide[], now: Date) => Promise<ReadonlyMap<number, SlidePicture>>
  readonly render: (slide: Slide, n: number, total: number, picture: SlidePicture, next: Slide | null, format: 'feed' | 'story') => Promise<Uint8Array>
  readonly store: (path: string, bytes: Uint8Array) => Promise<string>
  readonly intake: (input: IntakeInput) => Promise<{ readonly state: string; readonly pieceId?: string | null; readonly faults?: readonly string[]; readonly reason?: string }>
}

/**
 * Makes each carousel due now (carouselWeekToDraw), one city at a time, and says what happened to each in one line. A
 * city whose carousel cannot be made says why; nothing else takes its place (the creative intake's NO FALLBACK). Reads,
 * one record a city, and finished files in storage; never a piece approved, scheduled or published.
 */
export async function makeWeeklyCarousels(db: Db, input: { readonly now: Date; readonly deps: CarouselDeps }): Promise<CarouselMade[]> {
  const week = carouselWeekToDraw(input.now)
  if (!week) return []
  const { deps } = input
  const cities = (await deps.readCities(db)).filter((c) => CAROUSEL_CITIES.includes(c.slug))
  const out: CarouselMade[] = []
  for (const city of cities) {
    const say = (state: CarouselMade['state'], line: string) => out.push({ city: city.slug, weekStart: week.weekStart, state, line: `${city.name}, the week of ${week.weekStart}: ${line}` })
    try {
      const briefId = briefIdOf(city.slug, week.weekStart)
      const { data: had, error: herr } = await db.from('creative_intake').select('state, piece_id').eq('brief_id', briefId)
      if (herr) throw new Error(`its earlier records could not be read: ${herr.message}`)
      const live = ((had ?? []) as { state: string; piece_id: string | null }[]).find((r) => r.state === 'received' || r.state === 'passed' || r.state === 'handed_off')
      if (live) {
        say('kept', `made already (${live.state}${live.piece_id ? `, piece ${live.piece_id}` : ''}); never made twice.`)
        continue
      }
      const nights = (await deps.readNights(db, [city], week.weekStart, input.now)).filter((n) => n.citySlug === city.slug)
      const design = carouselDesign({
        city,
        nights: nights.map((n) => carouselNightOf(n)),
        postAt: week.postAt,
        origin: ORIGIN,
        cityPhoto: cityCoverPhotos([city], ORIGIN).get(city.slug) ?? null,
        tags: standardTags(city, tagWord(city.name)).split(/\s+/).filter((t) => t.startsWith('#')),
      })
      if (!design) {
        say('refused', 'not made: the city has no licensed photograph of its own, or its seven days hold fewer than two events from the evening of its Monday.')
        continue
      }
      const pictures = await deps.pictures(db, design.slides, input.now)
      const ids = [...new Set([...pictures.values()].flatMap((p) => (p ? [p.assetId] : [])))]
      const { data: rows, error: rerr } = ids.length > 0 ? await db.from('social_assets').select('id').in('id', ids) : { data: [], error: null }
      if (rerr) throw new Error(`the register could not be read for its photographs: ${rerr.message}`)
      const registered = new Set(((rows ?? []) as { id: string }[]).map((r) => r.id))
      const rests = restsOnOfSlides(design.slides, pictures, registered)
      if ('refused' in rests) {
        say('refused', `not made: ${rests.refused}.`)
        continue
      }
      const folder = randomUUID()
      const images: IntakeImage[] = []
      for (const [i, slide] of rests.slides.entries()) {
        const picture = rests.restsOn[i].kind === 'own_design' ? null : (pictures.get(i) ?? null)
        const bytes = await deps.render(slide, i + 1, rests.slides.length, picture, rests.slides[i + 1] ?? null, 'feed')
        const url = await deps.store(`creative/${folder}/${slideFileName(city.slug, week.weekStart, i + 1)}`, bytes)
        images.push({ url, restsOn: rests.restsOn[i] })
      }
      const record = carouselIntake({ briefId, design: { ...design, slides: rests.slides }, images, postAt: week.postAt })
      const r = await deps.intake(record)
      const short = design.short.length > 0 ? ` The week fell short of the playbook: ${design.short.join('; ')}.` : ''
      if (r.state === 'handed_off') say('made', `made as ${images.length} finished slides and handed to publishing as piece ${r.pieceId}, UNAPPROVED, for the PM's verify.${short}`)
      else say('refused', `made as ${images.length} finished slides and HELD by the creative intake (${r.state}): ${(r.faults ?? []).join(' ') || r.reason || 'no reason given'}${short}`)
    } catch (error) {
      say('refused', `not made: ${error instanceof Error ? error.message : String(error)}.`)
    }
  }
  return out
}

/** The one brief a city's story of a day is made under, the same on every run. Pure. */
export function storyBriefIdOf(city: string, day: string): string {
  const h = createHash('sha256').update(`city-story|${city}|${day}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * THE DAILY CITY STORY, MADE (the PM's 01:02 item 4 of 25 November 2026; ./city-story.ts): each morning, for each city
 * the carousel is made for, tonight's picks drawn as one 9:16 frame in the locked look (in type, our own design alone),
 * stored once as a finished file and handed to the creative intake as a story, preferred at the story band (18:00). One
 * record a city a day, never made twice; a held one is made again on the next run that day. Never approved, scheduled
 * or published here: the PM's verify approves it.
 */
export async function makeDailyStories(db: Db, input: { readonly now: Date; readonly deps: CarouselDeps }): Promise<CarouselMade[]> {
  const day = storyDayToDraw(input.now)
  if (!day) return []
  const { deps } = input
  const cities = (await deps.readCities(db)).filter((c) => CAROUSEL_CITIES.includes(c.slug))
  const out: CarouselMade[] = []
  for (const city of cities) {
    const say = (state: CarouselMade['state'], line: string) => out.push({ city: city.slug, weekStart: day, state, line: `${city.name}'s story of ${day}: ${line}` })
    try {
      const briefId = storyBriefIdOf(city.slug, day)
      const { data: had, error: herr } = await db.from('creative_intake').select('state, piece_id').eq('brief_id', briefId)
      if (herr) throw new Error(`its earlier records could not be read: ${herr.message}`)
      const live = ((had ?? []) as { state: string; piece_id: string | null }[]).find((r) => r.state === 'received' || r.state === 'passed' || r.state === 'handed_off')
      if (live) {
        say('kept', `made already (${live.state}${live.piece_id ? `, piece ${live.piece_id}` : ''}); never made twice.`)
        continue
      }
      const nights = await deps.readNights(db, [city], weekStartOf(input.now), input.now)
      const design = cityStoryDesign({
        city,
        nights,
        day,
        origin: ORIGIN,
        hop: goHop(ORIGIN, 'facebook'),
        tags: standardTags(city, tagWord(city.name)).split(/\s+/).filter((t) => t.startsWith('#')),
      })
      if (!design) {
        say('refused', 'not made: tonight holds fewer than two picks starting two hours after the story band.')
        continue
      }
      const bytes = await deps.render(design.slides[0], 1, 1, null, null, 'story')
      const url = await deps.store(`creative/${randomUUID()}/${city.slug}-story-${day}-01.jpg`, bytes)
      const record: IntakeInput = {
        briefId,
        eventIds: design.picks.map((n) => n.eventId),
        format: 'story',
        images: [{ url, restsOn: { kind: 'own_design' } }],
        captions: design.captions,
        destinations: ['instagram', 'facebook'],
        facts: design.picks.map((n) => ({ eventId: n.eventId, title: n.title, startDate: n.startDate, endDate: n.endDate ?? null, venue: placeOfNight(n), organiser: n.organiser ?? null })),
        link: design.link,
        objective: 'engagement',
        ...storyTimeline(day, design.picks),
      }
      const r = await deps.intake(record)
      if (r.state === 'handed_off') say('made', `made as one finished frame and handed to publishing as piece ${r.pieceId}, UNAPPROVED, for the PM's verify.`)
      else say('refused', `made as one finished frame and HELD by the creative intake (${r.state}): ${(r.faults ?? []).join(' ') || r.reason || 'no reason given'}`)
    } catch (error) {
      say('refused', `not made: ${error instanceof Error ? error.message : String(error)}.`)
    }
  }
  return out
}
