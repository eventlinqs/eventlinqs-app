import type React from 'react'
import { rasteriseCard } from '@/lib/broadcast/social-cards'
import {
  FitError,
  GOLD,
  layoutBrand,
  layoutCover,
  layoutEnd,
  layoutFaults,
  layoutNight,
  layoutOffer,
  layoutProgramme,
  type Layout,
  type Measurers,
  type NightWords,
  type TreatmentFormat,
} from '@/lib/broadcast/treatment-layout'
import { drawLayout, treatmentMeasurers } from '@/lib/broadcast/treatments'
import { layoutDailyPoster, posterWords } from '@/lib/broadcast/daily-poster'
import { askElement, bandHeight, bandPhoto, bandTop, daysElement, featureElement, freeWeekElement, nameCardElement, spotlightElement, tonightElement, scaleOf, sizeOf, startScale, venueElement, weekCoverElement, wholePhoto, SAFE, type El, type Foot } from '@/lib/broadcast/day-cards'
import { footBottom, lockedSlideFaults, spareAboveFoot, wordTop } from '@/lib/broadcast/day-card-guard'
import { inLockedLook, isApprovedFileUrl, type Composition, type LOCKED_SLIDES, type Slide } from '@/lib/social/campaign'
import { standInCredit, standInOf } from '@/lib/social/stand-ins'
import { drawLaw37Photo } from '@/lib/broadcast/law37-photo'

/**
 * THE WEEKLY CAMPAIGN'S SLIDES (the release checklist of 28 October 2026, J7, S3; Lawal's final creative approval of
 * 28 October 19:52). Every slide is a measured layout from treatment-layout.ts: a night or a partner's story in
 * treatment A (its organiser's own photograph) or B (editorial type), the organiser campaign and a brand piece with no
 * licensed photograph in C (EventLinqs' own art), and the contents cover, the venue programme and the closing slide in
 * the same type, each laid out natively for the portrait feed, the square and the story. So every word of every slide
 * is held to its box, the safe area and its contrast before a person may approve it (visualFaults). A photograph
 * appears only when the register holds it as usable for that slide now (J1 to J4). No QR code: a post is tapped.
 */

/** The accent each composition takes (the type-led ground falls from it to navy). */
const ACCENT: Record<Composition, string> = {
  concert: GOLD,
  festival: '#F08A24',
  family: '#6FC3C0',
  free: GOLD,
  general: GOLD,
  venue_spotlight: '#F3A43B',
  organiser_campaign: GOLD,
  contents_cover: GOLD,
  close: GOLD,
}

/** feed is the 4:5 portrait (drawn at 1440 x 1800), square 1:1, story 9:16. */
export type Format = 'feed' | 'square' | 'story'

const TREATMENT_FORMAT: Record<Format, TreatmentFormat> = { feed: 'portrait', square: 'square', story: 'story' }

/** A photograph as the register holds it now: its address and the focal point a person set. */
export type SlideImage = { url: string; focal: { x: number; y: number } | null; width: number | null; height: number | null }

/** The words a night's treatment draws; a slide planned before the treatments is read from its older slots. */
function wordsOf(slide: Extract<Slide, { t: 'night' | 'story' }>, photo: string | null): NightWords {
  const w = slide.words
  const [date, time] = slide.when.split(' · ')
  return {
    title: slide.title,
    eyebrow: w?.eyebrow ?? `At ${slide.meta}`,
    date: w?.date ?? date,
    time: w?.time ?? time ?? '',
    entry: w ? w.entry : null,
    action: w?.action ?? 'View event details',
    // One call (the PM's 15:45 of 15 November 2026, fix 5): a pill that names our address has no second one beside it.
    label: /eventlinqs\.com\.au/.test(w?.action ?? '') ? '' : 'eventlinqs.com.au',
    city: w?.city ?? '',
    line: slide.t === 'night' ? slide.why : (slide.line ?? null),
    photo,
    credit: photo ? slide.credit : null,
    accent: ACCENT[slide.composition],
    composition: slide.composition,
  }
}

