/**
 * THE ONE FLAG THAT TAKES EVERY MEASUREMENT SCRIPT OUT OF THE BUILD.
 *
 * Close-out AN1, the reversal condition: "The consent banner refused is the
 * reversal for every visitor; for the platform, one configuration flag removes
 * all analytics and ad scripts from the build."
 *
 * WHY THIS EXISTS SEPARATELY FROM THE FOUR IDENTIFIERS. Deleting the four
 * provider identifiers also stops everything loading, and for five days that
 * was treated as the reversal. It is not one flag, it is four deletions in
 * three Vercel scopes, it is reversible only by pasting four secrets back, and
 * it does not touch Plausible at all, so "all analytics" would have been false
 * the moment anybody checked. A reversal you have to perform correctly twelve
 * times under pressure is not a reversal.
 *
 * WHAT IT COVERS, which is everything that measures anything:
 *
 *   the four consent-gated providers   src/components/analytics/gated-analytics.tsx
 *   the server-side funnel capture     src/lib/analytics/funnel-server.ts
 *   Plausible's script                 src/app/layout.tsx
 *   Plausible's browser and server API src/lib/analytics/plausible.ts
 *
 * Clause 8 of scripts/guards/no-analytics-before-consent.mjs derives that list
 * from the files that NAME a measurement host rather than from a list somebody
 * maintains, and fails the build if one of them stops consulting this flag. So
 * a fifth sender added tomorrow is covered by the same sentence.
 *
 * ============================================================================
 * THE FAILURE DIRECTION OF A KILL SWITCH IS "KILLED"
 * ============================================================================
 *
 * The obvious implementation is `=== '1'`, and it is wrong. Somebody reaching
 * for this flag is reaching for it in a hurry, because something is wrong with
 * measurement or because a regulator asked. If they write `true`, or `yes`, or
 * `TRUE`, a `=== '1'` test answers "not off" and the trackers keep running,
 * silently, while the person who set it believes they are off.
 *
 * So ANY value switches it off except the two that unambiguously mean "no":
 * `0` and `false`. An empty value is the same as absent, because that is what
 * a Vercel variable set to nothing looks like and it cannot be read as an
 * instruction to do anything.
 *
 * The documented value to write is `1`. The rest is there so a typo fails safe.
 */

/**
 * Is measurement switched off by this raw environment value?
 *
 * Exported and tested on its own because the decision is the whole of the
 * feature, and because the branch that matters is the one nobody runs: the
 * typo.
 */
export function measurementIsOff(raw: string | undefined | null): boolean {
  if (typeof raw !== 'string') return false
  const value = raw.trim().toLowerCase()
  if (value === '') return false
  return value !== '0' && value !== 'false'
}

/** The name of the flag, so a refusal message and the manifest cannot drift. */
export const MEASUREMENT_OFF_VAR = 'NEXT_PUBLIC_MEASUREMENT_OFF'

/**
 * NEXT_PUBLIC so the browser half can be answered without a round trip, and
 * written as a literal member expression because that is the only form Next
 * inlines: a computed lookup would be `undefined` in the browser, the flag
 * would read as "not off", and the one control that exists to stop every
 * tracker would stop nothing while reporting that it had.
 */
export const MEASUREMENT_OFF = measurementIsOff(process.env.NEXT_PUBLIC_MEASUREMENT_OFF)
