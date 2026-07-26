/**
 * Assisted seat detection, the pure core: given luminance samples taken
 * along the organiser's guide line over a floor plan, decide whether the
 * line has enough contrast to trust and count the dark blobs (seats).
 *
 * Kept free of canvas and DOM so the counting maths is unit-tested; the
 * builder feeds it samples from an offscreen canvas.
 */

/** Minimum luminance standard deviation to trust the line at all. */
const MIN_STD = 10
/** A blob counts after this many consecutive dark samples. */
const MIN_RUN = 2
/** Blobs must be separated by at least this many light samples. */
const MIN_GAP = 2

/**
 * Count dark runs along the samples. The gap BEFORE a run is what
 * separates it from the previous one, so it is measured before the run
 * starts, never reset by the run itself.
 */
export function countDarkRuns(
  lums: number[],
  threshold: number,
  minRun = MIN_RUN,
  minGap = MIN_GAP,
): number {
  let runs = 0
  let darkLength = 0
  let gapLength = Number.MAX_SAFE_INTEGER // the line starts on open paper
  for (const lum of lums) {
    if (lum < threshold) {
      darkLength += 1
      if (darkLength === minRun && gapLength >= minGap) runs += 1
    } else {
      if (darkLength > 0) gapLength = 1
      else gapLength = Math.min(gapLength + 1, Number.MAX_SAFE_INTEGER)
      darkLength = 0
    }
  }
  return runs
}

/**
 * The seat count for a sampled line, or null when the line cannot be
 * trusted (too flat to carry seat marks, or fewer than two blobs).
 */
export function detectSeatCount(lums: number[]): number | null {
  if (lums.length === 0) return null
  const mean = lums.reduce((sum, v) => sum + v, 0) / lums.length
  const std = Math.sqrt(lums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lums.length)
  if (std <= MIN_STD) return null
  const threshold = mean - 0.6 * std
  const runs = countDarkRuns(lums, threshold)
  return runs >= 2 ? Math.min(60, runs) : null
}
