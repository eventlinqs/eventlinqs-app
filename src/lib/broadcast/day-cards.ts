import { fetchImageBytes } from '@/lib/media/fetch-image'
import type { DayRow } from '@/lib/social/campaign'

/**
 * THE 9.5 LOCKED LOOK, IN THE PRODUCT (the PM's 17:10 of 15 November 2026: "the product renders in the 9.5 locked look").
 * Ported from WINDOW 6's locked-look-4.ts (C:/dev/EVIDENCE/EL-15NOV/social-w6), the look the PM scored 9.5 to 9.6 at 09:50
 * that morning (C:/dev/START-16OCT/social-14nov/review/score-lock-0950.md): a week's cover naming its biggest draws over a
 * night's own photograph whole, a slide per day or pair of days holding Lawal's gold timed cards under a photograph of the
 * right kind, a night's own photograph whole on its own slide, a small edge credit, "Swipe n/N" (a story: "Tap for" its
 * next), and the ask on gold. Laid out for the product's own formats, as SOCIAL_CARD_FORMATS in social-card-spec.ts
 * holds them with their sources (the portrait feed, the square, the story with its safe areas), never the sample's 3:4.
 *
 * The elements are satori's plain shape; rasteriseCard draws them with the card fonts (Archivo Compressed and Condensed,
 * Hanken Grotesk, Manrope). Every word is the planner's own (src/lib/social/campaign.ts): nothing here composes copy
 * beyond the fixed words of the look ("Swipe", "Tap for", "Link in bio", the ask).
 */

export type DayFormat = 'feed' | 'square' | 'story'

export type DaysWords = { day: string; date: string; rows: readonly DayRow[]; credit: string | null }
export type WeekCoverWords = { range: string; lines: readonly [string, string, string]; draws: string | null; line: string; credit: string | null; lead?: readonly DayRow[] }
export type FeatureWords = { eyebrow: string; title: string; accent: string | null; chip: string | null; credit: string | null }
/** Family D's name card (the master's 11 LANY): the eyebrow, the name in gold, the accent, one cream timed card. */
export type NameCardWords = { eyebrow: string; name: string; accent: string; row: DayRow; credit: string | null }
/** Family B's Tonight story (master 01): the day and the city, its nights as cream timed cards, the line its tap opens. */
/** Family C's organiser spotlight (master 17): the organiser, the night's two gold lines, the flyer whole. */
export type SpotlightWords = { presenter: string; nightLines: readonly [string, string]; credit: string | null }
export type TonightWords = { eyebrow: string; rows: readonly DayRow[]; tap: string; credit: string | null }
/** Family B's free week (master 02): the range, the count and its three lines, the nights on one white card. */
export type FreeWeekWords = { range: string; pill: string; count: number; lines: readonly [string, string, string]; rows: readonly DayRow[]; credit: string | null }
export type AskWords = { count: number; three: readonly DayRow[] }

/** A photograph ready for satori: a data URI and its drawn size. */
export type DrawnPhoto = { uri: string; width: number; height: number }

/** A slide's foot: its place in a carousel ("Swipe 2/7"), its next in a story ("Tap for Wednesday"), or nothing. */
export type Foot = { kind: 'count'; n: number; of: number } | { kind: 'tap'; words: string } | null

export type El = { type: string; props: Record<string, unknown> }
type Kid = El | string | null | false

const NAVY = '#0A1628'
const NAVY_CARD = '#111F38'
/** The cream of Lawal's light timed card (the master's nameCard, locked-look-4.ts). */
const CREAM = '#FBF4DC'
const GOLD = '#E8B738'
const WHITE = '#FFFFFF'
const MIST = '#D9D9D6'
const INK = '#0A1628'
/** A story's top and foot kept free for Instagram's own rows (SOCIAL_CARD_FORMATS.story.safeTop and safeBottom). */
export const SAFE = 250

const SIZE: Record<DayFormat, { w: number; h: number; k: number }> = {
  feed: { w: 1440, h: 1800, k: 1.25 },
  square: { w: 1080, h: 1080, k: 0.78 },
  story: { w: 1080, h: 1920, k: 1 },
}

export function sizeOf(f: DayFormat): { w: number; h: number } {
  return { w: SIZE[f].w, h: SIZE[f].h }
}

/** The format's scale against the 1080 frame the sizes are written for. */
export function scaleOf(f: DayFormat): number {
  return SIZE[f].k
}

const h = (type: string, style: Record<string, unknown>, ...kids: Kid[]): El => {
  const children = kids.filter((x): x is El | string => x !== null && x !== false)
  return { type, props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children } }
}
const text = (s: string, style: Record<string, unknown>): El => ({ type: 'div', props: { style: { display: 'flex', flexShrink: 0, ...style }, children: s } })
// A block of words that may wrap: never shrunk under its own height (out-6's first pass: the cover's draws and line drew
// over each other), and wrapped in balanced lines so no word stands alone on the last (satori's textWrap 'balance').
const wrap = (s: string, style: Record<string, unknown>): El => ({ type: 'div', props: { style: { display: 'flex', flexShrink: 0, textWrap: 'balance', ...style }, children: s } })
const img = (src: string, width: number, height: number, style: Record<string, unknown> = {}): El => ({ type: 'img', props: { src, width, height, style: { width, height, ...style } } })
const svg = (w: number, hgt: number, viewBox: string, paths: { d: string; stroke: string; sw: number }[]): El => ({
  type: 'svg',
  props: { width: w, height: hgt, viewBox, children: paths.map((p) => ({ type: 'path', props: { d: p.d, fill: 'none', stroke: p.stroke, strokeWidth: p.sw, strokeLinecap: 'round', strokeLinejoin: 'round' } })) },
})

const wordmark = (k: number, color: string, dot: string = GOLD) =>
  h('div', { alignItems: 'flex-end' },
    text('EVENTLINQS', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 44 * k, letterSpacing: 2 * k, color, lineHeight: 1 }),
    text('.', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 44 * k, color: dot, lineHeight: 1 }))
