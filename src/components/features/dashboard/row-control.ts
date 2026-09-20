/**
 * THE SHAPE OF A CONTROL THAT LIVES INSIDE A DASHBOARD ROW.
 *
 * One string, one place, because the alternative is two places and they drift.
 * It was defined privately inside event-lifecycle-actions.tsx on 21 September
 * 2026 as part of rebuilding the events list, and the discount codes table
 * needed the identical shape hours later: 44px, which is the constitution's
 * standing minimum for a touch target, on a control whose WORD is eleven
 * pixels tall.
 *
 * WHY px-2 AND NOT A FLEX GAP. Every action carries the same 8px either side,
 * so the rhythm between words is even whether the word is Edit or Deactivate.
 * `min-w-11` alone centred the short ones inside 44px boxes and left the long
 * ones bare.
 *
 * It is a plain module and not a component on purpose: a const string costs
 * nothing at runtime, and importing a COMPONENT from the lifecycle module
 * would have dragged its server actions into the discounts bundle, which is
 * the opposite of what C8 is for.
 */
export const ROW_CONTROL =
  'inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs disabled:opacity-40'
