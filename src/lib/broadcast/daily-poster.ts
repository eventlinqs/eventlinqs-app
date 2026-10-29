/**
 * CREATIVE FAMILY F, THE DAILY POSTER (Lawal, 00:20 on 30 October 2026; the directive and its four corrections:
 * C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-DIRECTIVE-30OCT.md, the reference C:\dev\START-16OCT\DAILY-POSTER-
 * REFERENCE-4-ORIGINALS.png). One night, one poster: a photograph (or the night's title in type) over a navy panel
 * holding the date block, the title, the time, the venue with its street, at most two chips and the night's own link.
 *
 * Beside treatments A, B and C (treatment-layout.ts), never instead of them. PURE, and measured like them: every word
 * is fitted with the face it is drawn in, so treatments.tsx draws exactly this, and layoutFaults holds it to its box,
 * its margins, its safe area and its contrast.
 *
 * WHAT IS NEVER SAID unless the listing says it (the directive's correction 2): 'FREE IN <CITY>' only in section E's
 * E1 or E2 (cta.ts, verified free); a price only as the listing states it (ctaPriceLine, E5 never invents one); '18+'
 * only when the night is marked age restricted at 18; 'Book a table' and 'No membership needed' are never printed,
 * because no listing field holds them. A photograph only from an approved, unwithdrawn register row (correction 1);
 * without one the same poster is type-led. The footer is the night's own link or 'Link in bio', never the bare domain
 * (correction 3).
 */
import type { Cta } from '@/lib/events/cta'
import { FitError, GEOMETRY, GOLD, INK, NAVY, breakLines, fit, groundFor, type Block, type Layout, type Measurers, type Run, type TreatmentFormat } from './treatment-layout'

/** The verified facts of one night a poster is made from. */
export type PosterNight = {
  title: string
  startDate: string
  endDate?: string | null
  timezone: string | null
  cityName: string
  venueName: string | null
  /** events.venue_address: its first part, the street, is printed with the venue. */
  venueAddress: string | null
  cta: Cta
  /** ctaPriceLine's answer, or null where no price may be said. */
  priceLine: string | null
  isAgeRestricted: boolean
  ageMin: number | null
  /** Only from an approved, current, unexpired register row covering social posts (social_usable_images). */
  photo: { url: string; credit: string; archival: boolean; focal?: { x: number; y: number } } | null
  /** The night's /e/ share link as printed ('eventlinqs.com.au/e/ab12cd'), for the story, the square and the kit. */
  shortLink: string | null
}

export type PosterChip = { text: string; kind: 'admission' | 'qualifier' }

export type PosterWords = {
  variant: 'photo' | 'type'
  day: string
  num: string
  month: string
  title: string
  time: string
  venue: string
  /** 'FREE IN GEELONG', or null where the night is not verified free. */
  freeBadge: string | null
  chips: PosterChip[]
  credit: string | null
  footer: string
}

const parts = (iso: string, tz: string | null, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: tz ?? 'Australia/Melbourne', ...o }).formatToParts(new Date(iso))

/** '7pm', '9.30pm', in the night's own zone. */
export function clockOf(iso: string, tz: string | null): string {
  const p = parts(iso, tz, { hour: 'numeric', minute: '2-digit', hour12: true })
  const hour = p.find((x) => x.type === 'hour')?.value ?? ''
  const minute = p.find((x) => x.type === 'minute')?.value ?? '00'
  const ampm = (p.find((x) => x.type === 'dayPeriod')?.value ?? '').toLowerCase().replace(/\./g, '')
  return `${hour}${minute === '00' ? '' : `.${minute}`}${ampm}`
}

const dayKey = (iso: string, tz: string | null) => parts(iso, tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).map((x) => x.value).join('')

/**
 * Where the venue is, as the address's first part ('158 McKillop St', 'Centrepoint Arcade'), unless that part only
 * repeats the venue's name or is the town, state and postcode the line already ends with.
 */
export function streetOf(address: string | null, venueName: string | null = null, city: string | null = null): string | null {
  const first = (address ?? '').split(',')[0]?.trim() ?? ''
  if (!first) return null
  const same = (a: string | null) => Boolean(a) && first.toLowerCase() === (a as string).trim().toLowerCase()
  if (same(venueName) || same(city)) return null
  if (/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b\s*\d{4}$/i.test(first) || (city && first.toLowerCase().startsWith(city.toLowerCase()))) return null
  return first
}