const pill = (k: number, words: string, fill: string, ink: string) =>
  text(words, { fontFamily: 'Manrope', fontWeight: 800, fontSize: 30 * k, letterSpacing: 1.5 * k, color: ink, background: fill, borderRadius: 999, padding: `${12 * k}px ${26 * k}px`, lineHeight: 1 })
const eyebrow = (k: number, words: string, color: string) => wrap(words.toUpperCase(), { fontFamily: 'Manrope', fontWeight: 800, fontSize: 36 * k, letterSpacing: 3 * k, color, lineHeight: 1.2 })
const bookmark = (k: number, color: string) => svg(56 * k, 56 * k, '0 0 24 24', [{ d: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', stroke: color, sw: 2.4 }])
const plane = (k: number, color: string) => svg(60 * k, 60 * k, '0 0 24 24', [{ d: 'M22 2 11 13', stroke: color, sw: 2 }, { d: 'M22 2 15 22 11 13 2 9 22 2Z', stroke: color, sw: 2 }])
const arrowRight = (k: number, color: string) => svg(88 * k, 42 * k, '0 0 42 20', [{ d: 'M2 10h36M30 2l8 8-8 8', stroke: color, sw: 3 }])
const arrowDown = (k: number, color: string) => svg(50 * k, 66 * k, '0 0 24 32', [{ d: 'M12 2v26M4 20l8 8 8-8', stroke: color, sw: 2.6 }])

/** The way out, never a raw address: a feed says "Link in bio"; a story points down at its link sticker. */
const exit = (k: number, f: DayFormat, color: string) =>
  f === 'story'
    ? h('div', { alignItems: 'center', gap: 14 * k }, text('Tap the link', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 50 * k, color, whiteSpace: 'nowrap' }), arrowDown(k, color))
    : text('Link in bio', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 44 * k, color, whiteSpace: 'nowrap' })

/**
 * A name never breaks after v, vs, &, and, at, with or a number (the PM's 18:45 fix 4: 'Australia v / England Men's T20I'):
 * the word and its neighbours are joined by no-break spaces when drawn; the slide's data keeps the name as it is.
 */
export function keepTogether(name: string, maxEm = 16): string {
  // The PM's 19:45 fix 2: a line breaks BEFORE v, vs, &, and, at or with, never after, and never inside a run of
  // capitalised words or numbers ('Melbourne United / vs New Zealand Breakers'). A run longer than 30 letters may still
  // break, so no name is wider than its card.
  const words = name.split(' ')
  const starts = (x: string) => /^[A-Z0-9\u00C0-\u00DE]/.test(x)
  const ends = (x: string) => /[,:;.]$/.test(x)
  let out = words[0] ?? ''
  let run = words[0] ?? ''
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1]
    const cur = words[i]
    const joiner = /^(v|vs|&|and|at|with)$/i.test(prev)
    // A word closing with punctuation ends its run after itself ('Live Music: / Garden Session').
    const inRun = starts(prev) && !ends(prev) && starts(cur) && emWidth(`${run} ${cur}`) <= maxEm
    // A name's last two words always stay together, so no word stands alone on a last line (out-8: 'SHOWTIME').
    const last = i === words.length - 1 && emWidth(`${prev} ${cur}`) <= maxEm
    out += joiner || inRun || last ? `\u00A0${cur}` : ` ${cur}`
    run = inRun ? `${run} ${cur}` : cur
  }
  // A name left with no break its rules allow and wider than its card keeps its main name before its own colon, as
  // shortTitle does (out-12: 'Torquay Dance Academy: SHOWTIME' ran past the story card's edge, and a break inside
  // 'Dance Academy' is one the guard refuses; it reads 'Torquay Dance Academy').
  const colon = name.indexOf(': ')
  if (words.length > 1 && !out.includes(' ') && emWidth(name) > maxEm && colon > 0) return keepTogether(name.slice(0, colon), maxEm)
  return out
}

/** A date label breaks only before TO or & ('FRI 20 / TO SUN 22'), never inside a day and its date. */
export function keepDate(label: string): string {
  return label.replace(/ (?!(TO|to|&) )(?<!(TO|to|&) )/g, () => '\u00A0').replace(/ (TO|to|&) /g, (_m: string, w: string) => ` ${w}\u00A0`)
}

/** Lawal's gold timed card, at its content's height and its padding, never stretched (the PM's 18:45 fix 4). */
/**
 * How many ems of a card title fit one line at its size and its format's own width (the PM's 20:40 fix 2: 'Torquay Dance
 * Academy: SHOWTIME' ran past the card on the story). A joined run is never wider than this.
 */
const titleRoom = (k: number, width: number, free: boolean) => (width - k * (60 + 252 + 3 + 26) - (free ? k * 170 : 0)) / (39 * k)

/** A string's width in ems, as Hanken Grotesk and Archivo Condensed draw it: capitals and figures wider than lower case. */
export function emWidth(s: string): number {
  let em = 0
  for (const ch of s) em += /[A-Z0-9]/.test(ch) ? 0.68 : /[a-z]/.test(ch) ? 0.53 : /\s/.test(ch) ? 0.27 : 0.36
  return em
}
// `light`: the master's cream card (nameCard's 'light' style), navy words, no border; the default is the gold timed card.
const timedCard = (k: number, r: DayRow, width = 1024 * k, light = false) =>
  h('div', { alignItems: 'center', background: light ? CREAM : NAVY_CARD, border: light ? 'none' : `${3 * k}px solid ${GOLD}`, borderRadius: 22 * k, padding: `${24 * k}px ${30 * k}px`, width: '100%', flexShrink: 0 },
    h('div', { flexDirection: 'column', width: 252 * k, flexShrink: 0 },
      text(r.when.toUpperCase(), { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: 72 * k, color: light ? INK : GOLD, lineHeight: 0.95, whiteSpace: 'nowrap' }),
      r.sub ? wrap(keepDate(r.sub.toUpperCase()), { fontFamily: 'Manrope', fontWeight: 800, fontSize: 27 * k, letterSpacing: 1 * k, color: light ? INK : MIST, marginTop: 6 * k, lineHeight: 1.2 }) : null),
    h('div', { width: 3 * k, alignSelf: 'stretch', background: GOLD, marginRight: 26 * k, flexShrink: 0 }),
    h('div', { flexDirection: 'column', flexGrow: 1, flexShrink: 1 },
      wrap(keepTogether(r.title, titleRoom(k, width, r.free)), { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 39 * k, color: light ? INK : WHITE, lineHeight: 1.16 }),
      wrap(keepTogether(r.place, titleRoom(k, width, r.free)), { fontFamily: 'Hanken Grotesk', fontWeight: 500, fontSize: 31 * k, color: light ? INK : MIST, lineHeight: 1.25, marginTop: 6 * k })),
    r.free ? h('div', { marginLeft: 18 * k, flexShrink: 0 }, pill(k, 'FREE', GOLD, NAVY)) : null)

