import type React from 'react'
import { loadCardFonts } from '@/lib/broadcast/card-fonts'
import { cardPixels, cardSvgWithText, svgPixels, type RasterFont } from '@/lib/broadcast/card-raster'
import { SAFE, sizeOf, type DayFormat, type El } from '@/lib/broadcast/day-cards'

/**
 * THE TEXT GUARD OF THE LOCKED LOOK (WINDOW 6's textGuard in locked-look-4.ts, the PM's 08:40 round 2 and 09:10 fixes of
 * 15 November 2026), held to every locked slide before a person may approve it, at every format it is made in:
 *  - every word inside the frame, and on a story outside Instagram's own 250 px rows at its top and foot;
 *  - no two words of different blocks overlapping;
 *  - no block's last line holding one word alone;
 *  - each word's contrast against what lies behind it (WCAG 2.2, 1.4.3: 3 to 1 at 52 px of a 1080 frame or more, else
 *    4.5 to 1), read from the slide drawn with its words taken out; a credit drawn with its own shadow is a mark on a
 *    photograph, kept small at the edge as the PM's 09:10 ruled, and is not read against the bare photograph;
 *  - bare ground under a tenth of the frame (rows of nothing but the ground's colour, in runs of 100 px of a 1080 frame);
 *  - no line of a name ending on v, vs, &, and, at, with or a number (the PM's 18:45 fix 4: 'Australia v / England');
 *  - no card stretched past its content (the PM's 18:45 fix 4: two cards 550 px tall around a small block of words).
 * Each fault is said in words a person can act on.
 */
type Word = { group: number; x: number; top: number; bottom: number; right: number; text: string; base: number; size: number; fill: string; shadowed: boolean; family: string }

const lum = (r: number, g: number, b: number) => {
  const c = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

const parseFill = (s: string): [number, number, number, number] | null => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const v = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 1]
  }
  const rgb = /^rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(s)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])] : null
}

let fontsOnce: Promise<RasterFont[]> | null = null
export const cardFonts = (): Promise<RasterFont[]> => fonts()
const fonts = () => (fontsOnce ??= loadCardFonts().then((fs) => fs.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style }))))

/** The words of a drawn slide, each with its box, its size, its colour and whether it carries a shadow. */
function wordsOf(svg: string): Word[] {
  const words: Word[] = []
  let group = -1
  const tok = /<mask id="satori_om-id-(\d+)">|(<g filter="url\(#[^)"]+\)">)?<text x="([\d.\-e]+)" y="([\d.\-e]+)" width="([\d.\-e]+)" height="([\d.\-e]+)"([^>]*)>([^<]*)<\/text>/g
  let m: RegExpExecArray | null
  while ((m = tok.exec(svg)) !== null) {
    if (m[1] !== undefined) {
      group = Number(m[1])
      continue
    }
    const word = m[8]
    if (!word.trim()) continue
    const x = Number(m[3])
    const base = Number(m[4])
    const ww = Number(m[5])
    const size = Number(/font-size="([\d.]+)"/.exec(m[7])?.[1] ?? 0)
    const fill = /fill="([^"]+)"/.exec(m[7])?.[1] ?? ''
    const family = /font-family="([^"]+)"/.exec(m[7])?.[1] ?? ''
    const desc = /[gjpqy,;()]/.test(word)
    words.push({ group: group * 1000 + Math.round(size), x, base, right: x + ww, top: base - size * 0.76, bottom: base + size * (desc ? 0.24 : 0.04), text: word, size, fill, shadowed: Boolean(m[2]), family })
  }
  return words
}

/**
 * Where a word begins on the drawn slide (satori's own layout): the top of the first word `word` drawn at `minSize` or
 * more, or null. A band is ended there, so no dead navy lies between its fade and the words (the PM's 17:40 fix 2).
 */
export async function wordTop(el: El, f: DayFormat, word: string, minSize: number): Promise<number | null> {
  const { w, h: H } = sizeOf(f)
  const svg = await cardSvgWithText(el as unknown as React.ReactNode, { width: w, height: H, fonts: await fonts() })
  const hit = wordsOf(svg).find((x) => x.text === word && x.size >= minSize)
  return hit ? hit.top : null
}

