import { describe, expect, it } from 'vitest'
import { HERO_SCRIM_GRADIENT, heroScrimAlphaAt, heroScrimStops } from '@/components/features/home/hero-scrim'

/**
 * THE HERO SCRIM IS TUNED BY MEASUREMENT AND CANNOT DRIFT BY HAND (close-out
 * C17.4, 7 September 2026). On production the headline over the daytime curated
 * raster cleared 2.3 to 1 at 390 wide because the wash where the headline sits
 * (34 to 58 percent up the hero) was 0.24 to 0.45. The stops were re-tuned by
 * compositing every curated raster at the drive geometry; these pins hold the
 * shape that measurement chose.
 */
describe('the hero scrim', () => {
  it('is a bottom-up navy gradient with seven stops from opaque to clear', () => {
    expect(HERO_SCRIM_GRADIENT.startsWith('linear-gradient(to top,')).toBe(true)
    const stops = heroScrimStops()
    expect(stops).toHaveLength(7)
    expect(stops[0]).toEqual({ fraction: 0, alpha: 0.92 })
    expect(stops[stops.length - 1]).toEqual({ fraction: 1, alpha: 0 })
  })

  it('never gets darker higher up', () => {
    const stops = heroScrimStops()
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i].fraction).toBeGreaterThan(stops[i - 1].fraction)
      expect(stops[i].alpha).toBeLessThanOrEqual(stops[i - 1].alpha)
    }
  })

  it('holds at least 0.78 across the band the headline occupies at 390 wide, and leaves the top clear', () => {
    // The headline's top edge sits 58 percent up the hero at 390 wide on the
    // measured geometry; the wash there is what white text over a bright sky
    // depends on. Above 86 percent the photograph must read unwashed.
    expect(heroScrimAlphaAt(0.34)).toBeGreaterThanOrEqual(0.78)
    expect(heroScrimAlphaAt(0.45)).toBeGreaterThanOrEqual(0.78)
    expect(heroScrimAlphaAt(0.58)).toBeGreaterThanOrEqual(0.6)
    expect(heroScrimAlphaAt(0.9)).toBeLessThan(0.1)
    expect(heroScrimAlphaAt(1)).toBe(0)
  })
})