/** "Swipe → n/N" on a carousel; a story is tapped, so it names its next ("Tap for Wednesday"). */
const footOf = (k: number, foot: Foot, onDark = true): El | null => {
  if (!foot) return null
  if (foot.kind === 'tap') return text(foot.words, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 40 * k, color: onDark ? GOLD : INK })
  return h('div', { alignItems: 'center', gap: 18 * k },
    onDark ? text('Swipe', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 38 * k, color: WHITE }) : null,
    onDark ? arrowRight(k, GOLD) : null,
    h('div', { alignItems: 'flex-end' },
      text(String(foot.n), { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 46 * k, color: onDark ? GOLD : INK }),
      text(`/${foot.of}`, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 46 * k, color: onDark ? WHITE : INK })))
}

/** One line, as large as its width allows: Archivo Compressed runs about 0.4 em a character, about 0.52 in capitals. */
const fitLine = (words: string, max: number, width: number, caps = false) => Math.min(max, Math.floor(width / (Math.max(words.length, 1) * (caps ? 0.52 : 0.4))))

const creditMark = (k: number, s: string) =>
  text(s, { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 26 * k, color: 'rgba(255,255,255,0.7)', textShadow: '0 0 14px rgba(0,0,0,1)' })

/**
 * A photograph of the right kind, filling a band across the top from `top` (below the navy strip that carries the
 * wordmark) to `bh`, and fading into the navy below it.
 */
const band = (w: number, bh: number, p: DrawnPhoto, top = 0) =>
  h('div', { position: 'absolute', top, left: 0, width: w, height: Math.max(1, bh - top) },
    img(p.uri, w, Math.max(1, bh - top), { position: 'absolute', top: 0, left: 0, objectFit: 'cover' }),
    h('div', { position: 'absolute', top: 0, left: 0, width: w, height: Math.max(1, bh - top), backgroundImage: `linear-gradient(to bottom, rgba(10,22,40,0.62) 0%, rgba(10,22,40,0) 30%, rgba(10,22,40,0) 72%, ${NAVY} 100%)` }))

/**
 * THE WORDMARK NEVER SITS OVER A PHOTOGRAPH (Lawal's D3, 16 November 2026, 23:08: "Keep the approved EventLinqs wordmark
 * on the separate design band, not over the event photograph"; the PM's 23:42: a stand-in is a photograph, so on every
 * slide the wordmark sits on the navy band). A slide with a photograph band keeps a navy strip at its top for the
 * wordmark (and a venue's pill beside it, as the feature slide's chip); the photograph starts below it. The strip is the
 * slide's own top padding (SAFE on a story), the top row (the pill, the taller of the two, is 54 at k 1) and a gap.
 * Read from the drawn frame by tests/unit/social/wordmark-off-photo.test.ts.
 */
const MARK_ROW = 56
const MARK_GAP = 28
export function bandTop(f: DayFormat, slide: 'days' | 'cover' | 'venue'): number {
  const { k } = SIZE[f]
  const scale = slide === 'cover' ? 1 : 0.8
  return Math.round((f === 'story' ? SAFE : 0) + 64 * k * scale + (MARK_ROW + MARK_GAP) * k)
}

/**
 * The band's height before it is fitted: about the top third; lockedElement then ends it where the words begin, as it
 * always did. Below the wordmark's strip the photograph keeps at least PHOTO_FLOOR of the frame's height, so a band that
 * would end close under the strip runs that much further rather than show a sliver (a venue's story: the strip ends at
 * 385 of 1920, the planned band at 461).
 */
const PHOTO_FLOOR = 0.18
export function bandHeight(f: DayFormat, slide: 'days' | 'cover' | 'venue'): number {
  const share = slide === 'venue' ? 0.24 : slide === 'cover' ? (f === 'square' ? 0.34 : 0.4) : f === 'story' ? 0.36 : f === 'square' ? 0.3 : 0.34
  return Math.max(Math.round(SIZE[f].h * share), bandTop(f, slide) + Math.round(SIZE[f].h * PHOTO_FLOOR))
}

/** A slide's padding: a story keeps Instagram's own rows clear at its top and foot. */
const padOf = (f: DayFormat, k: number, scale = 1) => {
  const pad = 64 * k
  return { pad, css: `${(f === 'story' ? SAFE : 0) + pad * scale}px ${pad}px ${f === 'story' ? SAFE + 16 * k : pad * scale}px` }
}

/**
 * A SLIDE IN TYPE (the PM's 17:40 fix 2 and 18:45 fix 4): the heading starts high, each card keeps its content's height
 * (a little larger the fewer they are), and every part is its own item with the navy shared out evenly between them, so
 * no run of bare navy is left where a photograph would have been and no card is stretched.
 */
const cardScale = (f: DayFormat, rows: number) =>
  f === 'square' ? (rows >= 5 ? 0.85 : rows >= 3 ? 1 : 1.12) : rows >= 4 ? 1 : rows === 3 ? 1.12 : rows === 2 ? 1.3 : 1.5
/** One fixed gap between cards on every slide (the PM's 19:45 fix 3); the group sits under the heading. */
const CARD_GAP = 20
const cardGroup = (k: number, s: number, rows: readonly DayRow[], top: number, width: number) =>
  h('div', { flexDirection: 'column', width: '100%', gap: CARD_GAP * k, marginTop: top, flexShrink: 0 }, ...rows.map((r) => timedCard(k * s, r, width)))
