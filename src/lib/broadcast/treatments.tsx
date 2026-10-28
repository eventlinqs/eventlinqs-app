/* eslint-disable @next/next/no-img-element -- satori rasterises this tree to a JPEG; next/image has no meaning there (as social-cards.tsx). */
import type React from 'react'
import { COMPRESSED_FAMILY, CONDENSED_FAMILY, DETAIL_FAMILY, DISPLAY_FAMILY } from '@/lib/broadcast/card-fonts'
import { faceMeasurer } from '@/lib/broadcast/card-metrics'
import { rasteriseCard } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS } from '@/lib/broadcast/social-card-spec'
import { GEOMETRY, GOLD, NAVY, scrimStops, type Face, type Layout, type Measurers, type TreatmentFormat } from '@/lib/broadcast/treatment-layout'
import { fetchImageBytes } from '@/lib/media/fetch-image'

/**
 * THE THREE TREATMENTS, DRAWN (treatment-layout.ts says what each is and why). This file only paints a measured
 * layout: every word, size and position comes from it, so what the tests hold is what is drawn. A photograph is
 * cropped to its box by sharp's attention strategy, which keeps the busiest, most saturated region (the people) in
 * frame; nothing in the photograph is altered, only cropped and scaled (Law 6: rendering, never generating).
 */

const FACES: Record<Face, { family: string; weight: 500 | 600 | 700 | 800 | 900; file: string }> = {
  condensed: { family: CONDENSED_FAMILY, weight: 800, file: 'ArchivoCondensed-Heavy.ttf' },
  compressed: { family: COMPRESSED_FAMILY, weight: 900, file: 'ArchivoCompressed-Black.ttf' },
  archivo: { family: DISPLAY_FAMILY, weight: 800, file: 'Archivo-ExtraBold.ttf' },
  manrope500: { family: DETAIL_FAMILY, weight: 500, file: 'Manrope-Medium.ttf' },
  manrope600: { family: DETAIL_FAMILY, weight: 600, file: 'Manrope-SemiBold.ttf' },
  manrope700: { family: DETAIL_FAMILY, weight: 700, file: 'Manrope-Bold.ttf' },
  manrope800: { family: DETAIL_FAMILY, weight: 800, file: 'Manrope-ExtraBold.ttf' },
}

/** Every face's measurer, read from the same files the drawing uses. */
export async function treatmentMeasurers(): Promise<Measurers> {
  const entries = await Promise.all((Object.keys(FACES) as Face[]).map(async (f) => [f, await faceMeasurer(FACES[f].file)] as const))
  return Object.fromEntries(entries) as Measurers
}

/** The raster each format is drawn at (social-card-spec.ts): the 4:5 portrait at 1440 x 1800, the others as designed. */
export const RASTER_OF: Record<TreatmentFormat, 'feed' | 'square' | 'story'> = { portrait: 'feed', square: 'square', story: 'story' }

/**
 * The photograph cropped to its box: around the focal point a person set on its register row, so the subject survives
 * every format's crop; with none, sharp's attention strategy (the busiest, most saturated region).
 */
async function cropped(url: string, w: number, h: number, focal: { x: number; y: number } | undefined): Promise<string | null> {
  const fetched = await fetchImageBytes(url)
  if (!fetched) return null
  const { default: sharp } = await import('sharp')
  const source = sharp(Buffer.from(fetched.bytes)).rotate()
  let out: Buffer
  if (focal) {
    const meta = await source.metadata()
    const sw = meta.autoOrient?.width ?? meta.width ?? 0
    const sh = meta.autoOrient?.height ?? meta.height ?? 0
    const cw = Math.min(sw, Math.round((sh * w) / h))
    const ch = Math.min(sh, Math.round((cw * h) / w))
    const left = Math.max(0, Math.min(sw - cw, Math.round(focal.x * sw - cw / 2)))
    const top = Math.max(0, Math.min(sh - ch, Math.round(focal.y * sh - ch / 2)))
    out = await source.extract({ left, top, width: cw, height: ch }).resize(w, h).jpeg({ quality: 90 }).toBuffer()
  } else {
    out = await source.resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 90 }).toBuffer()
  }
  return `data:image/jpeg;base64,${out.toString('base64')}`
}

