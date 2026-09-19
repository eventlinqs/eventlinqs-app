/**
 * DID ASKING THE QUESTION COST THE ORGANISER SALES. THE ARITHMETIC.
 *
 * AQ1: "checkout conversion measured before and after, and if it falls more
 * than two percent the surface moves to the ticket page instead". Pure, so the
 * rule can be tested at every boundary on both sides without a database, which
 * matters more here than usual: this is the number that decides whether a
 * consent capture is allowed to stay on the surface that sells tickets.
 *
 * WHAT "CONVERSION" MEANS HERE, stated rather than assumed. A reservation is
 * created when a buyer commits to a set of tickets and is sent to the payment
 * step, and it ends either converted or not. So the rate is
 *
 *     converted reservations / SETTLED reservations
 *
 * and reservations still in flight are excluded from both halves. Counting them
 * in the denominator would report a lower rate every time the measurement was
 * taken while somebody was mid purchase, and the dip would look like the
 * question and be the clock.
 *
 * "MORE THAN TWO PERCENT" IS READ AS TWO PERCENTAGE POINTS, and the report
 * carries both readings so the choice is visible rather than buried. A
 * conversion rate is quoted in percent, so a fall "of two percent" from 61 per
 * cent is ordinarily understood as 59 per cent rather than 59.78 per cent. The
 * relative fall is computed and printed beside it; if the owner rules the other
 * way, one constant moves and the sentence follows it.
 */

/** AQ1's threshold, in percentage points of conversion. */
export const CAPTURE_CONVERSION_FALL_LIMIT_POINTS = 2

/**
 * THE SMALLEST SAMPLE THE TWO PERCENT RULE IS ALLOWED TO BE APPLIED TO.
 *
 * This is an engineering floor, not a number from the item, and it is here
 * because a rule with no floor fires on noise. The standard error of a
 * proportion is sqrt(p(1-p)/n); at p = 0.5 and n = 100 that is 5 percentage
 * points for ONE rate, so a two point difference between two such rates is
 * comfortably inside ordinary variation. The floor does not make a small sample
 * meaningful; it stops the platform ACTING on one. Below it the verdict is
 * "not enough evidence" and the numbers are still shown, because hiding them
 * would be the same mistake in the other direction.
 */
export const CAPTURE_CONVERSION_MINIMUM_SAMPLE = 100

export interface ConversionSample {
  /** Reservations created in this period whose outcome is settled. */
  settled: number
  /** Of those, the ones that became an order. */
  converted: number
}

export interface ConversionRate extends ConversionSample {
  /** Percent, 0 to 100, or null when nothing settled. Never zero for "unknown". */
  percent: number | null
}

export type ConversionVerdict = 'move' | 'hold' | 'not-enough-evidence'

export interface ConversionComparison {
  before: ConversionRate
  after: ConversionRate
  /** after minus before, in percentage points. Null when either rate is unknown. */
  deltaPoints: number | null
  /** The same fall as a proportion of the earlier rate, for the other reading. */
  deltaRelativePercent: number | null
  /**
   * The standard error of the DIFFERENCE between the two rates, in points. It
   * does not change the verdict, which is the owner's rule. It is reported so a
   * two point fall measured on 120 reservations is not mistaken for the same
   * fact as a two point fall measured on twelve thousand.
   */
  standardErrorPoints: number | null
  verdict: ConversionVerdict
}

/** The rate, with null rather than zero when there is nothing to divide by. */
export function conversionRate(sample: ConversionSample): ConversionRate {
  const settled = Math.max(0, Math.trunc(sample.settled))
  const converted = Math.max(0, Math.trunc(sample.converted))
  const bounded = Math.min(converted, settled)
  return {
    settled,
    converted: bounded,
    percent: settled === 0 ? null : (bounded / settled) * 100,
  }
}

/**
 * Compare two periods and answer AQ1's question.
 *
 * `before` is the earlier period and `after` the later one. The verdict is
 * about the LATER period: it fell, it did not, or the samples are too small to
 * say. A caller that passes them the wrong way round gets a verdict about the
 * wrong period, so both are named rather than positional in every caller.
 */
export function judgeCaptureConversion(
  before: ConversionSample,
  after: ConversionSample,
  options: { minimumSample?: number; fallLimitPoints?: number } = {},
): ConversionComparison {
  const minimumSample = options.minimumSample ?? CAPTURE_CONVERSION_MINIMUM_SAMPLE
  const fallLimit = options.fallLimitPoints ?? CAPTURE_CONVERSION_FALL_LIMIT_POINTS

  const b = conversionRate(before)
  const a = conversionRate(after)

  const deltaPoints = b.percent === null || a.percent === null ? null : a.percent - b.percent
  const deltaRelativePercent =
    b.percent === null || a.percent === null || b.percent === 0
      ? null
      : ((a.percent - b.percent) / b.percent) * 100

  const standardErrorPoints = standardErrorOfDifferencePoints(b, a)

  let verdict: ConversionVerdict
  if (b.settled < minimumSample || a.settled < minimumSample || deltaPoints === null) {
    verdict = 'not-enough-evidence'
  } else if (fallExceedsLimit(b, a, fallLimit)) {
    verdict = 'move'
  } else {
    verdict = 'hold'
  }

  return { before: b, after: a, deltaPoints, deltaRelativePercent, standardErrorPoints, verdict }
}