/** A slide in type: its parts from the top, the spare room at the foot (kept small by lockedElement's measured card size). */
const inType = (w: number, H: number, css: string, items: readonly Kid[], foot: Kid) =>
  h('div', { width: w, height: H, background: NAVY, flexDirection: 'column', padding: css }, ...items, h('div', { flexGrow: 1 }), foot)

/** The card size a slide in type starts from before it is measured. */
export function startScale(f: DayFormat, rows: number): number {
  return cardScale(f, rows)
}

/** A cover in type shows as many of its lead nights as its frame holds: three in the portrait feed, two in a story or square. */
const leadRoom = (f: DayFormat) => (f === 'feed' ? 3 : 2)

/** The words of a day slide's heading: the day in white, the date in gold, on one line as large as it fits. */
const dayHeading = (k: number, w: number, pad: number, words: DaysWords, max = 170) => {
  const head = fitLine(`${words.day} ${words.date}`, max, (w - 2 * pad) / k) * k
  return h('div', { alignItems: 'flex-end', gap: 22 * k },
    text(words.day, { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: head, color: WHITE, lineHeight: 0.9, whiteSpace: 'nowrap' }),
    text(words.date, { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: head, color: GOLD, lineHeight: 0.9, whiteSpace: 'nowrap' }))
}

/** A day slide: the photograph band (or none), the day, the nights as gold timed cards, the foot. `bandH` is its fitted band. */
export function daysElement(f: DayFormat, words: DaysWords, photo: DrawnPhoto | null, foot: Foot, bandH: number = bandHeight(f, 'days'), scale?: number): El {
  const { w, h: H, k } = SIZE[f]
  const { pad, css } = padOf(f, k, 0.8)
  const footer = h('div', { justifyContent: 'flex-end', width: '100%', marginTop: 30 * k }, footOf(k, foot))
  if (!photo) {
    const s = scale ?? cardScale(f, words.rows.length)
    // Three cards or fewer: the day and the date each on a line of its own, as large as each fits.
    const stacked = words.rows.length <= 3
      ? [
          text(words.day, { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: fitLine(words.day, 240, (w - 2 * pad) / k) * k, color: WHITE, lineHeight: 0.9, whiteSpace: 'nowrap' }),
          text(words.date, { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: fitLine(words.date, 240, (w - 2 * pad) / k) * k, color: GOLD, lineHeight: 0.9, whiteSpace: 'nowrap' }),
        ]
      : [dayHeading(k, w, pad, words, 190)]
    return inType(w, H, css, [wordmark(k, WHITE), h('div', { flexDirection: 'column', marginTop: 40 * k, flexShrink: 0 }, ...stacked), cardGroup(k, s, words.rows, 36 * k, w - 2 * pad)], h('div', { justifyContent: 'flex-end', width: '100%' }, footOf(k, foot)))
  }
  return h('div', { width: w, height: H, background: NAVY, position: 'relative' },
    band(w, bandH, photo, bandTop(f, 'days')),
    h('div', { position: 'absolute', top: 0, left: 0, width: w, height: H, flexDirection: 'column', padding: css },
      wordmark(k, WHITE),
      h('div', { flexGrow: 1 }),
      dayHeading(k, w, pad, words),
      words.credit ? h('div', { justifyContent: 'flex-end', width: '100%', marginTop: 22 * k }, creditMark(k, words.credit)) : null,
      h('div', { flexDirection: 'column', width: '100%', gap: CARD_GAP * k, marginTop: (words.credit ? 10 : 34) * k }, ...words.rows.map((r) => timedCard(k, r, w - 2 * pad))),
      footer))
}

/**
 * The week's cover: the count, the biggest draws and its line, and a night's own photograph shown whole (`mode` 'whole'),
 * a photograph of the lead night's kind across the top ('band', fitted to end where the words begin), or neither, when
 * its three lead nights fill the frame as cards; the foot.
 */
export function weekCoverElement(f: DayFormat, words: WeekCoverWords, photo: DrawnPhoto | null, mode: 'whole' | 'band', foot: Foot, bandH: number = bandHeight(f, 'cover'), scale = 1): El {
  const { w, h: H, k } = SIZE[f]
  const { pad, css } = padOf(f, k)
  // In type the cover's lines give room to its lead nights' cards.
  const room = photo ? (f === 'square' ? 120 : 150) : f === 'square' ? 96 : 120
  const big = Math.min(...words.lines.map((l) => fitLine(l, room, (w - 2 * pad) / k))) * k
  const lines = [
    text(words.lines[0], { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: big, color: WHITE, lineHeight: 1, marginTop: 12 * k, whiteSpace: 'nowrap' }),
    text(words.lines[1], { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: big, color: WHITE, lineHeight: 1, whiteSpace: 'nowrap' }),
    text(words.lines[2], { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: big, color: GOLD, lineHeight: 1, whiteSpace: 'nowrap' }),
  ]
  const draws = words.draws ? wrap(keepTogether(words.draws), { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 52 * k, color: WHITE, marginTop: 22 * k, lineHeight: 1.08 }) : null
  const line = wrap(words.line, { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 34 * k, color: MIST, marginTop: 14 * k, lineHeight: 1.25 })
  const footer = h('div', { justifyContent: 'flex-end', width: '100%' }, footOf(k, foot))
  if (photo && mode === 'band') {
    return h('div', { width: w, height: H, background: NAVY, position: 'relative' },
      band(w, bandH, photo, bandTop(f, 'cover')),
      h('div', { position: 'absolute', top: 0, left: 0, width: w, height: H, flexDirection: 'column', padding: css },
        wordmark(k, WHITE),
        h('div', { flexGrow: 1 }),
        words.credit ? h('div', { justifyContent: 'flex-end', width: '100%', marginBottom: 14 * k }, creditMark(k, words.credit)) : null,
        eyebrow(k, words.range, GOLD),
        ...lines,
        draws,
        line,
        h('div', { height: 40 * k }),
        footer))
  }
  if (!photo) {
    return inType(w, H, css, [
      wordmark(k, WHITE),
      h('div', { flexDirection: 'column', width: '100%', flexShrink: 0, marginTop: 36 * k }, eyebrow(k, words.range, GOLD), ...lines),
      h('div', { flexDirection: 'column', width: '100%', flexShrink: 0 }, draws, line),
      cardGroup(k, scale, (words.lead ?? []).slice(0, leadRoom(f)), 34 * k, w - 2 * pad),
    ], footer)
  }
  return h('div', { width: w, height: H, background: NAVY, flexDirection: 'column', padding: css },
    wordmark(k, WHITE),
    h('div', { marginTop: 36 * k }, eyebrow(k, words.range, GOLD)),
    ...lines,
    draws,
    line,
    h('div', { marginTop: 30 * k, width: '100%', flexDirection: 'column', alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
      img(photo.uri, photo.width, photo.height, { borderRadius: 18 * k, border: `${3 * k}px solid ${GOLD}` }),
      words.credit ? text(words.credit, { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 30 * k, color: MIST, marginTop: 10 * k, alignSelf: 'flex-end' }) : null),
    footer)
}

/** A name in two lines of even length, broken only between words; a short name stays on one. */
export function twoLines(name: string): string[] {
  const words = name.split(' ')
  if (name.length <= 18 || words.length < 2) return [name]
  let split = 1
  let gap = Infinity
  for (let i = 1; i < words.length; i++) {
    // Never a line ending on a joining word or a number (out-7: AMCF's name split after its AND).
    if (/^(v|vs|&|and|at|with|\d[\d.,:]*)$/i.test(words[i - 1])) continue
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length)
    if (d < gap) {
      gap = d
      split = i
    }
  }
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')]
}