/** A gold timed card (a gold border) set to grow past its content: the element tree read, never a guess from pixels. */
function stretchedCards(el: El | string | null | undefined): number {
  if (!el || typeof el === 'string') return 0
  const style = (el.props.style ?? {}) as Record<string, unknown>
  const own = typeof style.border === 'string' && style.border.includes('#E8B738') && Number(style.flexGrow ?? 0) > 0 ? 1 : 0
  const kids = el.props.children
  const list = Array.isArray(kids) ? kids : [kids]
  return own + list.reduce((a: number, k) => a + stretchedCards(k as El | string | null), 0)
}

/**
 * The room left above a slide's foot (the PM's 19:45 fix 3: spare room falls at the foot): the top of the foot's first
 * word (`footWord`), or the frame's own foot, less the bottom of the lowest word above it. Read from satori's own layout.
 */
export async function spareAboveFoot(el: El, f: DayFormat, footWord: string | null, floor: number): Promise<number> {
  const { w, h: H } = sizeOf(f)
  const words = wordsOf(await cardSvgWithText(el as unknown as React.ReactNode, { width: w, height: H, fonts: await fonts() }))
  const foot = footWord ? words.filter((x) => x.text === footWord || x.text.startsWith(`${footWord}\u00A0`)).sort((p, q) => q.top - p.top)[0] : undefined
  // A foot pushed past the frame's own floor means the slide overflows: no room, and how far over.
  if (foot && foot.bottom > floor + 2) return floor - foot.bottom
  const lowest = Math.max(0, ...words.map((x) => x.bottom))
  if (!foot && lowest > floor + 2) return floor - lowest
  const limit = foot ? foot.top : floor
  const above = words.filter((x) => x.bottom < limit - 1)
  return limit - Math.max(0, ...above.map((x) => x.bottom))
}

