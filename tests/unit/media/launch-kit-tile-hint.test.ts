/**
 * THE LAUNCH KIT TILE'S HINT, AGAINST THE LADDER IT ACTUALLY SITS IN.
 *
 * `MEDIA_SIZES.tileDashboardHalfColumn` is the one hint on this platform whose
 * slot is a DASHBOARD column rather than a public one, and until 19 September
 * 2026 it carried a public three-up grid's string, `(max-width: 640px) 50vw,
 * (max-width: 1024px) 33vw, 300px`. It under-fetched at 6 of the 9 viewports the
 * fidelity drive claims the contract at, worst x0.59, and every gate was green
 * because the route is behind a login and nothing signed in to it.
 *
 * WHAT THIS TEST IS FOR THAT THE DRIVE AND THE GUARD ARE NOT.
 *
 *   - `scripts/verify/image-hint-fidelity-drive.mjs` signs in and measures, which
 *     is the only thing that can prove a real browser agrees. It measures NINE
 *     viewports, because each one costs a page load.
 *   - `scripts/guards/marketing-bands-are-supplyable.mjs` compares the hint's
 *     fixed term with one declared number, which holds the capped end and says
 *     nothing about the curve below it.
 *   - This sweeps EVERY integer viewport from 320 to 2560 in a pure function, so
 *     a future edit that is right at 390, 768 and 1440 and wrong at 1023 fails
 *     here rather than on somebody's screen.
 *
 * WHY IT IS NOT A TAUTOLOGY, which is the failure mode of a test that reads the
 * same tree the guard reads. The hint is READ from the real module: it is the
 * subject. The slot arithmetic below is written from the LAYOUT - the Tailwind
 * classes on src/app/(dashboard)/layout.tsx, dashboard-sidebar.tsx and the
 * launch-kit page - and is an independent claim about the same thing. The two
 * are then anchored to a browser: every number in MEASURED came off
 * `getBoundingClientRect()` at DPR 2 on 19 September 2026
 * (C:\dev\EVIDENCE\LB-TILE\final\report.json and tile-{390,768,1440}.png), so if
 * the arithmetic were wrong in a way that happened to match a wrong hint, those
 * cases would catch it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEDIA_SIZES } from '@/components/media/sizes'
import { readLadder } from '../../../scripts/guards/lib/candidate-ladder.mjs'

/** The contract is claimed at 2x, the same density the fidelity drive drives. */
const DPR = 2

/* ── The layout, in numbers, read off the classes rather than remembered ───── */

/** `w-16` when collapsed and `w-60` when not, and `hidden md:block` below 768. */
const SIDEBAR_COLLAPSED = 64
const SIDEBAR_EXPANDED = 240
/** `<main className="px-4 py-8 sm:px-6 lg:px-8">`, one side. */
const padding = (v: number) => (v >= 1024 ? 32 : v >= 640 ? 24 : 16)
const sidebar = (v: number, collapsed: boolean) =>
  v < 768 ? 0 : collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED
/**
 * `max-w-7xl`, which `globals.css` overrides to 87.5rem. The padding sits on
 * <main> OUTSIDE this cap, unlike every public container on the platform, so the
 * full 1400 is content. That difference is the whole reason a public grid's hint
 * was wrong here.
 */
const CONTAINER_CAP = 1400
/** `grid grid-cols-1 gap-6 lg:grid-cols-2` on the kit's two-up row. */
const GRID_GAP = 24
const TWO_UP_FROM = 1024
/** The card spends this on chrome before the image: the section's 1px border
 *  either side, `px-6` either side of the body, and the image wrapper's own 1px
 *  border either side. */
const CARD_CHROME = 2 + 48 + 2

function slotWidth(viewport: number, collapsed: boolean): number {
  const content = Math.min(CONTAINER_CAP, viewport - sidebar(viewport, collapsed) - 2 * padding(viewport))
  const column = viewport >= TWO_UP_FROM ? (content - GRID_GAP) / 2 : content
  return column - CARD_CHROME
}

/* ── The hint, resolved the way a browser resolves it ──────────────────────── */

/** `(max-width: Npx) <len>, ... , <len>` to CSS pixels at one viewport. */
function resolveHint(hint: string, viewport: number): number {
  const toPx = (len: string) => {
    const vw = /^([\d.]+)vw$/.exec(len.trim())
    if (vw) return (Number(vw[1]) / 100) * viewport
    const px = /^([\d.]+)px$/.exec(len.trim())
    if (px) return Number(px[1])
    throw new Error(`a sizes term this test cannot read: ${len}`)
  }
  for (const clause of hint.split(',').map(s => s.trim())) {
    const conditional = /^\(max-width:\s*(\d+)px\)\s+(.+)$/.exec(clause)
    if (!conditional) return toPx(clause)
    if (viewport <= Number(conditional[1])) return toPx(conditional[2])
  }
  throw new Error(`${hint} resolved to nothing at ${viewport}, so it has no unconditional term`)
}

