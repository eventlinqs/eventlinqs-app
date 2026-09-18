/**
 * TWO WAYS OF WRITING THE SAME TRANSITION, AND WHY A DRIVE HAS TO KNOW.
 *
 * ============================================================================
 * THE MEASUREMENT THAT PRODUCED THIS
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026, the browse
 * card collapse. The card's transition moved from an unlayered class
 *
 *     .card-hover-transition { transition: transform var(--motion-quick),
 *                                          box-shadow var(--motion-quick); }
 *
 * to the utilities the composite is built from
 *
 *     transition-[transform,box-shadow] duration-200 ease-out
 *
 * and `scripts/verify/card-class-collapse-drive.mjs` reported eighteen faults:
 *
 *     transition-duration:        was "0.2s, 0.2s"   now "0.2s"
 *     transition-timing-function: was "cubic-bezier(...), cubic-bezier(...)"
 *                                 now "cubic-bezier(...)"
 *
 * with `transition-property` identical at "transform, box-shadow" on both
 * sides. THE BEHAVIOUR IS THE SAME. CSS repeats a shorter transition-* list
 * across the property list (CSS Transitions Level 1, "the lists are matched up
 * by repeating the shorter list"), so one duration on two properties IS
 * 0.2s on both. The shorthand form declares it twice and the longhand form
 * declares it once, and `getComputedStyle` reports whichever was written.
 *
 * ============================================================================
 * WHY NORMALISE RATHER THAN EXEMPT
 * ============================================================================
 *
 * The alternative was an exception list in the drive saying "ignore
 * transition-duration on the card". That would have switched off the one
 * property most likely to drift in a hand-translation, to silence a difference
 * that is not one. Normalising compares what the declaration DOES, which is
 * what the drive claims to compare everywhere else.
 *
 * IT CANNOT HIDE A REAL CHANGE. Only a single-valued list is expanded. Two
 * durations that genuinely differ ("0.2s, 0.3s") have length 2 already and are
 * compared as written, and a single value expanded to two is only ever equal
 * to a two-value list that repeats the same value - which is the one case
 * where the two forms are the same transition.
 */

/**
 * Splits a CSS list on TOP-LEVEL commas only.
 *
 * `cubic-bezier(0.16, 1, 0.3, 1)` carries three commas of its own, so a naive
 * `split(',')` reports a one-item timing-function list as four items and every
 * comparison built on it is wrong in the direction that looks like a finding.
 */
export function splitCssList(value) {
  const out = []
  let depth = 0
  let current = ''
  for (const ch of String(value)) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  const last = current.trim()
  if (last !== '' || out.length === 0) out.push(last)
  return out
}

/**
 * How many properties a transition applies to. `none` transitions nothing and
 * `all` is a single entry, so both count as one: neither is a list that a
 * shorter list would be repeated across.
 */
export function transitionPropertyCount(transitionProperty) {
  const value = String(transitionProperty ?? '').trim()
  if (value === '' || value === 'none' || value === 'all') return 1
  return splitCssList(value).length
}

/**
 * Expands a single-valued transition-* list to the number of properties it
 * applies to, and leaves every other shape exactly as it was found.
 */
export function normaliseTransitionList(value, propertyCount) {
  if (propertyCount <= 1) return value
  const parts = splitCssList(value)
  if (parts.length !== 1) return value
  return Array.from({ length: propertyCount }, () => parts[0]).join(', ')
}

/** The three longhands CSS repeats across the property list. */
export const REPEATED_TRANSITION_LONGHANDS = new Set([
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
])

/**
 * Reads one property out of a bag of computed values, normalised where CSS
 * would have repeated it. `bag` is the role's own property map, so the
 * property count comes from the same element that was measured.
 */
export function comparableValue(bag, property) {
  const value = bag[property]
  if (!REPEATED_TRANSITION_LONGHANDS.has(property)) return value
  return normaliseTransitionList(value, transitionPropertyCount(bag['transition-property']))
}
