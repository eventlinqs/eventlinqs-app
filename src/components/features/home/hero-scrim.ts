/**
 * THE ONE HERO SCRIM. The bottom-up navy wash that sits between every homepage
 * hero photograph and its text, so the headline and the subline clear 4.5 to 1
 * on any image in the set and the gold call to action stands off the ground
 * (Design system: every hero shares one treatment; close-out C17.4 measures it).
 *
 * Defined once here since close-out C17 (7 September 2026) because the carousel
 * and the no-event hero paint the same scrim, and a scrim tuned in one place and
 * copied to another is how the C3 scrim defect happened.
 *
 * TUNED BY MEASUREMENT, 7 September 2026. The previous stops (0.84 at the
 * bottom, 0.54 at 20 percent, 0.24 at 44 percent, 0.06 at 68 percent) were
 * measured on production against the daytime curated raster: the headline sits
 * 34 to 58 percent up the hero at 390 wide, where that wash was 0.24 to 0.45, and
 * white text over the bright crowd cleared only 2.3 to 1 (median 2.4). Every
 * curated raster was then composited offline at the exact drive geometry
 * (C:\dev\EVIDENCE\C17\scrim-sim-round2.md, calibrated to the production median)
 * and these stops are the lightest of three candidates that clear 4.5 to 1 for
 * the headline and the subline at the mean and the median on all three images at
 * 390, 768 and 1440, with the 90th percentile of the ground never below 5.5 to 1
 * for the headline. The upper 40 percent of the photograph stays clear. The
 * gold eyebrow is a brand label above the headline and sits where the wash is
 * 0.5 to 0.6; it reads at 2.5 to 3 to 1 on the two brightest images at 390 and
 * is recorded as such rather than darkened further.
 *
 * Stops as [fraction from the bottom, alpha]:
 *   0 -> 0.92, 0.30 -> 0.86, 0.45 -> 0.78, 0.58 -> 0.60, 0.72 -> 0.35, 0.86 -> 0.12, 1 -> 0.
 * tests/unit/home/hero-scrim.test.ts pins the shape so it cannot drift by hand.
 */
export const HERO_SCRIM_GRADIENT =
  'linear-gradient(to top, rgba(10,22,40,0.92) 0%, rgba(10,22,40,0.86) 30%, rgba(10,22,40,0.78) 45%, rgba(10,22,40,0.60) 58%, rgba(10,22,40,0.35) 72%, rgba(10,22,40,0.12) 86%, rgba(10,22,40,0) 100%)'

/** The stops, parsed, for the test and for anyone reasoning about the wash at a height. */
export function heroScrimStops(gradient: string = HERO_SCRIM_GRADIENT): Array<{ fraction: number; alpha: number }> {
  const stops: Array<{ fraction: number; alpha: number }> = []
  const re = /rgba\(10,22,40,([0-9.]+)\)\s+([0-9.]+)%/g
  let m: RegExpExecArray | null
  while ((m = re.exec(gradient)) !== null) stops.push({ fraction: Number(m[2]) / 100, alpha: Number(m[1]) })
  return stops
}

/** The wash at a height, as a fraction from the bottom, by linear interpolation between stops. */
export function heroScrimAlphaAt(fraction: number, gradient: string = HERO_SCRIM_GRADIENT): number {
  const stops = heroScrimStops(gradient)
  if (stops.length === 0) return 0
  if (fraction <= stops[0].fraction) return stops[0].alpha
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1]
    const b = stops[i]
    if (fraction <= b.fraction) return a.alpha + ((fraction - a.fraction) / (b.fraction - a.fraction)) * (b.alpha - a.alpha)
  }
  return stops[stops.length - 1].alpha
}