const HINT = MEDIA_SIZES.tileDashboardHalfColumn

/**
 * Every one of these came off a real browser at DPR 2 rather than out of the
 * arithmetic above. The sidebar was EXPANDED (no `el_sidebar_collapsed` cookie),
 * which is the default a person sees, and 1920 is the capped case.
 */
const MEASURED: ReadonlyArray<[viewport: number, slot: number, collapsed: boolean]> = [
  [360, 276, false],
  [390, 306, false],
  [430, 346, false],
  [640, 540, false],
  [768, 428, false],
  [1280, 424, false],
  [1440, 504, false],
  [1920, 636, true],
]

describe('the launch kit invitation tile hint', () => {
  it.each(MEASURED)('reproduces the browser-measured slot at %ipx', (viewport, slot, collapsed) => {
    expect(slotWidth(viewport, collapsed)).toBe(slot)
  })

  it('never asks for less than the slot, at every viewport from 320 to 2560', () => {
    const short: Array<string> = []
    for (let v = 320; v <= 2560; v += 1) {
      // The COLLAPSED sidebar is the wider main, so it is the worst case for a
      // hint: a hint that covers it covers the expanded one too.
      const slot = slotWidth(v, true)
      const asked = resolveHint(HINT, v)
      if (asked < slot) short.push(`${v}: asked ${Math.round(asked)} for a ${Math.round(slot)}px slot`)
    }
    expect(short.slice(0, 8)).toEqual([])
  })

  /*
   * THE HINT THIS REPLACED, kept as the regression rather than as a sentence
   * about one. If somebody reinstates a public grid ladder on this call site the
   * sweep above fails, and this says what it used to cost.
   *
   * TWO DIFFERENT QUESTIONS, and writing this test is what separated them. A
   * hint can be SHORTER than its slot and still select a big enough candidate,
   * because the browser rounds slot x DPR up to a rung on the configured ladder.
   * The old hint was short at 8 of the 9 drive viewports; the browser actually
   * under-fetched at 7 of them. 390 is the difference: 50vw of 390 is 195, and
   * 195 x 2 rounds up to the 640 rung, which clears a 612 need by accident.
   * A hint that is only right because of rounding is not right, so this pins
   * both numbers and neither is allowed to stand in for the other.
   */
  const WAS = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px'
  const DRIVE_VIEWPORTS = [360, 390, 430, 640, 768, 1024, 1280, 1440, 1920]

  it('was SHORTER than the slot at 8 of the 9 drive viewports', () => {
    const short = DRIVE_VIEWPORTS.filter(v => resolveHint(WAS, v) < slotWidth(v, false))
    expect(short).toEqual([360, 390, 430, 640, 768, 1280, 1440, 1920])
  })

  it('made the browser UNDER-FETCH at 7 of them, which is what the drive recorded', () => {
    /*
     * The ladder is READ from next.config.ts, not typed here. The first draft
     * typed one out and invented three rungs this build does not carry (16, 48,
     * 96); the seven happened to come out right anyway, which is the worst way
     * for a wrong constant to behave. If the ladder ever changes so that its
     * rounding rescues a different viewport, this count moves and it SHOULD:
     * that is a real change in how forgiving the configuration is.
     */
    const read = readLadder(readFileSync('next.config.ts', 'utf8'))
    expect(read).not.toBeNull()
    const LADDER = read!.ladder
    /** next/image's own rule: the smallest configured width at or above the need. */
    const chose = (need: number) => LADDER.find(w => w >= need) ?? LADDER[LADDER.length - 1]
    const underFetched = DRIVE_VIEWPORTS.filter(v => {
      const slot = slotWidth(v, false)
      return chose(resolveHint(WAS, v) * DPR) < slot * DPR
    })
    // Exactly the seven rows in C:\dev\EVIDENCE\LB-TILE\before\report.json.
    expect(underFetched).toEqual([360, 430, 640, 768, 1280, 1440, 1920])
  })

  it('ends in a fixed term, so above the container cap it stops growing with the viewport', () => {
    expect(HINT.trim()).toMatch(/\d+px$/)
    // Past the cap the slot is constant, so the hint must be too.
    expect(resolveHint(HINT, 2000)).toBe(resolveHint(HINT, 2560))
    expect(slotWidth(2000, true)).toBe(slotWidth(2560, true))
  })

  it('is not shared with any other layout, because one string cannot be right for two', () => {
    const sharing = Object.entries(MEDIA_SIZES).filter(([key, value]) => key !== 'tileDashboardHalfColumn' && value === HINT)
    expect(sharing).toEqual([])
  })

  it('leaves a 2x screen enough physical pixels at the widest slot', () => {
    // 636 CSS px capped, so 1272 physical. The organiser-supplied cover measured
    // on 19 September delivered 1440x1800 (EVIDENCE/LB-TILE/delivered-pixels.txt),
    // which is why this tile is genuinely sharp and not only requested-sharp.
    expect(slotWidth(2560, true) * DPR).toBe(1272)
  })
})