/** The layout as the element satori draws, at the raster's own size. A photograph that cannot be read is a refusal. */
export async function drawLayout(l: Layout): Promise<React.ReactElement> {
  const spec = SOCIAL_CARD_FORMATS[RASTER_OF[l.format]]
  const k = spec.width / l.w
  const z = (n: number) => Math.round(n * k * 100) / 100
  const g = GEOMETRY[l.format]

  let photo: string | null = null
  if (l.photo) {
    photo = await cropped(l.photo.url, Math.round(l.photo.w * k), Math.round(l.photo.h * k), l.photo.focal)
    if (!photo) throw new Error('the approved photograph could not be read, so this slide is not drawn with it')
  }

  const background = l.ground
    ? `radial-gradient(circle at 85% 100%, ${l.ground.glow} 0%, ${l.ground.mid} 34%, ${l.ground.deep} 64%, ${NAVY} 100%)`
    : undefined
  const scrim = l.scrim
    ? `linear-gradient(180deg, ${scrimStops(g)
        .map((s) => `rgba(10,14,26,${s.alpha}) ${s.at}%`)
        .join(', ')})`
    : null

  return (
    <div style={{ display: 'flex', position: 'relative', width: spec.width, height: spec.height, overflow: 'hidden', backgroundColor: NAVY, ...(background ? { backgroundImage: background } : {}) }}>
      {photo && l.photo ? (
        <img src={photo} alt="" width={z(l.photo.w)} height={z(l.photo.h)} style={{ position: 'absolute', left: z(l.photo.x), top: z(l.photo.y) }} />
      ) : null}
      {scrim ? <div style={{ position: 'absolute', left: 0, top: 0, width: spec.width, height: spec.height, display: 'flex', backgroundImage: scrim }} /> : null}
      {l.art.map((a, i) => (
        <div
          key={`art${i}`}
          style={{
            position: 'absolute',
            left: z(a.cx - a.r),
            top: z(a.cy - a.r),
            width: z(2 * a.r),
            height: z(2 * a.r),
            borderRadius: 9999,
            display: 'flex',
            ...(a.kind === 'disc' ? { backgroundColor: a.color } : { border: `${z(a.stroke)}px solid ${a.color}` }),
          }}
        />
      ))}
      {l.blocks.map((b, i) => (
        <div key={`b${i}`} style={{ position: 'absolute', left: z(b.x), top: z(b.y), width: z(b.w), height: z(b.h), display: 'flex', backgroundColor: b.color, borderRadius: b.role === 'pill' ? 9999 : b.role === 'bar' ? z(22) : 0 }} />
      ))}
      {l.runs.map((r) => {
        const face = FACES[r.face]
        return (
          <div key={r.role} style={{ position: 'absolute', left: z(r.x), top: z(r.y), width: z(r.w), display: 'flex', flexDirection: 'column', alignItems: r.align === 'right' ? 'flex-end' : 'flex-start' }}>
            {r.lines.map((line, i) => (
              <div
                key={`${r.role}${i}`}
                style={{
                  display: 'flex',
                  fontFamily: face.family,
                  fontWeight: face.weight,
                  fontSize: z(r.size),
                  lineHeight: `${z(r.size * r.lineHeight)}px`,
                  height: z(r.size * r.lineHeight),
                  letterSpacing: z(r.letterSpacing * r.size),
                  color: r.color,
                  whiteSpace: 'nowrap',
                }}
              >
                {line}
                {r.role === 'wordmark' ? <span style={{ color: r.color === NAVY ? NAVY : GOLD }}>.</span> : null}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** The layout as the JPEG Instagram and Facebook take. */
export async function renderLayout(l: Layout): Promise<Uint8Array> {
  return rasteriseCard(RASTER_OF[l.format], await drawLayout(l))
}