export async function lockedSlideFaults(el: El, f: DayFormat): Promise<string[]> {
  const { w, h: H } = sizeOf(f)
  const stretched = stretchedCards(el)
  const fs = await fonts()
  const svg = await cardSvgWithText(el as unknown as React.ReactNode, { width: w, height: H, fonts: fs })
  const words = wordsOf(svg)
  const faults: string[] = []
  const say = (s: string) => {
    if (!faults.includes(s)) faults.push(s)
  }
  if (stretched > 0) say(`${stretched} card(s) stretched past their content`)
  for (const wd of words) {
    if (wd.x < -1 || wd.right > w + 1 || wd.top < -1 || wd.bottom > H + 1) say(`"${wd.text}" leaves the frame`)
    if (f === 'story' && (wd.top < SAFE - 1 || wd.bottom > H - SAFE + 1)) say(`"${wd.text}" lies in a story's safe area`)
  }
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i]
      const b = words[j]
      if (a.group === b.group) continue
      const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x)
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ix > 2 && iy > 2) say(`"${a.text}" and "${b.text}" overlap`)
    }
  }
  const groups = new Map<number, Word[]>()
  for (const wd of words) groups.set(wd.group, [...(groups.get(wd.group) ?? []), wd])
  for (const ws of groups.values()) {
    const lines = new Map<number, Word[]>()
    for (const wd of ws) {
      const key = Math.round(wd.base)
      lines.set(key, [...(lines.get(key) ?? []), wd])
    }
    const ordered = [...lines.entries()].sort((p, q) => p[0] - q[0])
    for (let li = 0; li < ordered.length - 1; li++) {
      const row = [...ordered[li][1]].sort((p, q) => p.x - q.x)
      const end = row[row.length - 1]?.text.split(/\s|\u00A0/).pop() ?? ''
      // A break only where the next line of the same block follows straight on.
      // A number counts in a name (the cards' Hanken titles), never in a date label ('FRI 20' / 'TO SUN 22').
      const name = /hanken/i.test(row[row.length - 1]?.family ?? '')
      if (ordered[li + 1][0] - ordered[li][0] <= 1.6 * ws[0].size && (/^(v|vs|&|and|at|with)$/i.test(end) || (name && /^\d[\d.,:]*$/.test(end)))) say(`a name breaks after "${end}" ("${row.map((x) => x.text).join(' ').slice(0, 40)}")`)
      // The PM's 19:45 fix 2: never inside a run of capitalised words ('Melbourne United vs New / Zealand Breakers').
      const next = [...ordered[li + 1][1]].sort((p, q) => p.x - q.x)[0]?.text.split(/\s|\u00A0/)[0] ?? ''
      const named = /hanken/i.test(row[row.length - 1]?.family ?? '')
      if (named && ordered[li + 1][0] - ordered[li][0] <= 1.6 * ws[0].size && /^[A-Z]/.test(end) && !/[,:;.]$/.test(end) && /^[A-Z0-9]/.test(next) && !/^[A-Z0-9]+$/.test(end)) say(`a name breaks inside "${end} ${next}"`)
    }
    const last = ordered[ordered.length - 1]
    const realWords = (xs: readonly Word[]) => xs.reduce((a, x) => a + x.text.split(/\s|\u00A0/).filter(Boolean).length, 0)
    if (ordered.length >= 2 && realWords(ws) >= 3 && ws.some((x) => !/^\d+$/.test(x.text)) && realWords(last[1]) === 1 && last[0] - ordered[ordered.length - 2][0] <= 1.6 * ws[0].size) {
      say(`"${last[1][0].text}" stands alone on the last line of "${ws.map((x) => x.text).join(' ').slice(0, 50)}"`)
    }
  }

  /* Contrast: each word against the slide drawn with every word taken out. */
  const ground = await svgPixels(svg.replace(/<text\b[^>]*>[^<]*<\/text>/g, () => ''), w)
  if (ground.width !== w || ground.height !== H) return [...faults, `the ground drew at ${ground.width} by ${ground.height}, not ${w} by ${H}`]
  const at = (p: Uint8Array, x: number, y: number) => {
    const i = (y * w + x) * 4
    return [p[i], p[i + 1], p[i + 2]]
  }
  for (const wd of words) {
    if (wd.shadowed) continue
    const fill = parseFill(wd.fill)
    if (!fill) continue
    const x0 = Math.max(0, Math.floor(wd.x))
    const x1 = Math.min(w - 1, Math.ceil(wd.right))
    const y0 = Math.max(0, Math.floor(wd.top))
    const y1 = Math.min(H - 1, Math.ceil(wd.bottom))
    const ratios: number[] = []
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const [r, g, b] = at(ground.pixels, x, y)
        const a = fill[3]
        const L1 = lum(a * fill[0] + (1 - a) * r, a * fill[1] + (1 - a) * g, a * fill[2] + (1 - a) * b)
        const L2 = lum(r, g, b)
        ratios.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05))
      }
    }
    if (ratios.length === 0) continue
    ratios.sort((p, q) => p - q)
    const low = ratios[Math.floor(ratios.length * 0.1)]
    const need = wd.size / (w / 1080) >= 52 ? 3 : 4.5
    if (low < need) say(`"${wd.text}" reads ${low.toFixed(1)} to 1 against what lies behind it (needs ${need} to 1)`)
  }

  /* Bare ground: rows of nothing but the ground's colour, in runs of 100 px of a 1080 frame or more, under 10 percent. */
  const full = await cardPixels(el as unknown as React.ReactNode, { width: w, height: H, fonts: fs })
  const g0 = at(full.pixels, Math.floor(w / 2), H - 3)
  const bare = (y: number) => {
    for (let x = 0; x < w; x += 3) {
      const p = at(full.pixels, x, y)
      if (Math.abs(p[0] - g0[0]) + Math.abs(p[1] - g0[1]) + Math.abs(p[2] - g0[2]) > 24) return false
    }
    return true
  }
  const from = f === 'story' ? SAFE : 0
  const to = f === 'story' ? H - SAFE : H
  const minRun = 100 * (w / 1080)
  let run = 0
  let empty = 0
  const lastRun = { end: 0, length: 0 }
  for (let y = from; y < to; y++) {
    if (bare(y)) run += 1
    else {
      if (run >= minRun) {
        empty += run
        lastRun.end = y
        lastRun.length = run
      }
      run = 0
    }
  }
  if (run >= minRun) {
    lastRun.end = to
    lastRun.length = run
  }
  if (run >= minRun) empty += run
  // The PM's 19:45 fix 3 rules that a slide's spare room falls at its foot: the one run that reaches down to the foot
  // (within its last fifth) is that room, not an empty photo slot, and is not counted; every run above it still is.
  const footRun = lastRun.end >= H * 0.8 && lastRun.length >= minRun ? lastRun.length : 0
  if ((empty - footRun) / H >= 0.1) say(`bare ground fills ${Math.round(((empty - footRun) / H) * 100)} percent of the frame (needs under 10)`)
  return faults
}