/** The send ask beside its paper plane. */
const askLine = (k: number, color: string) =>
  h('div', { alignItems: 'center', gap: 18 * k, flexShrink: 1 }, plane(k, GOLD), wrap("Send this to who you're going with", { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 48 * k, color, lineHeight: 1.05, flexShrink: 1 }))

/** A night with its own permitted photograph: the photograph whole, the night beneath it (photo system A1). */
export function featureElement(f: DayFormat, words: FeatureWords, photo: DrawnPhoto | null, foot: Foot, ownPost = false): El {
  const { w, h: H, k } = SIZE[f]
  const { pad, css } = padOf(f, k)
  const lines = twoLines(words.title)
  const titleSize = Math.min(...lines.map((l) => fitLine(l, f === 'square' ? 92 : 132, (w - 2 * pad) / k, true))) * k
  return h('div', { width: w, height: H, background: NAVY, flexDirection: 'column', justifyContent: 'space-between', padding: css },
    h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, wordmark(k, WHITE), words.chip ? pill(k, words.chip, GOLD, NAVY) : null),
    photo
      ? h('div', { width: '100%', flexDirection: 'column', alignItems: 'center' },
          img(photo.uri, photo.width, photo.height, { borderRadius: 18 * k, border: `${3 * k}px solid ${GOLD}` }),
          words.credit ? text(words.credit, { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 30 * k, color: MIST, marginTop: 10 * k, alignSelf: 'flex-end' }) : null)
      : null,
    h('div', { flexDirection: 'column' },
      eyebrow(k, words.eyebrow, GOLD),
      h('div', { flexDirection: 'column', marginTop: 12 * k }, ...lines.map((l) => text(l.toUpperCase(), { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: titleSize, color: WHITE, lineHeight: 0.92, whiteSpace: 'nowrap' }))),
      words.accent ? wrap(words.accent, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: (f === 'square' ? 42 : 56) * k, color: GOLD, lineHeight: 1.05, marginTop: 16 * k }) : null),
    // A post of its own (family D's daily poster, ownPost) ends as the master's ownPhotoPiece does: the send ask and the way
    // out (20 AMCF). A feature slide in a carousel keeps its foot, as its golden holds it.
    !ownPost
      ? h('div', { justifyContent: 'flex-end', width: '100%' }, footOf(k, foot))
      : f === 'story'
        ? h('div', { flexDirection: 'column', alignItems: 'center', width: '100%', gap: 26 * k }, askLine(k, WHITE), exit(k, f, GOLD))
        : h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 24 * k }, askLine(k, WHITE), exit(k, f, GOLD)))
}

/**
 * FAMILY D, THE NAME CARD (the master set's 11 LANY, 15 November 2026; WINDOW 6's nameCard in locked-look-4.ts): a
 * photograph of the night's kind across the top, its credit at the band's edge; the eyebrow in gold; the night's name
 * filling the width in gold; the accent in white; one cream timed card; the send ask and the way out. The wordmark sits
 * on the navy strip above the photograph, never over it (Lawal's D3 of 16 November 2026, as every locked slide). `bandH`
 * is where the band ends. Every word is the planner's own (daily-posters.ts posterLook).
 */
export function nameCardElement(f: DayFormat, words: NameCardWords, photo: DrawnPhoto | null, bandH: number = Math.round(SIZE[f].h * (f === 'square' ? 0.42 : 0.46))): El {
  const { w, h: H, k } = SIZE[f]
  const { pad, css } = padOf(f, k, 0.8)
  const top = bandTop(f, 'days')
  // A short name fills the width on one line (the master's 'LANY'); a longer one takes two, each as large as it fits, as the
  // feature slide's title does, so no long name is drawn small over a bare run of navy.
  const lines = words.name.length > 12 ? twoLines(words.name) : [words.name]
  const nameSize = Math.min(...lines.map((l) => fitLine(l, f === 'square' ? 300 : 440, (w - 2 * pad) / k, true))) * k
  return h('div', { width: w, height: H, background: NAVY, position: 'relative' },
    photo ? band(w, bandH, photo, top) : null,
    h('div', { position: 'absolute', top: 0, left: 0, width: w, height: H, flexDirection: 'column', padding: css },
      wordmark(k, WHITE),
      h('div', { flexGrow: 1 }),
      photo && words.credit ? h('div', { justifyContent: 'flex-end', width: '100%', marginBottom: 12 * k }, creditMark(k, words.credit)) : null,
      eyebrow(k, words.eyebrow, GOLD),
      h('div', { flexDirection: 'column', marginTop: 10 * k }, ...lines.map((l) => text(l.toUpperCase(), { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: nameSize, color: GOLD, lineHeight: 0.9, whiteSpace: 'nowrap' }))),
      wrap(words.accent, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 56 * k, color: WHITE, marginTop: 14 * k, lineHeight: 1.05 }),
      h('div', { marginTop: 30 * k, width: '100%' }, timedCard(k * (f === 'story' ? 1.3 : 1.1), words.row, w - 2 * pad, true)),
      f === 'story'
        ? h('div', { flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: 40 * k, gap: 30 * k }, askLine(k, WHITE), exit(k, f, GOLD))
        : h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 40 * k, gap: 24 * k }, askLine(k, WHITE), exit(k, f, GOLD))))
}

