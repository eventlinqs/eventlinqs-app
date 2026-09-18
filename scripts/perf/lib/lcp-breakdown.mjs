/**
 * THE TWO LARGEST CONTENTFUL PAINTS IN ONE LIGHTHOUSE REPORT, AND WHY A
 * READER MUST BE TOLD WHICH IS WHICH.
 *
 * ============================================================================
 * THE MEASUREMENT THAT PRODUCED THIS MODULE
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.1, 19 September 2026. A mobile run
 * of the homepage against a local production build reported:
 *
 *     LCP                          3,740 ms
 *     LCP phases: TTFB 1,549 | load delay 17 | load duration 46 | render 269
 *
 * The phases sum to 1,881 ms. The LCP says 3,740 ms. Nothing is broken and
 * neither number is wrong: they are DIFFERENT QUANTITIES.
 *
 *   `largest-contentful-paint`.numericValue is the SIMULATED value. Lighthouse
 *   replays the trace through Lantern under the throttling profile, and THAT
 *   is the number the performance score is computed from.
 *
 *   `lcp-breakdown-insight` reports the OBSERVED timeline from the real trace.
 *   Its rows sum to `metrics.observedLargestContentfulPaint` exactly - 1,881
 *   against 1,881 on the run above - because that is what they are a
 *   breakdown OF.
 *
 * So the phases explain the observed paint, not the scored one. Printing them
 * beside the scored LCP with no label invites the reader to subtract one from
 * the other and conclude either that the harness is broken or, far worse, that
 * 1,549 ms of the SCORED 3,740 is time to first byte. It is not: the
 * proportions are a guide, the absolute milliseconds belong to the observed
 * run, and a session that mistakes them will spend a day optimising the wrong
 * half of the platform.
 *
 * ============================================================================
 * THE INVARIANT, WHICH IS WHAT KEEPS THIS HONEST WHEN LIGHTHOUSE CHANGES
 * ============================================================================
 *
 * The phases must sum to the observed LCP. If a Lighthouse release renames a
 * row, adds a fifth phase or changes the audit's shape, the sum stops
 * matching, and `explainPhases` says so instead of printing a confident split
 * of something it no longer understands. That is the same rule the document
 * weight analysis follows: a reporter that cannot have measured what it claims
 * refuses rather than reports.
 */

/** Rows of `lcp-breakdown-insight`, verbatim: Lighthouse's own labels. */
export function lcpPhases(lhr) {
  const items = lhr?.audits?.['lcp-breakdown-insight']?.details?.items ?? []
  const table = items.find((i) => i?.type === 'table')
  const out = {}
  for (const row of table?.items ?? []) {
    if (typeof row?.label === 'string' && typeof row?.duration === 'number') out[row.label] = row.duration
  }
  return out
}

/** The paint the phases are a breakdown of, from the metrics audit. */
export function observedLcp(lhr) {
  const value = lhr?.audits?.metrics?.details?.items?.[0]?.observedLargestContentfulPaint
  return typeof value === 'number' ? value : null
}

/** The paint the performance SCORE is computed from. */
export function simulatedLcp(lhr) {
  const value = lhr?.audits?.['largest-contentful-paint']?.numericValue
  return typeof value === 'number' ? value : null
}

/**
 * The two numbers and the verdict on whether the split can be trusted.
 *
 * `tolerance` is 1 ms rather than 0 because the audit rounds: the rows are
 * millisecond floats and the observed metric is the same quantity rounded
 * elsewhere in Lighthouse.
 */
export function explainPhases(lhr, { tolerance = 1 } = {}) {
  const phases = lcpPhases(lhr)
  const observed = observedLcp(lhr)
  const simulated = simulatedLcp(lhr)
  const labels = Object.keys(phases)
  const sum = labels.reduce((n, k) => n + phases[k], 0)

  if (labels.length === 0) {
    return {
      phases,
      observed,
      simulated,
      sum: 0,
      trustworthy: false,
      note: 'no lcp-breakdown-insight rows: this Lighthouse reported no LCP phase split, so no split is shown',
    }
  }
  if (observed === null) {
    return {
      phases,
      observed,
      simulated,
      sum,
      trustworthy: false,
      note: 'no observed LCP in the metrics audit, so the phase split cannot be checked against anything',
    }
  }
  if (Math.abs(sum - observed) > tolerance) {
    return {
      phases,
      observed,
      simulated,
      sum,
      trustworthy: false,
      note:
        `the phases sum to ${Math.round(sum)} ms and the observed LCP is ${Math.round(observed)} ms. ` +
        'They are the same quantity and must agree, so this Lighthouse has changed the audit shape and ' +
        'the split is NOT reported rather than reported wrongly',
    }
  }
  return {
    phases,
    observed,
    simulated,
    sum,
    trustworthy: true,
    note: 'phases describe the OBSERVED paint; the score is computed from the SIMULATED one',
  }
}
