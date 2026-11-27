/**
 * THE PHONE CHECK (Lawal, 16:52 on 27 November 2026: "no piece reaches Lawal without a passed phone check"; the PM's 17:00,
 * car Q; item K of the social studio's locked standard; migration 20261127170001). The studio ticks ten items on every
 * slide, phone first, and saves the checklist with the piece (studio_pieces.qa_checklist), with a phone view of every slide
 * (studio_uploads, view 'phone'). This reads that proof the one way, for the move (./studio-move.ts), which hands a piece on
 * only when nothing here is said, and for /admin/social, which shows the result beside the phone views. Pure.
 */

/** The ten items, phone first, in the standard's order (item K). */
export const CHECK_ITEMS = [
  'readable without zooming',
  'contrast',
  'nothing cut off, clear of the edges and the Story zones',
  'slide 1 stops the scroll and survives the grid crop',
  "one message a slide, in the Design System's look",
  'facts checked again against production',
  'a specific call to action',
  'photo rights',
  'equal to or better than the floor and the research examples',
  'desktop view clean',
] as const

export type CheckItem = { readonly item: number; readonly pass: boolean; readonly seen: string }
export type SlideCheck = { readonly slide: number; readonly items: readonly CheckItem[] }

const record = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const wholeNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
/** A pass is the boolean true, or the word the studio may write for it ('pass' or 'passed'); anything else is not one. */
const passed = (v: unknown): boolean => v === true || (typeof v === 'string' && ['pass', 'passed'].includes(v.trim().toLowerCase()))

/** Each slide's entry as written, by its number ('slide' or 'slide_no'), else by its place in the list. Pure. */
export function checklistSlides(checklist: unknown): Map<number, unknown> | null {
  const slides = record(checklist)?.slides
  if (!Array.isArray(slides)) return null
  const out = new Map<number, unknown>()
  slides.forEach((entry, i) => {
    const r = record(entry)
    const n = wholeNumber(r?.slide) ?? wholeNumber(r?.slide_no) ?? i + 1
    if (!out.has(n)) out.set(n, entry)
  })
  return out
}

/**
 * Everything that keeps a piece from passing: a missing checklist, a slide with no entry, a slide without its ten items,
 * an item not passed (with what was seen), an item with no line on what was seen, a slide with no phone view. Empty means
 * it passed. Pure.
 */
export function checkProblems(checklist: unknown, slides: number, phoneViews: ReadonlySet<number>): string[] {
  const problems: string[] = []
  const entries = checklistSlides(checklist)
  if (entries === null) problems.push('no phone checklist saved with the piece')
  for (let n = 1; n <= slides; n++) {
    if (!phoneViews.has(n)) problems.push(`slide ${n} has no phone view`)
    if (entries === null) continue
    const items = record(entries.get(n))?.items
    if (!Array.isArray(items)) {
      problems.push(`slide ${n} has no checklist`)
      continue
    }
    const byItem = new Map<number, Record<string, unknown>>()
    items.forEach((it, i) => {
      const r = record(it)
      if (r === null) return
      const k = wholeNumber(r.item) ?? i + 1
      if (!byItem.has(k)) byItem.set(k, r)
    })
    for (let k = 1; k <= CHECK_ITEMS.length; k++) {
      const it = byItem.get(k)
      const name = CHECK_ITEMS[k - 1]
      if (!it) {
        problems.push(`slide ${n} item ${k} (${name}) is not ticked`)
        continue
      }
      const seen = typeof it.seen === 'string' ? it.seen.trim() : ''
      if (!passed(it.pass)) problems.push(`slide ${n} item ${k} (${name}) did not pass${seen ? `: ${seen.slice(0, 200)}` : ''}`)
      else if (!seen) problems.push(`slide ${n} item ${k} (${name}) has no line on what was seen`)
    }
  }
  return problems
}

/** The checklist as /admin/social lists it: each slide's items with pass and what was seen, in order. Pure. */
export function checklistRows(checklist: unknown, slides: number): SlideCheck[] {
  const entries = checklistSlides(checklist)
  if (entries === null) return []
  const out: SlideCheck[] = []
  for (let n = 1; n <= slides; n++) {
    const items = record(entries.get(n))?.items
    if (!Array.isArray(items)) continue
    out.push({
      slide: n,
      items: items
        .flatMap((it, i) => {
          const r = record(it)
          return r === null ? [] : [{ item: wholeNumber(r.item) ?? i + 1, pass: passed(r.pass), seen: typeof r.seen === 'string' ? r.seen.trim() : '' }]
        })
        .sort((a, b) => a.item - b.item),
    })
  }
  return out
}

/** One line for the piece: passed, with its count, or not passed with every reason. Pure. */
export function checkLine(problems: readonly string[], slides: number): string {
  return problems.length === 0
    ? `Phone check passed: all ${CHECK_ITEMS.length} items on each of ${slides} slide${slides === 1 ? '' : 's'}, and a phone view of every slide.`
    : `Phone check NOT passed: ${problems.join('; ')}.`
}