/**
 * FAMILY B, TONIGHT (the master set's 01; WINDOW 6's tonight in locked-look-4.ts): a story. A photograph of the night's
 * kind across the top below the wordmark's navy strip (Lawal's D3), its credit at the band's edge; the day and the city in
 * gold; 'Tonight' filling the width in gold; the nights as cream timed cards; the line the tap opens and its arrow.
 */
export function tonightElement(words: TonightWords, photo: DrawnPhoto | null, bandH: number = Math.round(SIZE.story.h * 0.4)): El {
  const f: DayFormat = 'story'
  const { w, h: H, k } = SIZE[f]
  const pad = 64 * k
  const top = bandTop(f, 'days')
  return h('div', { width: w, height: H, background: NAVY, position: 'relative' },
    photo ? band(w, bandH, photo, top) : null,
    h('div', { position: 'absolute', top: 0, left: 0, width: w, height: H, flexDirection: 'column', alignItems: 'center', padding: `${SAFE + pad * 0.6}px ${pad}px ${SAFE + pad * 0.4}px` },
      wordmark(k, WHITE),
      h('div', { flexGrow: 1 }),
      photo && words.credit ? h('div', { justifyContent: 'flex-end', width: '100%', marginBottom: 14 * k }, creditMark(k, words.credit)) : null,
      eyebrow(k, words.eyebrow, GOLD),
      text('Tonight', { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: 320 * k, color: GOLD, lineHeight: 1.0, marginTop: 4 * k, marginBottom: 46 * k }),
      h('div', { flexDirection: 'column', width: '100%', gap: 20 * k }, ...words.rows.map((r) => timedCard(k * 1.05, r, w - 2 * pad, true))),
      text(words.tap, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 52 * k, color: GOLD, marginTop: 40 * k }),
      h('div', { marginTop: 12 * k }, arrowDown(k, GOLD))))
}

/**
 * FAMILY B, THE FREE WEEK (the master set's 02; WINDOW 6's freeThings): a feed post on Lawal's gold. A photograph of a free
 * night's kind across the top below a gold strip that carries the wordmark and the pill (Lawal's D3: the wordmark on its
 * own design band); the range in navy; the count and its three lines; the nights on one white card; the save ask and the
 * way out.
 */
export function freeWeekElement(f: DayFormat, words: FreeWeekWords, photo: DrawnPhoto | null, bandH: number = Math.round(SIZE[f].h * (f === 'square' ? 0.31 : f === 'story' ? 0.37 : 0.36))): El {
  const { w, h: H, k } = SIZE[f]
  const pad = 64 * k
  const topPad = f === 'story' ? SAFE : 0
  const strip = bandTop(f, 'days')
  const line = (x: string) => text(x, { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: (f === 'square' ? 76 : f === 'story' ? 100 : 120) * k, color: INK, lineHeight: 0.92, whiteSpace: 'nowrap' })
  return h('div', { width: w, height: H, background: GOLD, position: 'relative' },
    photo
      ? h('div', { position: 'absolute', top: strip, left: 0, width: w, height: Math.max(1, bandH - strip) },
          img(photo.uri, w, Math.max(1, bandH - strip), { position: 'absolute', top: 0, left: 0, objectFit: 'cover' }))
      : null,
    h('div', { position: 'absolute', top: 0, left: 0, width: w, height: H, flexDirection: 'column', padding: `${topPad + pad * 0.8}px ${pad}px ${f === 'story' ? SAFE + 16 * k : pad * 0.8}px` },
      h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, wordmark(k, INK, NAVY), pill(k, words.pill, NAVY, WHITE)),
      h('div', { flexGrow: 1 }),
      photo && words.credit ? h('div', { justifyContent: 'flex-end', width: '100%', marginBottom: 14 * k }, text(words.credit, { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 26 * k, color: 'rgba(10,22,40,0.7)' })) : null,
      eyebrow(k, words.range, INK),
      h('div', { alignItems: 'center', marginTop: 10 * k },
        text(String(words.count), { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: (f === 'square' ? 240 : f === 'story' ? 330 : 430) * k, color: INK, lineHeight: 0.84, marginRight: 50 * k }),
        h('div', { flexDirection: 'column' }, ...words.lines.map(line))),
      h('div', { flexDirection: 'column', width: '100%', marginTop: 24 * k, background: WHITE, borderRadius: 26 * k, padding: `${8 * k}px ${30 * k}px` },
        ...words.rows.flatMap((r, i) => [
          i > 0 ? h('div', { height: 2 * k, background: MIST, width: '100%' }) : null,
          h('div', { alignItems: 'center', padding: `${(f === 'square' ? 10 : f === 'story' ? 24 : 16) * k}px 0` },
            h('div', { flexDirection: 'column', width: 270 * k, flexShrink: 0 },
              text(r.when.toUpperCase(), { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 54 * k, color: INK, lineHeight: 1 }),
              r.sub ? text(r.sub.toUpperCase(), { fontFamily: 'Manrope', fontWeight: 800, fontSize: 27 * k, color: INK, marginTop: 4 * k, letterSpacing: 1 * k }) : null),
            h('div', { flexDirection: 'column', flexShrink: 1 },
              wrap(keepTogether(r.title, 22), { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 38 * k, color: INK, lineHeight: 1.16 }),
              wrap(keepTogether(r.place, 22), { fontFamily: 'Hanken Grotesk', fontWeight: 500, fontSize: 32 * k, color: INK, lineHeight: 1.25, marginTop: 2 * k }))),
        ])),
      h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 24 * k },
        h('div', { alignItems: 'center', gap: 18 * k, flexShrink: 1 }, bookmark(k, INK), wrap('Save this for the week', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 48 * k, color: INK, lineHeight: 1.05, flexShrink: 1 })),
        f === 'story' ? null : exit(k, f, INK)),
      f === 'story' ? h('div', { marginTop: 26 * k, justifyContent: 'center', width: '100%' }, exit(k, f, INK)) : null))
}