/**
 * DID THE RATE FALL BY MORE THAN THE LIMIT. DECIDED IN WHOLE NUMBERS.
 *
 * THE DEFECT THIS CLOSES, found by the boundary test rather than by reading.
 * 600/1000 and 580/1000 are sixty per cent and fifty eight per cent, a fall of
 * exactly two points, which the rule holds rather than moves because it says
 * MORE than two. In binary floating point 580/1000 is 57.99999999999999, so the
 * fall computes as 2.000000000000007 and the platform would have moved a
 * consent capture off the surface that sells tickets on a rounding error.
 *
 * The rate is a ratio of two counts, so the comparison can be exact:
 *
 *     fall in points  =  100 * (c1/n1 - c2/n2)  =  100 * (c1*n2 - c2*n1) / (n1*n2)
 *     exceeds L       <=> 100 * (c1*n2 - c2*n1) >  L * n1 * n2
 *
 * and every term is an integer. The DISPLAYED delta stays the ordinary
 * division, because a screen wants 2.0 rather than a fraction; only the
 * decision is exact.
 *
 * The integer form holds while both sides stay inside Number.MAX_SAFE_INTEGER,
 * which at a hundred million settled reservations a side they still do. Past
 * that it falls back to the division, and says so here rather than losing
 * precision silently.
 */
function fallExceedsLimit(
  before: ConversionRate,
  after: ConversionRate,
  limitPoints: number,
): boolean {
  const fallNumerator = 100 * (before.converted * after.settled - after.converted * before.settled)
  const limitScaled = limitPoints * before.settled * after.settled
  if (
    Number.isSafeInteger(fallNumerator) &&
    Number.isFinite(limitScaled) &&
    Math.abs(limitScaled) <= Number.MAX_SAFE_INTEGER
  ) {
    return fallNumerator > limitScaled
  }
  const p1 = before.percent ?? 0
  const p2 = after.percent ?? 0
  return p1 - p2 > limitPoints
}

/** sqrt(p1(1-p1)/n1 + p2(1-p2)/n2), in percentage points. Null without both rates. */
function standardErrorOfDifferencePoints(b: ConversionRate, a: ConversionRate): number | null {
  if (b.percent === null || a.percent === null) return null
  const p1 = b.percent / 100
  const p2 = a.percent / 100
  const variance = (p1 * (1 - p1)) / b.settled + (p2 * (1 - p2)) / a.settled
  return Math.sqrt(variance) * 100
}

/** One decimal place, or the words for "there is no rate", never a bare 0. */
export function formatRate(percent: number | null): string {
  return percent === null ? 'no settled reservations' : `${percent.toFixed(1)}%`
}

/**
 * The comparison in words, for the screen and for a test to pin.
 *
 * The sentence lives beside the arithmetic rather than in the page, so the
 * words and the verdict cannot drift apart: a screen that says "stays where it
 * is" while the rule returned `move` is worse than no screen.
 */
export function conversionSentence(
  comparison: ConversionComparison,
  labels: { before: string; after: string },
  options: { minimumSample?: number; fallLimitPoints?: number } = {},
): string {
  const minimumSample = options.minimumSample ?? CAPTURE_CONVERSION_MINIMUM_SAMPLE
  const fallLimit = options.fallLimitPoints ?? CAPTURE_CONVERSION_FALL_LIMIT_POINTS
  const { before, after, deltaPoints } = comparison

  if (comparison.verdict === 'not-enough-evidence') {
    return (
      `Not enough evidence to apply the rule. ${labels.before} has ` +
      `${before.settled} settled reservation${before.settled === 1 ? '' : 's'} and ` +
      `${labels.after} has ${after.settled}. The ${fallLimit} point rule is only ` +
      `applied at ${minimumSample} or more on both sides, because below that a ` +
      `${fallLimit} point difference is inside ordinary variation.`
    )
  }

  const points = deltaPoints as number
  const size = Math.abs(points).toFixed(1)
  const direction = points < 0 ? 'fell' : points > 0 ? 'rose' : 'did not move'
  const movement =
    points === 0
      ? `Conversion did not move: ${formatRate(before.percent)} either side.`
      : `Conversion ${direction} ${size} points, from ${formatRate(before.percent)} ` +
        `(${labels.before}) to ${formatRate(after.percent)} (${labels.after}).`

  return comparison.verdict === 'move'
    ? `${movement} That is past the ${fallLimit} point limit, so the question moves to the ticket page.`
    : `${movement} That is inside the ${fallLimit} point limit, so the question stays where it is.`
}
