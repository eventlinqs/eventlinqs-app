import type React from 'react'
import { BODY_FAMILY, CONDENSED_FAMILY } from '@/lib/broadcast/card-fonts'
import { rasteriseCard } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS } from '@/lib/broadcast/social-card-spec'
import { layoutBrand, layoutFaults, layoutNight, layoutOffer, FitError, type Layout, type Measurers, type NightWords, type TreatmentFormat } from '@/lib/broadcast/treatment-layout'
import { drawLayout, treatmentMeasurers } from '@/lib/broadcast/treatments'
import type { Composition, Slide } from '@/lib/social/campaign'

/**
 * THE WEEKLY CAMPAIGN'S SLIDES (the release checklist of 28 October 2026, J7, S3; Lawal's final creative approval of
 * 28 October 19:52). A night, a partner's story, the organiser campaign and the brand piece are drawn in the three
 * approved treatments (treatment-layout.ts: A the organiser's own photograph, B editorial type, C EventLinqs' own art),
 * each laid out natively for the portrait feed, the square and the story. The contents cover, the programme and the
 * closing slide keep their slots, set in the treatments' condensed headline face.
 *
 * Each slide is drawn from its data alone, designed on the 1080 wide canvas the revised samples use and scaled to the
 * format's own published size (feed 1440 by 1800, story 1080 by 1920). The composition picks the accent; every label
 * is at least 28 px at 1080 so it reads at phone size; a story keeps its words between y 280 and 1240 (Instagram's own
 * buttons cover the rest); a photograph appears only when the slide carries one, which the planner sets only from an
 * approved rights row (J1 to J4). No QR code: a social post is tapped, never scanned.
 */

const NAVY = '#0A0E1A'
const NAVY2 = '#141B30'
const GOLD = '#E8B738'
const INK = '#F5F1E8'

/** The accent each composition takes; the looks themselves wait for Lawal's approval. */
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

/** Sizes at the 1080 design width, scaled to the format; the story's words sit between y 280 and 1240. */
function canvas(f: Format) {
  const spec = SOCIAL_CARD_FORMATS[f]
  const k = spec.width / 1080
  const z = (n: number) => Math.round(n * k)
  const top = f === 'story' ? 200 : 60
  const bottom = f === 'story' ? 1920 - 1240 : 84
  return { w: spec.width, h: spec.height, z, top: z(top), bottom: z(bottom) }
}
type Canvas = ReturnType<typeof canvas>

const display = (c: Canvas, px: number, color = INK): React.CSSProperties => ({ fontFamily: CONDENSED_FAMILY, fontWeight: 800, fontSize: c.z(px), lineHeight: 0.98, color, letterSpacing: -1 })
const body = (c: Canvas, px: number, color = INK, weight = 500): React.CSSProperties => ({ fontFamily: BODY_FAMILY, fontWeight: weight, fontSize: c.z(px), lineHeight: 1.3, color })

function Mast({ c, label, dark = true }: { c: Canvas; label: string | null; dark?: boolean }) {
  const colour = dark ? INK : NAVY
  return (
    <div style={{ position: 'absolute', left: c.z(72), right: c.z(72), top: c.top, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', ...display(c, 30, colour), letterSpacing: 2 }}>
        EVENTLINQS<span style={{ color: dark ? GOLD : NAVY }}>.</span>
      </div>
      {label ? <div style={{ display: 'flex', ...body(c, 28, colour, 600), letterSpacing: 2 }}>{label.toUpperCase()}</div> : null}
    </div>
  )
}

function Chip({ c, text, accent }: { c: Canvas; text: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignSelf: 'flex-start', ...body(c, 29, NAVY, 700), background: accent, borderRadius: 999, padding: `${c.z(12)}px ${c.z(22)}px`, letterSpacing: 2 }}>
      {text.toUpperCase()}
    </div>
  )
}

function Frame({ c, children, background = NAVY }: { c: Canvas; children: React.ReactNode; background?: string }) {
  return <div style={{ display: 'flex', position: 'relative', width: c.w, height: c.h, background, overflow: 'hidden' }}>{children}</div>
}

function Body({ c, children, top }: { c: Canvas; children: React.ReactNode; top?: boolean }) {
  const at: React.CSSProperties = top ? { top: c.top + c.z(140) } : { bottom: c.bottom }
  return <div style={{ position: 'absolute', left: c.z(72), right: c.z(72), display: 'flex', flexDirection: 'column', gap: c.z(18), ...at }}>{children}</div>
}

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
 * The slide's treatment layout at a format, or null for the slots that keep their own drawing (cover, programme, end).
 * `image` is the register's row NOW: a slide whose image has gone since it was planned is laid out in type.
 */