/**
 * FAMILY C, THE ORGANISER SPOTLIGHT (the master set's 17 GroovyTown; WINDOW 6's spotlight in locked-look-4.ts): the wordmark
 * and the ORGANISER SPOTLIGHT pill on the navy band (D3), the organiser's flyer whole in its gold frame with its credit,
 * PRESENTED BY and the organiser's name, the night's name and its day, time and place in gold, the send ask and the way out.
 */
export function spotlightElement(f: DayFormat, words: SpotlightWords, flyer: DrawnPhoto | null): El {
  const { w, h: H, k } = SIZE[f]
  const { pad, css } = padOf(f, k)
  const longest = words.presenter.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '')
  const nameSize = Math.min(f === 'story' ? 200 : 168, fitLine(longest, 999, (w - 2 * pad) / k, true)) * k
  return h('div', { width: w, height: H, background: NAVY, flexDirection: 'column', justifyContent: 'space-between', padding: css },
    h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, wordmark(k, WHITE), pill(k, 'ORGANISER SPOTLIGHT', GOLD, NAVY)),
    flyer
      ? h('div', { width: '100%', flexDirection: 'column', alignItems: 'center' },
          img(flyer.uri, flyer.width, flyer.height, { borderRadius: 18 * k, border: `${3 * k}px solid ${GOLD}` }),
          words.credit ? text(words.credit, { fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: 30 * k, color: MIST, marginTop: 10 * k, alignSelf: 'flex-end' }) : null)
      : null,
    h('div', { flexDirection: 'column' },
      text('PRESENTED BY', { fontFamily: 'Manrope', fontWeight: 800, fontSize: 36 * k, color: GOLD, letterSpacing: 3 * k }),
      wrap(words.presenter.toUpperCase(), { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: nameSize, color: WHITE, lineHeight: 0.9, marginTop: 8 * k }),
      h('div', { flexDirection: 'column', marginTop: 18 * k }, ...words.nightLines.map((l) => wrap(l, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: (f === 'story' ? 50 : 46) * k, color: GOLD, lineHeight: 1.12 })))),
    f === 'story'
      ? h('div', { flexDirection: 'column', alignItems: 'center', width: '100%', gap: 26 * k }, askLine(k, WHITE), exit(k, f, GOLD))
      : h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 24 * k }, askLine(k, WHITE), exit(k, f, GOLD)))
}

export type VenueWords = { venue: string; eyebrow: string; accent: string; rows: readonly DayRow[]; credit: string | null }

/**
 * Family E, a venue's week (WINDOW 6's venuePiece): a photograph of its nights' kind across the top (or none), the VENUE
 * pill, the range, the venue's name filling the width, the accent in gold, its nights as gold timed cards, the ask and
 * the way out. In type the name leads from the top and the cards grow to fill.
 */
export function venueElement(f: DayFormat, words: VenueWords, photo: DrawnPhoto | null, foot: Foot, bandH: number = bandHeight(f, 'venue'), scale?: number): El {
  const { w, h: H, k } = SIZE[f]
  const { pad, css } = padOf(f, k, 0.8)
  const name = text(words.venue.toUpperCase(), { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: fitLine(words.venue, 190, (w - 2 * pad) / k, true) * k, color: WHITE, lineHeight: 0.9, marginTop: 10 * k, whiteSpace: 'nowrap' })
  const accent = wrap(words.accent, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 56 * k, color: GOLD, marginTop: 14 * k })
  const close = f === 'story'
    ? h('div', { flexDirection: 'column', alignItems: 'center', width: '100%', gap: 22 * k, marginTop: 26 * k }, askLine(k, WHITE), exit(k, f, GOLD))
    : h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 26 * k, gap: 20 * k }, askLine(k, WHITE), exit(k, f, GOLD))
  const tail = footOf(k, foot)
  const top = h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, wordmark(k, WHITE), pill(k, 'VENUE', GOLD, NAVY))
  if (!photo) {
    const s = scale ?? cardScale(f, words.rows.length)
    return inType(w, H, css, [
      top,
      h('div', { flexDirection: 'column', flexShrink: 0, marginTop: 48 * k }, eyebrow(k, words.eyebrow, GOLD), name, accent),
      cardGroup(k, s, words.rows, 30 * k, w - 2 * pad),
    ], h('div', { flexDirection: 'column', width: '100%' }, close, tail ? h('div', { justifyContent: 'flex-end', width: '100%', marginTop: 16 * k }, tail) : null))
  }
  return h('div', { width: w, height: H, background: NAVY, position: 'relative' },
    band(w, bandH, photo, bandTop(f, 'venue')),
    h('div', { position: 'absolute', top: 0, left: 0, width: w, height: H, flexDirection: 'column', padding: css },
      top,
      h('div', { flexGrow: 1 }),
      words.credit ? h('div', { justifyContent: 'flex-end', width: '100%', marginBottom: 12 * k }, creditMark(k, words.credit)) : null,
      // The PM's 00:45 (16 November 2026): the small gold eyebrow sits on the solid panel below the fade, never over the
      // photograph (screen 2: it needs 4.5 to 1 and read clean over only 11 of 82 stand-ins); the name stays over the fade,
      // which it read clean over on every one, and the band ends where the eyebrow begins (fittedBand, 'VENUE').
      name,
      h('div', { marginTop: 14 * k }, eyebrow(k, words.eyebrow, GOLD)),
      accent,
      h('div', { flexDirection: 'column', width: '100%', marginTop: 24 * k, gap: CARD_GAP * k }, ...words.rows.map((r) => timedCard(k, r, w - 2 * pad))),
      close,
      tail ? h('div', { justifyContent: 'flex-end', width: '100%', marginTop: 16 * k }, tail) : null))
}

