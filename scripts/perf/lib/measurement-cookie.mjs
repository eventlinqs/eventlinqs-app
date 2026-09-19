/**
 * THE COOKIE EVERY LOCAL MEASUREMENT SENDS, COMPOSED IN ONE PLACE.
 *
 * WHY IT IS A MODULE AND NOT THREE LINES INLINE. `scripts/perf/lh-local-median.mjs`
 * runs top-level `await`, starts a server and launches Chrome on import, so
 * nothing in it can be imported by a test without running a measurement. The
 * repository's own rule for exactly this shape is in CLAUDE.md, under the
 * dependency-bump law: where the real thing cannot be exercised in a test, pin
 * the DECISION in a pure function and test that exhaustively. This is that
 * function.
 *
 * THE TWO RULES IT ENCODES.
 *
 * 1. `el-audit=1` IS NEVER DROPPED. It is the gate's own cookie
 *    (lighthouserc.json `extraHeaders`), and a local number is only worth
 *    quoting because it is comparable to the gate's. A harness that quietly
 *    replaced it would produce numbers that look like the gate's and are not.
 *
 * 2. THE EXTRA IS SLICED, NEVER SPLIT. A cookie value contains `=`, and often
 *    `%3D` besides. `'--cookie=el_consent={"v":1}'.split('=')[1]` yields
 *    `el_consent` and silently measures a cookie with no value, which is the
 *    worst shape a measurement can have: confident, plausible and wrong. This
 *    harness already carries one scar of that exact kind (the MSYS path note in
 *    lh-local-median.mjs, where a mangled argument was DROPPED and forty
 *    minutes produced a median of the wrong URL set).
 */

/** The cookie the CI gate sends on every request it measures. */
export const GATE_COOKIE = 'el-audit=1'

/**
 * Compose the Cookie header for a local measurement.
 *
 * @param {string | null | undefined} extra
 *   A raw `name=value` pair, exactly as it arrived after `--cookie=`. A value
 *   containing `=` is preserved whole.
 * @returns {string} the header value, always beginning with the gate's cookie.
 */
export function composeCookie(extra) {
  if (extra === null || extra === undefined) return GATE_COOKIE
  const trimmed = String(extra).trim()
  if (trimmed === '') return GATE_COOKIE
  return `${GATE_COOKIE}; ${trimmed}`
}

/**
 * Read the `--cookie=` argument out of an argv list.
 *
 * Sliced rather than split, per rule 2 above. Returns null when absent, which
 * `composeCookie` treats as "the gate's cookie alone".
 *
 * @param {string[]} args
 * @returns {string | null}
 */
export function cookieArgumentFrom(args) {
  const PREFIX = '--cookie='
  const hit = args.find((a) => a.startsWith(PREFIX))
  return hit === undefined ? null : hit.slice(PREFIX.length)
}
