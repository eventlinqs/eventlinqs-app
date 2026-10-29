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
import type { Composition, Slide } from '@/lib/social/campaign'

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
    label: 'eventlinqs.com.au',
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
export function layoutOfSlide(f: Format, slide: Slide, image: SlideImage | null, m: Measurers, count: string | null = null): Layout {
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
    slides.forEach((slide, i) => {
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

/** One slide of a piece as its element: its measured layout, drawn. */
export async function buildCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null, image: SlideImage | null = null): Promise<React.ReactElement> {
  return drawLayout(layoutOfSlide(f, slide, image, await treatmentMeasurers(), label ?? (total > 1 ? `${n}/${total}` : null)))
}

/** The slide as the JPEG Instagram and Facebook take, at the format's published size. */
export async function renderCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null, image: SlideImage | null = null): Promise<Uint8Array> {
  return rasteriseCard(f, await buildCampaignSlide(f, slide, n, total, label, image))
}