/** The last slide: Lawal's ask on gold, the three to start with, the way out. */
export function askElement(f: DayFormat, words: AskWords, foot: Foot): El {
  const { w, h: H, k } = SIZE[f]
  const { css } = padOf(f, k)
  const ask = "Send this to who you're going with."
  return h('div', { width: w, height: H, background: GOLD, flexDirection: 'column', padding: css },
    wordmark(k, INK, INK),
    // The gold is shared out between the parts (out-6, the square: the guard read 24 percent bare gold when they sat together).
    h('div', { flexDirection: 'column', flexGrow: 1, justifyContent: 'space-around', marginTop: 30 * k },
      plane(k * 2.4, INK),
      wrap(ask, { fontFamily: 'Archivo Compressed', fontWeight: 900, fontSize: (f === 'square' ? 150 : 186) * k, color: INK, lineHeight: 0.92 }),
      words.three.length > 0
        ? h('div', { flexDirection: 'column', width: '100%', marginTop: 40 * k, paddingTop: 20 * k, borderTop: `${3 * k}px solid ${INK}`, gap: 8 * k },
            eyebrow(k, words.three.length === 1 ? 'Start with this one' : `Start with these ${words.three.length === 2 ? 'two' : 'three'}`, INK),
            ...words.three.map((r) =>
              h('div', { alignItems: 'flex-start', width: '100%', marginTop: 6 * k },
                wrap(keepDate(r.when.toUpperCase()), { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 44 * k, color: INK, lineHeight: 1.1, width: 330 * k }),
                wrap(keepTogether(r.title), { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 44 * k, color: INK, lineHeight: 1.1, flexShrink: 1 }))))
        : null,
      // Plain English for any count (the class of 'All two on EventLinqs', 19 November 2026): never 'All 1' or 'All 2'.
      text(words.count === 1 ? 'It is on EventLinqs.' : words.count === 2 ? 'Both are on EventLinqs.' : `All ${words.count} are on EventLinqs.`, { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: 56 * k, color: INK, marginTop: 32 * k }),
      h('div', { marginTop: 14 * k }, exit(k, f, INK))),
    h('div', { justifyContent: 'flex-end', width: '100%' }, footOf(k, foot, false)))
}

/**
 * A photograph cropped to fill a band `bh` high (a licensed photograph of the night's kind, never a night's own), its
 * subject kept in the band by its focal point (the PM's 01:45 of 17 November 2026, scoring D3: on the venue story the
 * microphone's head sat hard against the strip, a centre crop of a subject high in its frame). A focal point a person set
 * by looking (0 to 1 across and down: the register's, or the stand-in's own, src/lib/social/stand-ins.ts) centres the
 * crop on it; with none, the middle. sharp's attention strategy was tried at 01:43 on 17 November and looked at: on the
 * microphone it framed the bright bokeh and dropped the microphone altogether, so no crop is chosen by a machine.
 */
export async function bandPhoto(url: string, f: DayFormat, bh: number, focal: { x: number; y: number } | null = null): Promise<DrawnPhoto | null> {
  const fetched = await fetchImageBytes(url)
  if (!fetched) return null
  const { default: sharp } = await import('sharp')
  const w = SIZE[f].w
  const source = sharp(Buffer.from(fetched.bytes)).rotate()
  let out: Buffer
  if (focal) {
    const meta = await source.metadata()
    const sw = meta.autoOrient?.width ?? meta.width ?? 0
    const sh = meta.autoOrient?.height ?? meta.height ?? 0
    if (!sw || !sh) return null
    const s = Math.max(w / sw, bh / sh)
    const rw = Math.max(w, Math.round(sw * s))
    const rh = Math.max(bh, Math.round(sh * s))
    const left = Math.min(rw - w, Math.max(0, Math.round(focal.x * rw - w / 2)))
    const top = Math.min(rh - bh, Math.max(0, Math.round(focal.y * rh - bh / 2)))
    out = await source.resize(rw, rh, { fit: 'fill' }).extract({ left, top, width: w, height: bh }).jpeg({ quality: 88 }).toBuffer()
  } else {
    out = await source.resize(w, bh, { fit: 'cover', position: 'centre' }).jpeg({ quality: 88 }).toBuffer()
  }
  return { uri: `data:image/jpeg;base64,${out.toString('base64')}`, width: w, height: bh }
}

/** The box a night's own photograph is shown whole in, on a cover and on its own slide. */
export function wholeBox(f: DayFormat, slide: 'cover' | 'feature'): { maxW: number; maxH: number } {
  const { w, k } = SIZE[f]
  if (slide === 'feature') return { maxW: Math.round(w - 48 * k), maxH: Math.round((f === 'square' ? 560 : f === 'story' ? 740 : 820) * k) }
  return { maxW: Math.round(w - 2 * 64 * k), maxH: Math.round((f === 'story' ? 520 : f === 'square' ? 300 : 470) * k) }
}

/** A night's own photograph shown whole: scaled to fit its box, never cropped (law 15). */
export async function wholePhoto(url: string, f: DayFormat, slide: 'cover' | 'feature'): Promise<DrawnPhoto | null> {
  const fetched = await fetchImageBytes(url)
  if (!fetched) return null
  const { default: sharp } = await import('sharp')
  const source = sharp(Buffer.from(fetched.bytes)).rotate()
  const meta = await source.metadata()
  const sw = meta.autoOrient?.width ?? meta.width ?? 0
  const sh = meta.autoOrient?.height ?? meta.height ?? 0
  if (!sw || !sh) return null
  const { maxW, maxH } = wholeBox(f, slide)
  const s = Math.min(maxW / sw, maxH / sh)
  const width = Math.round(sw * s)
  const height = Math.round(sh * s)
  const out = await source.resize(width, height, { fit: 'fill' }).jpeg({ quality: 88 }).toBuffer()
  return { uri: `data:image/jpeg;base64,${out.toString('base64')}`, width, height }
}
