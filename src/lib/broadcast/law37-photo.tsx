import type React from 'react'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { rasteriseCard } from '@/lib/broadcast/social-cards'
import { BODY_FAMILY } from '@/lib/broadcast/card-fonts'
import { photoDrawnSize, STORY } from '@/lib/social/law37'
import type { Slide } from '@/lib/social/campaign'

/**
 * LAW 37'S ONE SLIDE, DRAWN (Lawal, 20 November 2026, 11:24, locked; src/lib/social/law37.ts). The permitted photograph is
 * the post: whole at its own shape and its own pixels, nothing printed on it (law 15, law 37 (a) to (c)). A feed image is
 * the photograph itself; only a photograph outside Instagram's 4:5 to 1.91:1 takes the nearest bound on the plain brand
 * ground. A story is the photograph whole across 1080 by 1920 on the same ground, with at most one small line of fact
 * beneath it, never over it (a story carries no caption). The ground and the line's cream are the cards' own (day-cards.ts
 * NAVY and CREAM); no new colour.
 */
export const PHOTO_GROUND = '#0A1628'
const LINE_INK = '#FBF4DC'

type PhotoSlide = Extract<Slide, { t: 'photo' }>

export async function drawLaw37Photo(format: 'feed' | 'square' | 'story', slide: PhotoSlide, image: { readonly url: string } | null): Promise<Uint8Array> {
  // Only the register's permitted image, as it stands now, for this very photograph (store.ts slideImagesNow); a
  // photograph whose permission has gone is never drawn.
  if (!image || image.url !== slide.photo) throw new Error(`the photograph of ${slide.eventId} is not permitted now, so it is not drawn`)
  const fetched = await fetchImageBytes(slide.photo)
  if (!fetched) throw new Error(`the photograph of ${slide.eventId} could not be read`)
  const { default: sharp } = await import('sharp')
  const source = sharp(Buffer.from(fetched.bytes)).rotate()
  const meta = await source.metadata()
  const sw = meta.autoOrient?.width ?? meta.width ?? 0
  const sh = meta.autoOrient?.height ?? meta.height ?? 0
  if (!sw || !sh) throw new Error(`the photograph of ${slide.eventId} has no size`)
  const f = format === 'story' ? 'story' : 'feed'
  const d = photoDrawnSize(f, { width: sw, height: sh })
  const photo = await source.resize(d.photo.width, d.photo.height, { fit: 'fill' }).jpeg({ quality: 90 }).toBuffer()
  if (f === 'feed') {
    if (d.width === d.photo.width && d.height === d.photo.height) return new Uint8Array(photo)
    const placed = await sharp({ create: { width: d.width, height: d.height, channels: 3, background: PHOTO_GROUND } })
      .composite([{ input: photo, left: d.photo.x, top: d.photo.y }])
      .jpeg({ quality: 90 })
      .toBuffer()
    return new Uint8Array(placed)
  }
  // THE STORY'S FRAME IS THE SAME PHOTOGRAPH, scaled to fill 9:16 and blurred, behind the photograph whole (the PM's 14:00
  // of 20 November 2026: a landscape photo across an empty navy frame reads as a placeholder; this is how Instagram itself
  // fills a landscape photo shared to a story). The photograph itself is never cropped or covered (law 15).
  const frame = await sharp(Buffer.from(fetched.bytes))
    .rotate()
    .resize(STORY.width, STORY.height, { fit: 'cover' })
    .blur(36)
    .jpeg({ quality: 80 })
    .toBuffer()
  const element: React.ReactElement = (
    <div style={{ width: STORY.width, height: STORY.height, display: 'flex', position: 'relative', background: PHOTO_GROUND }}>
      {/* satori draws an img by its data URI at the size given: the blurred frame, then the photograph whole. */}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={`data:image/jpeg;base64,${frame.toString('base64')}`} width={STORY.width} height={STORY.height} style={{ position: 'absolute', left: 0, top: 0 }} />
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={`data:image/jpeg;base64,${photo.toString('base64')}`} width={d.photo.width} height={d.photo.height} style={{ position: 'absolute', left: d.photo.x, top: d.photo.y }} />
      {slide.line ? (
        <div
          style={{
            position: 'absolute',
            left: 72,
            right: 72,
            top: d.photo.y + d.photo.height + 64,
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center',
            color: LINE_INK,
            fontFamily: BODY_FAMILY,
            fontWeight: 600,
            fontSize: 46,
            lineHeight: 1.25,
            // Readable on the blurred photograph behind it, as a story's own text is; nothing lies over the photograph.
            textShadow: '0 2px 14px rgba(0, 0, 0, 0.7)',
          }}
        >
          {slide.line}
        </div>
      ) : null}
    </div>
  )
  return rasteriseCard('story', element)
}