/** The admission chip, from section E's words only. */
export function admissionOf(n: Pick<PosterNight, 'cta' | 'priceLine'>): string | null {
  if (n.cta.state === 'free_open') return 'Free entry'
  if (n.cta.state === 'free_registration') return 'Free, register first'
  if ((n.cta.state === 'paid_native' || n.cta.state === 'paid_external') && n.priceLine && /\$\s?\d/.test(n.priceLine)) return n.priceLine
  if (n.cta.state === 'paid_external' && n.cta.where) return `Tickets at ${n.cta.where}`
  if (n.cta.state === 'paid_native') return 'Tickets on EventLinqs'
  return null
}

/** The words of one night's poster at one format, every one true from the listing. */
export function posterWords(n: PosterNight, format: TreatmentFormat): PosterWords {
  const tz = n.timezone
  const weekday = parts(n.startDate, tz, { weekday: 'short' }).find((x) => x.type === 'weekday')?.value ?? ''
  const num = parts(n.startDate, tz, { day: 'numeric' }).find((x) => x.type === 'day')?.value ?? ''
  const month = parts(n.startDate, tz, { month: 'short' }).find((x) => x.type === 'month')?.value ?? ''
  const start = clockOf(n.startDate, tz)
  const sameDay = n.endDate ? dayKey(n.endDate, tz) === dayKey(n.startDate, tz) : false
  const time = n.endDate && sameDay ? `${start} to ${clockOf(n.endDate, tz)}` : `From ${start}`
  const venue = [n.venueName, streetOf(n.venueAddress, n.venueName, n.cityName), n.cityName].filter((s): s is string => Boolean(s && s.trim())).join(', ')

  const verifiedFree = n.cta.state === 'free_open' || n.cta.state === 'free_registration'
  const chips: PosterChip[] = []
  const admission = admissionOf(n)
  if (admission) chips.push({ text: admission, kind: 'admission' })
  if (n.isAgeRestricted && n.ageMin === 18) chips.push({ text: '18+', kind: 'qualifier' })

  if (format !== 'portrait' && !n.shortLink) throw new FitError('a story or square poster needs the night\'s own /e/ link; the bare domain is never its footer')
  return {
    variant: n.photo ? 'photo' : 'type',
    day: weekday.toUpperCase().replace('.', ''),
    num,
    month: month.toUpperCase().replace('.', ''),
    title: n.title.replace(/\s+/g, ' ').trim(),
    time,
    venue,
    freeBadge: verifiedFree ? `FREE IN ${n.cityName.toUpperCase()}` : null,
    chips,
    credit: n.photo ? `Photo: ${n.photo.credit}${n.photo.archival && !/past event/i.test(n.photo.credit) ? ', past event' : ''}` : null,
    footer: format === 'portrait' ? 'Link in bio' : (n.shortLink as string),
  }
}

/** Where each format's poster sits: the image zone, the panel, and the story's clear bands (the directive's table). */
const POSTER = {
  portrait: { imageH: 850, panelTop: 850, panelBottom: 1350, safeTop: 0, safeBottom: 0 },
  square: { imageH: 620, panelTop: 620, panelBottom: 1080, safeTop: 0, safeBottom: 0 },
  // Words clear of the top 14% (269) and the bottom 35% (672): the panel ends at 1248.
  story: { imageH: 778, panelTop: 778, panelBottom: 1248, safeTop: 269, safeBottom: 672 },
} as const

const DATE_W = 176
const CHIP_H = 56
const CHIP_TEXT = 28