/**
 * The slide's measured layout at a format. `image` is the register's row NOW: a slide whose image has gone since it
 * was planned is laid out in type. `count` ("2/7") is shown on a carousel's cover, programme and close.
 */
export function layoutOfSlide(f: Format, slide: UnlockedSlide, image: SlideImage | null, m: Measurers, count: string | null = null): Layout {
  const tf = TREATMENT_FORMAT[f]
  const photo = image && 'photo' in slide && slide.photo === image.url ? image.url : null
  let layout: Layout
  switch (slide.t) {
    case 'night':
    case 'story':
      layout = layoutNight(tf, wordsOf(slide, photo), m)
      break
    case 'offer':
      layout = layoutOffer(tf, { eyebrow: slide.eyebrow, headline: slide.headline, points: slide.points, url: slide.url }, m)
      break
    case 'brand':
      layout = layoutBrand(tf, { headline: slide.headline, line: slide.line, action: slide.action, label: 'eventlinqs.com.au', photo, credit: photo ? slide.credit : null }, m)
      break
    case 'cover':
      layout = layoutCover(tf, { chip: slide.chip, headline: slide.headline, line: slide.line, contents: slide.contents, label: count }, m)
      break
    case 'programme':
      layout = layoutProgramme(tf, { heading: slide.heading, address: slide.address, rows: slide.rows, label: count }, m)
      break
    case 'end':
      layout = layoutEnd(tf, { headline: slide.headline, line: slide.line, url: slide.url, foot: slide.foot, label: count }, m)
      break
    case 'photo':
      // Law 37's photograph is drawn whole by drawLaw37Photo, never laid out as a card (renderCampaignSlide sends it there).
      throw new Error("law 37's photograph is drawn whole by drawLaw37Photo, never laid out as a card")
    case 'poster': {
      /* Family F: the photograph only as the register holds it now for this night, else the same poster in type. */
      const facts = { ...slide.night, photo: photo && slide.credit ? { url: photo, credit: slide.credit, archival: false } : null }
      layout = layoutDailyPoster(tf, posterWords(facts, tf), m, facts.photo ? { url: facts.photo.url } : null)
      break
    }
  }
  if (layout.photo && image?.focal) layout = { ...layout, photo: { ...layout.photo, focal: image.focal } }
  return layout
}

/**
 * How far a photograph is enlarged to fill its box at the size the platform shows it (1080 wide): 1 or less is sharp;
 * over 1.5 it reads soft on a phone, so the slide is held and the original asked for.
 */
export function enlargement(layout: Layout, image: SlideImage): number | null {
  if (!layout.photo || !image.width || !image.height) return null
  const box = layout.photo
  const usedWidth = Math.min(image.width, (image.height * box.w) / box.h)
  return box.w / usedWidth
}

export const MAX_ENLARGEMENT = 1.5

/** The formats a piece is made in: a story piece as a story; a feed piece as the portrait and the square. */
export function formatsOf(pieceFormat: 'feed' | 'story'): Format[] {
  return pieceFormat === 'story' ? ['story'] : ['feed', 'square']
}

/**
 * The directive's section 7, before approval: every slide of a piece, at every format it is made in, has every word
 * inside its box, the safe area and the margins, at a size that reads on a phone and with its contrast, nothing
 * overlapping, and its photograph at a resolution that holds. Each failure is said, with the slide and format.
 */
