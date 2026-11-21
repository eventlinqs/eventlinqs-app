/**
 * THE NEWSLETTER'S COMPOSED IMAGES (law 46; Lawal's design A of 21 November 2026, its composer
 * C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on\compose.py, ported kind by kind: the same sizes, crops and navy fades, the
 * gold corner on the hero). Rendering only (law 6): a photograph is cropped, scaled and given a navy wash at an edge so
 * the type over it reads; nothing is added to or taken from what it shows, and the event page's own photograph is used
 * whole wherever a slot shows it as a picture (the phone's featured image keeps its full width).
 *
 * The plan of each kind is data (NL_IMAGE_KINDS, pure, tested); composeNewsletterImage draws it with sharp. A source the
 * newsletter may draw from is ours (our storage's public objects, our own site's images) or a licensed library's
 * (images.unsplash.com, under the Unsplash License: https://unsplash.com/license), never any other host.
 */
export type NlImageKind = 'hero-d' | 'hero-m' | 'feat-d' | 'feat-m' | 'card'

type Fade =
  /** Navy, full at x0 and before, clear at x1 and after, a smooth step between (compose.py hfade). */
  | { readonly t: 'h'; readonly x0: number; readonly x1: number; readonly k?: number }
  /** Navy, full at y0 and above, clear at y1 and below, (1 - t)^1.5 between (compose.py vfade). */
  | { readonly t: 'v'; readonly y0: number; readonly y1: number; readonly k?: number }
  /** Navy rising from clear at start (a share of the height) to max at the bottom, t^1.2 (compose.py bottom_grad). */
  | { readonly t: 'b'; readonly start: number; readonly max: number }

export type NlImagePlan = {
  readonly w: number
  readonly h: number
  /** Where the photograph sits on the navy canvas, and its focus for the crop. */
  readonly photo: { readonly w: number; readonly h: number; readonly x: number; readonly y: number; readonly fx: number; readonly fy: number }
  readonly fades: readonly Fade[]
  /** The gold corner's side, or 0. */
  readonly corner: number
}

export const NL_IMAGE_KINDS: Readonly<Record<NlImageKind, NlImagePlan>> = {
  'hero-d': { w: 1200, h: 560, photo: { w: 1200, h: 560, x: 0, y: 0, fx: 0.5, fy: 0.6 }, fades: [{ t: 'h', x0: 400, x1: 860 }, { t: 'v', y0: 0, y1: 120, k: 0.55 }], corner: 150 },
  'hero-m': { w: 780, h: 1040, photo: { w: 780, h: 640, x: 0, y: 400, fx: 0.55, fy: 0.6 }, fades: [{ t: 'v', y0: 400, y1: 710 }], corner: 120 },
  'feat-d': { w: 1184, h: 920, photo: { w: 900, h: 920, x: 284, y: 0, fx: 0.6, fy: 0.5 }, fades: [{ t: 'h', x0: 520, x1: 900 }], corner: 0 },
  'feat-m': { w: 780, h: 520, photo: { w: 780, h: 520, x: 0, y: 0, fx: 0.5, fy: 0.45 }, fades: [{ t: 'b', start: 0.55, max: 255 }], corner: 0 },
  card: { w: 600, h: 380, photo: { w: 600, h: 380, x: 0, y: 0, fx: 0.5, fy: 0.5 }, fades: [{ t: 'b', start: 0.3, max: 235 }], corner: 0 },
}

export const isNlImageKind = (k: string | null): k is NlImageKind => k !== null && Object.prototype.hasOwnProperty.call(NL_IMAGE_KINDS, k)

const NAVY = '#0A1628'
const GOLD = '#E8B738'
const STEPS = 12

/** The fades as one SVG of navy gradients over the canvas (pure). */
export function fadesSvg(plan: NlImagePlan): string {
  const { w, h } = plan
  const defs: string[] = []
  const rects: string[] = []
  plan.fades.forEach((f, i) => {
    const id = `f${i}`
    const stops: string[] = []
    const k = 'k' in f && f.k !== undefined ? f.k : 1
    for (let s = 0; s <= STEPS; s += 1) {
      const t = s / STEPS
      let offset: number
      let alpha: number
      if (f.t === 'h') {
        offset = (f.x0 + t * (f.x1 - f.x0)) / w
        alpha = 1 - t * t * (3 - 2 * t)
      } else if (f.t === 'v') {
        offset = (f.y0 + t * (f.y1 - f.y0)) / h
        alpha = Math.pow(1 - t, 1.5)
      } else {
        offset = f.start + t * (1 - f.start)
        alpha = (f.max / 255) * Math.pow(t, 1.2)
      }
      stops.push(`<stop offset="${offset.toFixed(4)}" stop-color="${NAVY}" stop-opacity="${(alpha * k).toFixed(4)}"/>`)
    }
    const dir = f.t === 'h' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"'
    // Beyond the first stop the gradient holds its end colour: full navy before a fade, clear after it.
    defs.push(`<linearGradient id="${id}" ${dir}>${stops.join('')}</linearGradient>`)
    rects.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id})"/>`)
  })
  const corner = plan.corner > 0 ? `<polygon points="${w},${h - plan.corner} ${w},${h} ${w - plan.corner},${h}" fill="${GOLD}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs.join('')}</defs>${rects.join('')}${corner}</svg>`
}

/** May the newsletter draw from this address? Ours, or the licensed library's; https only. */
export function isNewsletterImageSource(raw: string, opts: { readonly storageOrigin: string | null; readonly siteHosts: readonly string[] }): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  if (u.hostname === 'images.unsplash.com') return true
  if (opts.siteHosts.includes(u.hostname)) return u.pathname.startsWith('/images/')
  if (opts.storageOrigin) {
    const s = new URL(opts.storageOrigin)
    return u.host === s.host && u.pathname.startsWith('/storage/v1/object/public/')
  }
  return false
}

/** The kind drawn from a photograph's bytes; with no bytes, the navy canvas and its corner alone. */
export async function composeNewsletterImage(kind: NlImageKind, bytes: Uint8Array | null): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const plan = NL_IMAGE_KINDS[kind]
  const layers: { input: Buffer; left: number; top: number }[] = []
  if (bytes) {
    const p = plan.photo
    const img = sharp(Buffer.from(bytes)).rotate()
    const meta = await img.metadata()
    const sw = meta.width ?? p.w
    const sh = meta.height ?? p.h
    // Cover: scale until both sides fill, then cut at the focus (compose.py cover).
    const r = Math.max(p.w / sw, p.h / sh)
    const rw = Math.max(p.w, Math.ceil(sw * r))
    const rh = Math.max(p.h, Math.ceil(sh * r))
    const left = Math.min(rw - p.w, Math.max(0, Math.floor((rw - p.w) * p.fx)))
    const top = Math.min(rh - p.h, Math.max(0, Math.floor((rh - p.h) * p.fy)))
    const photo = await img.resize(rw, rh).extract({ left, top, width: p.w, height: p.h }).toBuffer()
    layers.push({ input: photo, left: p.x, top: p.y })
  }
  layers.push({ input: Buffer.from(fadesSvg(plan)), left: 0, top: 0 })
  return sharp({ create: { width: plan.w, height: plan.h, channels: 3, background: NAVY } })
    .composite(layers)
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer()
}
