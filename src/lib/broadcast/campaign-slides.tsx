/* eslint-disable @next/next/no-img-element -- satori rasterises this tree to a JPEG; next/image has no meaning there (as social-cards.tsx). */
import type React from 'react'
import { BODY_FAMILY, DISPLAY_FAMILY } from '@/lib/broadcast/card-fonts'
import { prepareCardCover, rasteriseCard } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS } from '@/lib/broadcast/social-card-spec'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import type { Composition, Slide } from '@/lib/social/campaign'

/**
 * THE WEEKLY CAMPAIGN'S SLIDES, AS SLOTS (the release checklist of 28 October 2026, J7; the project manager's 14:08:
 * "build the slots, not the looks" until Lawal approves the revised compositions in C:\dev\EVIDENCE\SOCIAL-V2-28OCT).
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

type Format = 'feed' | 'story'

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

const display = (c: Canvas, px: number, color = INK): React.CSSProperties => ({ fontFamily: DISPLAY_FAMILY, fontWeight: 800, fontSize: c.z(px), lineHeight: 0.98, color, letterSpacing: -1 })
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

async function photoOf(url: string | null, f: Format): Promise<string | null> {
  if (!url) return null
  const fetched = await fetchImageBytes(url)
  if (!fetched) return null
  const prepared = await prepareCardCover(fetched.bytes, f)
  return prepared?.image ?? null
}

/** One slide of a piece as its element: the composition's slots filled from the slide's own words. */
export async function buildCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null): Promise<React.ReactElement> {
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
    case 'night':
    case 'story': {
      const accent = ACCENT[slide.composition]
      const photo = await photoOf(slide.photo, f)
      return (
        <Frame c={c}>
          {photo ? <img src={photo} alt="" width={c.w} height={c.h} style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} /> : null}
          {photo ? (
            <div style={{ position: 'absolute', left: 0, top: 0, width: c.w, height: c.h, display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(10,14,26,0.45) 0%, rgba(10,14,26,0.1) 30%, rgba(10,14,26,0.85) 62%, rgba(10,14,26,0.97) 100%)' }} />
          ) : (
            <div style={{ position: 'absolute', left: c.z(60), top: c.top + c.z(90), display: 'flex', ...display(c, f === 'story' ? 300 : 250, accent), opacity: 0.95 }}>
              {slide.t === 'night' ? slide.day : slide.when.split(' ')[0].toUpperCase()}
            </div>
          )}
          <Mast c={c} label={slide.t === 'story' ? null : (label ?? count)} />
          <Body c={c}>
            {slide.chip ? <Chip c={c} text={slide.chip} accent={accent} /> : null}
            <div style={{ display: 'flex', ...body(c, 34, accent, 700), letterSpacing: 1 }}>{slide.when.toUpperCase()}</div>
            <div style={{ display: 'flex', ...display(c, slide.title.length > 34 ? 72 : 88) }}>{slide.title}</div>
            <div style={{ display: 'flex', ...body(c, 32, INK, 600) }}>{slide.meta}</div>
            {slide.t === 'night' && slide.why ? <div style={{ display: 'flex', ...body(c, 30) }}>{slide.why}</div> : null}
            {slide.t === 'story' ? (
              <div style={{ display: 'flex', alignSelf: 'flex-start', ...body(c, 28, INK, 700), border: `2px dashed ${INK}`, borderRadius: c.z(14), padding: `${c.z(16)}px ${c.z(24)}px`, marginTop: c.z(16) }}>{slide.sticker}</div>
            ) : null}
          </Body>
          {photo && slide.credit ? (
            <div style={{ position: 'absolute', right: c.z(40), bottom: f === 'story' ? c.bottom - c.z(40) : c.z(28), display: 'flex', ...body(c, 28, INK, 500), opacity: 0.8 }}>{`Photo: ${slide.credit}`}</div>
          ) : null}
        </Frame>
      )
    }
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
    case 'offer':
      return (
        <Frame c={c} background={GOLD}>
          <Mast c={c} label={label} dark={false} />
          <Body c={c}>
            <div style={{ display: 'flex', ...body(c, 30, NAVY, 700), letterSpacing: 2 }}>{slide.eyebrow.toUpperCase()}</div>
            <div style={{ display: 'flex', ...display(c, 100, NAVY) }}>{slide.headline}</div>
            {slide.points.map((p, i) => (
              <div key={p} style={{ display: 'flex', gap: c.z(24) }}>
                <div style={{ display: 'flex', width: c.z(44), ...display(c, 40, NAVY) }}>{String(i + 1)}</div>
                <div style={{ display: 'flex', flex: 1, ...body(c, 36, NAVY, 600) }}>{p}</div>
              </div>
            ))}
            <div style={{ display: 'flex', ...display(c, 42, NAVY), marginTop: c.z(16) }}>{slide.url}</div>
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
  }
}

/** The slide as the JPEG Instagram and Facebook take, at the format's published size. */
export async function renderCampaignSlide(f: Format, slide: Slide, n: number, total: number, label: string | null): Promise<Uint8Array> {
  return rasteriseCard(f, await buildCampaignSlide(f, slide, n, total, label))
}