export async function visualFaults(slides: readonly Slide[], pieceFormat: 'feed' | 'story', images: ReadonlyMap<number, SlideImage | null>): Promise<string[]> {
  const m = await treatmentMeasurers()
  const faults: string[] = []
  for (const f of formatsOf(pieceFormat)) {
    for (const [i, slide] of slides.entries()) {
      // A daily poster in family D is drawn in the locked look, and read as one (law 26).
      if (slide.t === 'poster' && slide.look) {
        const where = `Slide ${i + 1} (${f === 'feed' ? 'portrait' : f})`
        const el = await posterLockedElement(f, slide, images.get(i) ?? null)
        for (const fault of await lockedSlideFaults(el, f)) faults.push(`${where}: ${fault}.`)
        continue
      }
      // LAW 37'S ONE SLIDE: the photograph whole, nothing laid out to measure; it is drawn only while its photograph is
      // permitted (its fit is its destination's, slidesMisfit). Said once, for the piece's own format.
      if (slide.t === 'photo') {
        if (!images.get(i) && f === formatsOf(pieceFormat)[0]) faults.push(`Slide ${i + 1}: its photograph is not permitted now, so it is never drawn.`)
        continue
      }
      if (!isLocked(slide)) continue
      // An approved file is never drawn, so nothing here can measure it: its fit is read from its own bytes against its
      // destination before any publisher is called (slidesMisfit, src/lib/social/destination-check.ts).
      if (slide.t === 'file') continue
      const where = `Slide ${i + 1} (${f === 'feed' ? 'portrait' : f})`
      const image = images.get(i) ?? null
      if (slide.t === 'feature' && slide.photo && !image) faults.push(`${where}: its own photograph is no longer usable for this night, so the slide is drawn without it.`)
      const el = await lockedElement(f, slide, image, i + 1, slides.length, slides[i + 1] ?? null)
      for (const fault of await lockedSlideFaults(el, f)) faults.push(`${where}: ${fault}.`)
    }
    slides.forEach((slide, i) => {
      if (isLocked(slide) || (slide.t === 'poster' && slide.look) || slide.t === 'photo') return
      const where = `Slide ${i + 1} (${f === 'feed' ? 'portrait' : f})`
      let layout: Layout
      try {
        layout = layoutOfSlide(f, slide, images.get(i) ?? null, m, slides.length > 1 ? `${i + 1}/${slides.length}` : null)
      } catch (error) {
        if (error instanceof FitError) {
          faults.push(`${where}: ${error.message}.`)
          return
        }
        throw error
      }
      for (const fault of layoutFaults(layout, m)) faults.push(`${where}: ${fault}.`)
      const image = images.get(i)
      const k = image ? enlargement(layout, image) : null
      if (k !== null && k > MAX_ENLARGEMENT) faults.push(`${where}: the photograph is enlarged ${k.toFixed(2)} times to fill its box; ask its owner for the original file.`)
    })
  }
  return faults
}

/** One slide of a piece as its element: its measured layout, drawn; a locked slide in the 9.5 look. */
/**
 * A STAND-IN IS MARKED ILLUSTRATIVE WHEN IT IS DRAWN, WHATEVER WORDS WERE STORED (17 November 2026, on Lawal's D1 and D2 of
 * 16 November, 23:08: "stand-in images must never be presented as photographs of the actual event"). D1 and D2 word a
 * stand-in's credit when a piece is planned (standInCredit), so a piece planned before them stored 'Photo: <name> / Pexels'
 * and printed it so. The credit of any stand-in is taken from the photograph itself here, before every slide is built;
 * a night's own photograph and a slide in type are returned as they are.
 */
export function withStandInCredit(slide: Slide): Slide {
  if (!('photo' in slide) || !slide.photo) return slide
  const standIn = standInOf(slide.photo)
  if (!standIn) return slide
  const credit = standInCredit(standIn)
  return 'credit' in slide && slide.credit === credit ? slide : ({ ...slide, credit } as Slide)
}

export async function buildCampaignSlide(f: Format, given: Slide, n: number, total: number, label: string | null, image: SlideImage | null = null, next: Slide | null = null): Promise<React.ReactElement> {
  if (given.t === 'photo') throw new Error("law 37's photograph is drawn whole by drawLaw37Photo, never laid out as a card")
  const slide = withStandInCredit(given)
  if (isLocked(slide)) return (await lockedElement(f, slide, image, n, total, next)) as unknown as React.ReactElement
  if (slide.t === 'poster' && slide.look) return (await posterLockedElement(f, slide, image)) as unknown as React.ReactElement
  return drawLayout(layoutOfSlide(f, slide, image, await treatmentMeasurers(), label ?? (total > 1 ? `${n}/${total}` : null)))
}

