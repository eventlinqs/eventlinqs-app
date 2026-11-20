/**
 * LAW 37, IMAGE FIRST, ORGANIC, NEVER AN ADVERT (Lawal, 20 November 2026, 11:21, locked at 11:24: 'This is the format
 * that works. Lock it in ... Both Instagram and Facebook ... I will never see that ever again'; the PM's 11:28, train AI).
 *
 * The photograph IS the post: a permitted photograph shown whole at its own shape (law 15), never boxed, framed or
 * cropped; no wordmark band, no badge, no call to action, no headline printed on it; the words live in the caption. A
 * story carries no caption (Meta's image story container takes image_url and media_type=STORIES and no caption,
 * developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media, read 20 November 2026), so
 * a story may carry at most one small line of fact beneath the photograph, never over it (the PM's 11:28, item 1).
 *
 * Every earlier family (boxed photo cards, wordmark bands, badges, printed calls to action, text only cards) is switched
 * OFF behind EARLIER_FAMILIES_ON (law 13: never deleted, so it can return only by Lawal's word): while it is false no
 * piece any of whose slides is not a whole photograph is approved, scheduled or published, through the one validation
 * pipeline (piece-quality.ts pieceQuality), and the guard law37-only.mjs holds that.
 */
import type { Slide } from './campaign'

/** Law 13: the earlier families stay in the code, off. Only Lawal's word turns them back on. */
export const EARLIER_FAMILIES_ON = false

/** The one slide of law 37's format. */
export const LAW37_SLIDE = 'photo' as const

/** Pure: why a piece's slides are not in law 37's format, or null when every slide is a permitted photograph shown whole. */
export function law37Refusal(slides: readonly Pick<Slide, 't'>[]): string | null {
  if (EARLIER_FAMILIES_ON) return null
  if (slides.length === 0) return "It has no slide, and law 37 posts only a permitted photograph shown whole."
  const other = slides.map((s, i) => ({ t: s.t, n: i + 1 })).filter((s) => s.t !== LAW37_SLIDE)
  if (other.length === 0) return null
  const which = other.map((s) => s.n).join(', ')
  const kinds = [...new Set(other.map((s) => s.t))].join(', ')
  return other.length === 1
    ? `It is not in law 37's format: slide ${which} is an earlier design (${kinds}), never posted again; only a permitted photograph shown whole posts.`
    : `It is not in law 37's format: slides ${which} are an earlier design (${kinds}), never posted again; only a permitted photograph shown whole posts.`
}

/** Instagram's feed bounds for a single image, 4:5 to 1.91:1, and its widest accepted width (Meta's ig-user/media reference). */
export const FEED_TALLEST = 4 / 5
export const FEED_WIDEST = 1.91
export const FEED_MAX_WIDTH = 1440
export const FEED_MIN_WIDTH = 320
export const STORY = { width: 1080, height: 1920 } as const

export type PhotoDrawn = {
  /** The image's own size. */
  readonly width: number
  readonly height: number
  /** Where the photograph sits inside it, whole. */
  readonly photo: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

/**
 * How a law 37 photograph is drawn, from its own size. Pure.
 * A feed image IS the photograph at its own shape and its own pixels (never upscaled past them, never cropped); only a
 * photograph taller than 4:5 or wider than 1.91:1 takes the nearest bound, the photograph whole inside it on a plain fill.
 * A story is 1080 by 1920 with the photograph whole across it, above the middle, leaving room beneath for one line.
 */
export function photoDrawnSize(format: 'feed' | 'story', source: { readonly width: number; readonly height: number }): PhotoDrawn {
  const sw = Math.max(1, Math.round(source.width))
  const sh = Math.max(1, Math.round(source.height))
  const a = sw / sh
  if (format === 'story') {
    const s = Math.min(STORY.width / sw, (STORY.height * 0.7) / sh)
    const width = Math.round(sw * s)
    const height = Math.round(sh * s)
    return { width: STORY.width, height: STORY.height, photo: { x: Math.round((STORY.width - width) / 2), y: Math.round((STORY.height - height) * 0.42), width, height } }
  }
  const aspect = Math.min(FEED_WIDEST, Math.max(FEED_TALLEST, a))
  // The canvas takes the photograph's width, held between Instagram's narrowest and widest.
  const canvasW = Math.min(FEED_MAX_WIDTH, Math.max(FEED_MIN_WIDTH, a >= aspect ? sw : Math.round(sh * aspect)))
  const canvasH = Math.round(canvasW / aspect)
  const s = Math.min(canvasW / sw, canvasH / sh)
  const width = Math.round(sw * s)
  const height = Math.round(sh * s)
  return { width: canvasW, height: canvasH, photo: { x: Math.round((canvasW - width) / 2), y: Math.round((canvasH - height) / 2), width, height } }
}