/** The daily poster for one night at one format. Throws FitError rather than cut a fact. */
export function layoutDailyPoster(format: TreatmentFormat, w: PosterWords, m: Measurers, photo?: { url: string; focal?: { x: number; y: number } } | null): Layout {
  const g = GEOMETRY[format]
  // When the night's own /e/ link does not fit beside two chips at 26 px, it takes its own line under them, and the panel
  // grows up by that line (the square and story only: the feed says 'Link in bio'); no word is set smaller for it.
  const chipWidths = w.chips.slice(0, 2).map((chip) => Math.ceil(m.manrope800(chip.text, CHIP_TEXT)) + 4 + 48)
  const chipsW = chipWidths.reduce((s, cw) => s + cw, 0) + Math.max(0, chipWidths.length - 1) * 16
  const besideRoom = g.w - 2 * g.pad - chipsW - (chipWidths.length > 0 ? 24 : 0)
  const ownLine = chipWidths.length > 0 && Math.ceil(m.manrope800(w.footer, 26)) + 4 > besideRoom
  const lift = ownLine ? Math.ceil(28 * 1.2 + 14) : 0
  const base = POSTER[format]
  const p = { ...base, imageH: base.imageH - lift, panelTop: base.panelTop - lift }
  const pad = g.pad
  const runs: Run[] = []
  const blocks: Block[] = []
  const badgeY = Math.max(p.safeTop + 24, 40)

  if (w.variant === 'photo' && !photo) throw new FitError('the photo variant needs its approved photograph')

  // The panel: midnight navy, full width.
  blocks.push({ role: 'rule', x: 0, y: p.panelTop, w: g.w, h: g.h - p.panelTop, color: NAVY })

  // Corner badges: 'FREE IN <CITY>' top left (verified free only), the EventLinqs pill top right.
  const mark = 'EventLinqs'
  const markW = Math.ceil(m.manrope800(mark, 24)) + 44
  blocks.push({ role: 'pill', x: g.w - pad - markW, y: badgeY, w: markW, h: 48, color: NAVY })
  runs.push({ role: 'badge-mark', lines: [mark], face: 'manrope800', size: 24, lineHeight: 1.2, letterSpacing: 0, color: INK, ground: NAVY, x: g.w - pad - markW + 22, y: badgeY + 9, w: markW - 44 })
  if (w.freeBadge) {
    const badgeW = Math.min(g.w - 2 * pad - markW - 24, Math.ceil(m.manrope800(w.freeBadge, 24) + 0.06 * 24 * w.freeBadge.length) + 44)
    blocks.push({ role: 'pill', x: pad, y: badgeY, w: badgeW, h: 48, color: GOLD })
    runs.push({ role: 'badge-free', lines: [w.freeBadge], face: 'manrope800', size: 24, lineHeight: 1.2, letterSpacing: 0.06, color: NAVY, ground: GOLD, x: pad + 22, y: badgeY + 9, w: badgeW - 44 })
  }

  // The image zone: the approved photograph, or the night's title set large over the ground.
  if (w.variant === 'type') {
    const top = badgeY + 48 + 40
    const height = p.imageH - top - 48
    const big = fit(w.title, m.compressed, { max: format === 'story' ? 210 : 180, min: 88, width: g.w - 2 * pad, maxLines: 3, lineHeight: 0.98, spacing: -0.005, height })
    const blockH = big.lines.length * big.size * big.lineHeight
    runs.push({ role: 'title-big', lines: big.lines, face: 'compressed', size: big.size, lineHeight: big.lineHeight, letterSpacing: -0.005, color: INK, ground: NAVY, x: pad, y: p.imageH - 48 - blockH, w: g.w - 2 * pad })
  }
  if (w.credit) {
    const creditW = Math.ceil(m.manrope700(w.credit, 22)) + 36
    blocks.push({ role: 'pill', x: g.w - pad - creditW, y: p.imageH - 24 - 40, w: creditW, h: 40, color: NAVY })
    runs.push({ role: 'credit', lines: [w.credit], face: 'manrope700', size: 22, lineHeight: 1.2, letterSpacing: 0, color: INK, ground: NAVY, x: g.w - pad - creditW + 18, y: p.imageH - 24 - 40 + 7, w: creditW - 36, align: 'right' })
  }

  // The date block: outlined in gold, day, number (120 or more), month.
  const dateTop = p.panelTop + 44
  const dateH = 28 * 1.2 + 120 * 1.0 + 28 * 1.2 + 28
  blocks.push({ role: 'bar', x: pad, y: dateTop, w: DATE_W, h: dateH, color: GOLD, outline: 4, radius: 18 })
  const inner = { x: pad + 12, w: DATE_W - 24 }
  const centre = (text: string, face: 'manrope800' | 'archivo', size: number) => {
    const tw = Math.ceil(m[face](text, size))
    return { x: inner.x + Math.max(0, (inner.w - tw) / 2), w: Math.min(inner.w, tw + 2) }
  }
  const dayAt = centre(w.day, 'manrope800', 28)
  runs.push({ role: 'date-day', lines: [w.day], face: 'manrope800', size: 28, lineHeight: 1.2, letterSpacing: 0, color: GOLD, ground: NAVY, x: dayAt.x, y: dateTop + 14, w: dayAt.w })
  const numSize = 120
  const numAt = centre(w.num, 'archivo', numSize)
  runs.push({ role: 'date-num', lines: [w.num], face: 'archivo', size: numSize, lineHeight: 1, letterSpacing: 0, color: INK, ground: NAVY, x: numAt.x, y: dateTop + 14 + 28 * 1.2, w: numAt.w })
  const monAt = centre(w.month, 'manrope800', 28)
  runs.push({ role: 'date-month', lines: [w.month], face: 'manrope800', size: 28, lineHeight: 1.2, letterSpacing: 0, color: GOLD, ground: NAVY, x: monAt.x, y: dateTop + 14 + 28 * 1.2 + numSize, w: monAt.w })

  // Beside it: the title (type-led posters carry it once, in the image zone), the time, the venue.
  const textX = pad + DATE_W + 36
  const textW = g.w - pad - textX
  let y = dateTop
  if (w.variant === 'photo') {
    const title = fit(w.title, m.archivo, { max: 84, min: 64, width: textW, maxLines: 2, lineHeight: 1.04, spacing: -0.01 })
    runs.push({ role: 'title', lines: title.lines, face: 'archivo', size: title.size, lineHeight: title.lineHeight, letterSpacing: -0.01, color: INK, ground: NAVY, x: textX, y, w: textW })
    y += title.lines.length * title.size * title.lineHeight + 14
  }
  const time = fit(w.time, m.manrope700, { max: 38, min: 34, width: textW, maxLines: 1, lineHeight: 1.25, spacing: 0 })
  runs.push({ role: 'time', lines: time.lines, face: 'manrope700', size: time.size, lineHeight: 1.25, letterSpacing: 0, color: GOLD, ground: NAVY, x: textX, y, w: textW })
  y += time.size * 1.25 + 8
  const venueLines = breakLines(w.venue, m.manrope600, 28, textW, 0)
  if (!venueLines || venueLines.length > 2) throw new FitError(`the venue "${w.venue}" does not fit two lines at 28px`)
  runs.push({ role: 'venue', lines: venueLines, face: 'manrope600', size: 28, lineHeight: 1.3, letterSpacing: 0, color: INK, ground: NAVY, x: textX, y, w: textW })
  const textBottom = y + venueLines.length * 28 * 1.3

  // The bottom row: at most two chips, then the night's own link beside them; when an /e/ link does not fit beside
  // two chips at 26 px, the chips keep the row and the link takes its own line under them, never a smaller size.
  const full = g.w - 2 * pad
  const footerH = 28 * 1.2
  const rowY = ownLine ? p.panelBottom - 40 - footerH - 14 - CHIP_H : p.panelBottom - 40 - CHIP_H
  if (rowY < Math.max(textBottom, dateTop + dateH) + 20) throw new FitError('the panel cannot hold the title, the time, the venue, the chips and the link at their sizes')
  const footer = fit(w.footer, m.manrope800, { max: 28, min: 26, width: ownLine ? full : besideRoom, maxLines: 1, lineHeight: 1.2, spacing: 0 })
  const footerW = Math.ceil(m.manrope800(footer.lines[0], footer.size)) + 4
  const footerY = ownLine ? p.panelBottom - 40 - footer.size * 1.2 : rowY + (CHIP_H - footer.size * 1.2) / 2
  runs.push({ role: 'footer', lines: footer.lines, face: 'manrope800', size: footer.size, lineHeight: 1.2, letterSpacing: 0, color: INK, ground: NAVY, x: g.w - pad - footerW, y: footerY, w: footerW, align: 'right' })
  let chipX = pad
  for (const [i, chip] of w.chips.slice(0, 2).entries()) {
    const tw = chipWidths[i] - 48
    const cw = chipWidths[i]
    if (chipX + cw > g.w - pad) throw new FitError(`the chip "${chip.text}" does not fit the row`)
    const admission = chip.kind === 'admission'
    blocks.push({ role: 'pill', x: chipX, y: rowY, w: cw, h: CHIP_H, color: GOLD, ...(admission ? {} : { outline: 3 }) })
    runs.push({ role: `chip-${i}`, lines: [chip.text], face: 'manrope800', size: CHIP_TEXT, lineHeight: 1.2, letterSpacing: 0, color: admission ? NAVY : INK, ground: admission ? GOLD : NAVY, x: chipX + 24, y: rowY + (CHIP_H - CHIP_TEXT * 1.2) / 2, w: tw })
    chipX += cw + 16
  }

  return {
    treatment: w.variant === 'photo' ? 'photo' : 'type',
    format,
    w: g.w,
    h: g.h,
    safeTop: p.safeTop,
    safeBottom: p.safeBottom,
    photo: w.variant === 'photo' && photo ? { x: 0, y: 0, w: g.w, h: p.imageH, url: photo.url, focal: photo.focal } : null,
    scrim: null,
    // The type-led ground is the approved three-stop fall to navy (groundFor), from the brand gold: no colour of its own.
    ground: w.variant === 'type' ? groundFor(GOLD, 'night') : null,
    art: [],
    blocks,
    runs,
  }
}