export function layoutOfSlide(f: Format, slide: Slide, image: SlideImage | null, m: Measurers): Layout | null {
  const tf = TREATMENT_FORMAT[f]
  const photo = image && 'photo' in slide && slide.photo === image.url ? image.url : null
  let layout: Layout | null = null
  if (slide.t === 'night' || slide.t === 'story') layout = layoutNight(tf, wordsOf(slide, photo), m)
  else if (slide.t === 'offer') layout = layoutOffer(tf, { eyebrow: slide.eyebrow, headline: slide.headline, points: slide.points, url: slide.url }, m)
  else if (slide.t === 'brand') layout = layoutBrand(tf, { headline: slide.headline, line: slide.line, action: slide.action, label: 'eventlinqs.com.au', photo, credit: photo ? slide.credit : null }, m)
  if (layout?.photo && image?.focal) layout = { ...layout, photo: { ...layout.photo, focal: image.focal } }
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
 * The directive's section 7, before approval: every treatment slide of a piece, at every format it is made in, has
 * every word inside its box, the safe area and the margins, at a size that reads on a phone and with its contrast,
 * nothing overlapping, and its photograph at a resolution that holds. Each failure is said, with the slide and format.
 */
export async function visualFaults(slides: readonly Slide[], pieceFormat: 'feed' | 'story', images: ReadonlyMap<number, SlideImage | null>): Promise<string[]> {
  const m = await treatmentMeasurers()
  const faults: string[] = []
  for (const f of formatsOf(pieceFormat)) {
    slides.forEach((slide, i) => {
      const where = `Slide ${i + 1} (${f === 'feed' ? 'portrait' : f})`
      let layout: Layout | null
      try {
        layout = layoutOfSlide(f, slide, images.get(i) ?? null, m)
      } catch (error) {
        if (error instanceof FitError) {
          faults.push(`${where}: ${error.message}.`)
          return
        }
        throw error
      }
      if (!layout) return
      for (const fault of layoutFaults(layout, m)) faults.push(`${where}: ${fault}.`)
      const image = images.get(i)
      const k = layout && image ? enlargement(layout, image) : null
      if (k !== null && k > MAX_ENLARGEMENT) faults.push(`${where}: the photograph is enlarged ${k.toFixed(2)} times to fill its box; ask its owner for the original file.`)
    })
  }
  return faults
}

/** One slide of a piece as its element: a treatment's measured layout, or the composition's slots. */
export async function buildCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null, image: SlideImage | null = null): Promise<React.ReactElement> {
  const layout = layoutOfSlide(f, slide, image, await treatmentMeasurers())
  if (layout) return drawLayout(layout)
  const c = canvas(f)
  const count = `${n}/${total}`
  switch (slide.t) {
    case 'cover':
      return (
        <Frame c={c}>
          <Mast c={c} label={label ?? count} />
          <Body c={c}>
            <Chip c={c} text={slide.chip} accent={ACCENT.contents_cover} />
            <div style={{ display: 'flex', ...display(c, 96) }}>{slide.headline}</div>
            <div style={{ display: 'flex', ...body(c, 36) }}>{slide.line}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: c.z(8), marginTop: c.z(12) }}>
              {slide.contents.map((line) => (
                <div key={line} style={{ display: 'flex', ...body(c, 30, INK, 600) }}>
                  <span style={{ color: GOLD, width: c.z(96) }}>{line.split(' ')[0]}</span>
                  <span style={{ display: 'flex', flex: 1 }}>{line.split(' ').slice(1).join(' ')}</span>
                </div>
              ))}
            </div>
          </Body>
        </Frame>
      )
    case 'programme':
      return (
        <Frame c={c} background={NAVY2}>
          <Mast c={c} label={label ?? count} />
          <Body c={c} top>
            <div style={{ display: 'flex', ...body(c, 30, ACCENT.venue_spotlight, 700), letterSpacing: 2 }}>{slide.heading.toUpperCase()}</div>
            {slide.rows.map((r) => (
              <div key={`${r.day}${r.title}`} style={{ display: 'flex', gap: c.z(36), paddingTop: c.z(28), paddingBottom: c.z(28), borderBottom: '2px solid rgba(245,241,232,0.22)' }}>
                <div style={{ display: 'flex', width: c.z(200), ...display(c, 72, ACCENT.venue_spotlight) }}>{r.day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: c.z(8), flex: 1 }}>
                  <div style={{ display: 'flex', ...display(c, 48) }}>{r.title}</div>
                  <div style={{ display: 'flex', ...body(c, 30) }}>{r.meta}</div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', ...body(c, 32, INK, 600), marginTop: c.z(24) }}>{slide.address}</div>
          </Body>
        </Frame>
      )
    case 'end':
      return (
        <Frame c={c} background={GOLD}>
          <Mast c={c} label={label ?? count} dark={false} />
          <Body c={c}>
            <div style={{ display: 'flex', ...display(c, 110, NAVY) }}>{slide.headline}</div>
            <div style={{ display: 'flex', ...body(c, 36, NAVY, 700) }}>{slide.line}</div>
            <div style={{ display: 'flex', ...display(c, 40, NAVY) }}>{slide.url}</div>
            {slide.foot ? <div style={{ display: 'flex', ...body(c, 30, NAVY, 600), opacity: 0.8 }}>{slide.foot}</div> : null}
          </Body>
        </Frame>
      )
    default:
      throw new Error(`no drawing for a ${slide.t} slide`)
  }
}

/** The slide as the JPEG Instagram and Facebook take, at the format's published size. */
export async function renderCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null, image: SlideImage | null = null): Promise<Uint8Array> {
  return rasteriseCard(f, await buildCampaignSlide(f, slide, n, total, label, image))
}