/** The slide as the JPEG Instagram and Facebook take, at the format's published size. `next` names a story's next slide. */
export async function renderCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null, image: SlideImage | null = null, next: Slide | null = null): Promise<Uint8Array> {
  // LAW 37'S ONE SLIDE (law37-photo.tsx): the permitted photograph whole, never laid out as a card.
  if (slide.t === 'photo') return drawLaw37Photo(f, slide, image)
  // An approved file is its own bytes, read from its own address on www, never drawn again: a story reel, a kit download
  // or any later caller gets exactly the file Lawal approved.
  if (slide.t === 'file') {
    if (!isApprovedFileUrl(slide.url)) throw new Error(`slide ${n} is not an approved file's own address on www: ${slide.url}`)
    const res = await fetch(slide.url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`slide ${n}'s approved file answers ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  return rasteriseCard(f, await buildCampaignSlide(f, slide, n, total, label, image, next))
}

/* ------------------------------------------------------------------ the 9.5 locked look (the PM's 17:10 of 15 November 2026) */

// The type is the one list itself (campaign.ts LOCKED_SLIDES), so a kind added there must be handled in lockedElement
// before this compiles. It once named five kinds while the list held six: the approved file passed isLocked at run
// time, lockedElement had no case for it and returned nothing, and the publish gate's visual check threw at 15:13 on
// 18 November 2026 with Lawal's twelve approved posts due.
type LockedSlide = Extract<Slide, { t: (typeof LOCKED_SLIDES)[number] }>
type UnlockedSlide = Exclude<Slide, LockedSlide>

export function isLocked(slide: Slide): slide is LockedSlide {
  // One list of the locked slides (campaign.ts LOCKED_SLIDES, Lawal's social lock of 15 November 2026).
  return inLockedLook([slide])
}

/** The first word of a slide's foot, where the spare room above it is read. */
const footWordOf = (foot: Foot): string | null => (!foot ? null : foot.kind === 'count' ? 'Swipe' : 'Tap')

/** A one pixel stand-in for the photograph while a slide is laid out to find where its words begin. */
const BLANK = (f: Format, h: number) => ({ uri: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', width: sizeOf(f).w, height: h })

/**
 * The band's height for a slide (the PM's 17:40 fix 2, "close the dead band between the fade and the heading"): the slide
 * is laid out once, the top of its first words (`marker`, drawn at `minSize` of a 1080 frame or more) read from satori's
 * own layout, and the band ends just above them; never under its first planned height, never over three quarters.
 */
async function fittedBand(f: Format, slide: 'days' | 'cover' | 'venue', build: (h: number) => El, marker: string, minSize: number): Promise<number> {
  const planned = bandHeight(f, slide)
  const top = marker ? await wordTop(build(planned), f, marker, minSize * scaleOf(f)) : null
  if (top === null) return planned
  return Math.round(Math.min(sizeOf(f).h * 0.75, Math.max(planned, top - 12 * scaleOf(f))))
}

/**
 * The card size for a slide in type (the PM's 19:45 fix 3): one fixed gap, the group under the heading, and the cards as
 * large as leaves only a small margin above the foot, measured from satori's own layout, never a guess; between its
 * starting size and 1.6. The margin stays under the text guard's 100 px run of a 1080 frame, so no bare ground is left.
 */
async function fittedScale(f: Format, start: number, build: (s: number) => El, footWord: string | null): Promise<number> {
  // Growing the cards to fill pushed joined names past their columns (out-8's first pass, 19:51): the PM's 19:45 rules one
  // fixed gap and spare room at the foot, so a slide keeps its count-based size and is only ever shrunk, never grown, to
  // keep its foot on the frame.
  const k = scaleOf(f)
  const floor = sizeOf(f).h - (f === 'story' ? SAFE + 16 * k : 64 * k * 0.8)
  let s = start
  for (let i = 0; i < 4 && (await spareAboveFoot(build(s), f, footWord, floor)) < 0; i++) s *= 0.92
  return s
}

/** What a story's foot names: the slide a tap opens (a story is tapped, never swiped: the PM's 09:40 fix 2). */
export function tapWords(next: Slide | null): string | null {
  if (!next) return null
  if (next.t === 'days') return `Tap for ${next.day}`
  if (next.t === 'feature') {
    const name = next.title
    return name.length <= 24 ? `Tap for ${name}` : 'Tap for the next night'
  }
  if (next.t === 'ask') return 'Tap for where to start'
  return 'Tap for the next'
}

/**
 * A DAILY POSTER IN FAMILY D (law 26; the master set's 11 LANY and 20 AMCF): a night's own photograph whole, the night
 * beneath it and the send ask (featureElement as a post of its own); a stand-in of its kind across the top with the name
 * in gold and one cream timed card (nameCardElement). The photograph is used only as the register holds it now (image).
 */
async function posterLockedElement(f: Format, slide: Extract<Slide, { t: 'poster' }>, image: SlideImage | null): Promise<El> {
  const look = slide.look!
  const url = image && slide.photo && slide.photo === image.url ? image.url : null
  const stand = standInOf(url)
  if (url && !stand && look.family === 'C' && look.presenter && look.nightLines) {
    // Family C (master 17): the organiser's flyer whole, PRESENTED BY its organiser.
    const whole = await wholePhoto(url, f, 'feature')
    // The flyer whole, never taller than the master's (looked at 19 November 00:10: a 3:2 flyer drawn full width pushed the
    // send ask off the frame); a smaller copy keeps its own shape (law 15: never cropped).
    const maxH = Math.round(sizeOf(f).h * (f === 'story' ? 0.42 : f === 'square' ? 0.34 : 0.4))
    const flyer = whole && whole.height > maxH ? { ...whole, width: Math.round((whole.width * maxH) / whole.height), height: maxH } : whole
    return spotlightElement(f, { presenter: look.presenter, nightLines: look.nightLines, credit: flyer ? (slide.credit ?? null) : null }, flyer)
  }
  if (url && !stand) {
    const photo = await wholePhoto(url, f, 'feature')
    return featureElement(f, { eyebrow: look.eyebrow, title: look.name, accent: look.accent, chip: look.chip, credit: photo ? slide.credit : null }, photo, null, true)
  }
  const words = { eyebrow: look.eyebrow, name: look.name, accent: look.accent, row: look.row, credit: url ? (slide.credit ?? null) : null }
  if (!url) return nameCardElement(f, words, null)
  // The band ends where the words begin (the PM's 17:40 fix 2 of 15 November, as a day slide's does): just above the gold
  // eyebrow, read from satori's own layout, so the eyebrow never sits on the photograph and no bare navy is left above it;
  // never under the photograph's floor below the wordmark's strip.
  const marker = (look.eyebrow.split(' ')[0] ?? '').toUpperCase().replace(/[^\p{L}\p{N}]+$/u, '')
  const at = marker ? await wordTop(nameCardElement(f, words, BLANK(f, sizeOf(f).h), sizeOf(f).h), f, marker, 30 * scaleOf(f)) : null
  const floor = bandTop(f, 'days') + Math.round(sizeOf(f).h * 0.18)
  const bh = Math.max(floor, at === null ? Math.round(sizeOf(f).h * (f === 'square' ? 0.42 : 0.46)) : Math.round(at - 8 * scaleOf(f)))
  const photo = await bandPhoto(url, f, Math.max(1, bh - bandTop(f, 'days')), image?.focal ?? stand?.focal ?? null)
  return nameCardElement(f, { ...words, credit: photo ? words.credit : null }, photo, bh)
}

/** A locked slide's element, its photograph fetched and sized for the format: a stand-in across the top, a night's own whole. */
async function lockedElement(f: Format, slide: LockedSlide, image: SlideImage | null, n: number, total: number, next: Slide | null): Promise<El> {
  const foot: Foot = f === 'story' ? (tapWords(next) ? { kind: 'tap', words: String(tapWords(next)) } : null) : total > 1 ? { kind: 'count', n, of: total } : null
  const url = image && 'photo' in slide && slide.photo === image.url ? image.url : null
  switch (slide.t) {
    case 'week_cover': {
      const standIn = Boolean(standInOf(url))
      const words = { range: slide.range, lines: slide.lines, draws: slide.draws, line: slide.line ?? '', credit: url ? slide.credit : null, lead: slide.lead }
      if (url && standIn) {
        // The band ends where the words begin: above the credit, or the range where there is none. Satori draws a word's
        // trailing colon as a word of its own ('Photo' then ':'), so the marker is the word without it.
        const marker = (words.credit ? (words.credit.split(' ')[0] ?? 'Photo') : (slide.range.split(' ')[0] ?? '').toUpperCase()).replace(/[^\p{L}\p{N}]+$/u, '')
        const bh = await fittedBand(f, 'cover', (h) => weekCoverElement(f, words, BLANK(f, h), 'band', foot, h), marker, 20)
        // The photograph runs from below the wordmark's navy strip to the band's end (D3), so it is cropped to that height.
        const photo = await bandPhoto(url, f, Math.max(1, bh - bandTop(f, 'cover')), image?.focal ?? standInOf(url)?.focal ?? null)
        return weekCoverElement(f, { ...words, credit: photo ? words.credit : null }, photo, 'band', foot, bh)
      }
      let photo = url ? await wholePhoto(url, f, 'cover') : null
      // The PM's 22:41 fix 5: the foot sits where it sits on every slide. Its home is where it sits with no photograph pushing
      // it; a framed photograph that pushes it lower is drawn smaller, whole and never cropped (law 15), by just as much as
      // it pushes, never under half its size (out-12's first draw shrank AMCF's to 0.43 against a floor the anchored foot
      // could never reach; the guard holds a cover still over).
      if (photo) {
        const fw = footWordOf(foot)
        const home = await footBottom(weekCoverElement(f, { ...words, lead: undefined }, null, 'whole', foot), f, fw)
        const full = photo.height
        for (let i = 0; i < 3 && photo; i++) {
          const now = await footBottom(weekCoverElement(f, words, photo, 'whole', foot), f, fw)
          if (now <= home + 2) break
          const height = Math.max(Math.round(full / 2), photo.height - Math.ceil(now - home) - 4)
          if (height >= photo.height) break
          photo = { ...photo, width: Math.round((photo.width * height) / photo.height), height }
        }
      }
      if (!photo && words.lead && words.lead.length > 0) {
        const s = await fittedScale(f, 1, (x) => weekCoverElement(f, words, null, 'whole', foot, undefined, x), footWordOf(foot))
        return weekCoverElement(f, words, null, 'whole', foot, undefined, s)
      }
      return weekCoverElement(f, { ...words, credit: photo ? words.credit : null }, photo, 'whole', foot)
    }
    case 'days': {
      const words = { day: slide.day, date: slide.date, rows: slide.rows, credit: url ? slide.credit : null }
      if (!url) {
        const s = await fittedScale(f, startScale(f, slide.rows.length), (x) => daysElement(f, words, null, foot, undefined, x), footWordOf(foot))
        return daysElement(f, words, null, foot, undefined, s)
      }
      const bh = await fittedBand(f, 'days', (h) => daysElement(f, words, BLANK(f, h), foot, h), slide.day.split(' ')[0] ?? '', 60)
      const photo = await bandPhoto(url, f, Math.max(1, bh - bandTop(f, 'days')), image?.focal ?? standInOf(url)?.focal ?? null)
      return daysElement(f, { ...words, credit: photo ? words.credit : null }, photo, foot, bh)
    }
    case 'feature': {
      const photo = url ? await wholePhoto(url, f, 'feature') : null
      return featureElement(f, { eyebrow: slide.eyebrow, title: slide.title, accent: slide.accent, chip: slide.chip, credit: photo ? slide.credit : null }, photo, foot)
    }
    case 'ask':
      return askElement(f, { count: slide.count, three: slide.three }, foot)
    case 'tonight': {
      // Family B, Tonight (master 01): a story; the band ends above the day line, read from the layout (law 22's contrast).
      const words = { eyebrow: slide.eyebrow, rows: slide.rows, tap: slide.tap, credit: url ? slide.credit : null }
      if (!url) return tonightElement(words, null)
      const marker = (slide.eyebrow.split(' ')[0] ?? '').toUpperCase().replace(/[^\p{L}\p{N}]+$/u, '')
      const at = marker ? await wordTop(tonightElement(words, BLANK('story', sizeOf('story').h), sizeOf('story').h), 'story', marker, 30) : null
      // A story's words stand high (the day line about a third down), so its band is never held longer than the room
      // above them: looked at 19 November 00:10, a floor of 18 percent ran the band under the day line at 1.1 to 1.
      const bh = Math.max(bandTop('story', 'days') + Math.round(sizeOf('story').h * 0.06), at === null ? Math.round(sizeOf('story').h * 0.3) : Math.round(at - 8))
      const photo = await bandPhoto(url, 'story', Math.max(1, bh - bandTop('story', 'days')), image?.focal ?? standInOf(url)?.focal ?? null)
      return tonightElement({ ...words, credit: photo ? words.credit : null }, photo, bh)
    }
    case 'free_week': {
      // Family B, the free week (master 02): on gold; the band ends above the range, read from the layout.
      const words = { range: slide.range, pill: slide.pill, count: slide.count, lines: slide.lines, rows: slide.rows, credit: url ? slide.credit : null }
      if (!url) return freeWeekElement(f, words, null)
      const marker = (slide.range.split(' ')[0] ?? '').toUpperCase().replace(/[^\p{L}\p{N}]+$/u, '')
      const at = marker ? await wordTop(freeWeekElement(f, words, BLANK(f, sizeOf(f).h), sizeOf(f).h), f, marker, 30 * scaleOf(f)) : null
      const bh = Math.max(bandTop(f, 'days') + Math.round(sizeOf(f).h * 0.18), at === null ? Math.round(sizeOf(f).h * 0.36) : Math.round(at - 60 * scaleOf(f)))
      const photo = await bandPhoto(url, f, Math.max(1, bh - bandTop(f, 'days')), image?.focal ?? standInOf(url)?.focal ?? null)
      return freeWeekElement(f, { ...words, credit: photo ? words.credit : null }, photo, bh)
    }
    case 'venue': {
      const words = { venue: slide.venue, eyebrow: slide.eyebrow, accent: slide.accent, rows: slide.rows, credit: url ? slide.credit : null }
      if (!url) {
        const s = await fittedScale(f, startScale(f, slide.rows.length), (x) => venueElement(f, words, null, foot, undefined, x), 'Send')
        return venueElement(f, words, null, foot, undefined, s)
      }
      // The band ends where the venue's name begins, as a day slide's ends at its heading (the PM's 00:45: the small gold
      // eyebrow now sits below the name on the solid panel; ending the band at the eyebrow ran it under the name, which
      // then read 1.2 to 1, screen 3). The name is the only word at 60 of a 1080 frame or more.
      const nameWord = (slide.venue.toUpperCase().split(' ')[0] ?? '').replace(/[^\p{L}\p{N}]+$/u, '')
      const bh = await fittedBand(f, 'venue', (h) => venueElement(f, words, BLANK(f, h), foot, h), nameWord, 60)
      const photo = await bandPhoto(url, f, Math.max(1, bh - bandTop(f, 'venue')), image?.focal ?? standInOf(url)?.focal ?? null)
      return venueElement(f, { ...words, credit: photo ? words.credit : null }, photo, foot, bh)
    }
    case 'file':
      // Lawal's approved file is never drawn: it is posted and shown from its own address on www (renderCampaignSlide).
      throw new Error('an approved file is never drawn; it is posted and shown from its own address')
  }
}
