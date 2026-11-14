/**
 * THE NEXT FREE ADDRESS FOR AN ORGANISATION, so a taken one is a step, never a wall.
 *
 * Lawal, 15:27 on 14 November 2026: no rule on the organiser's path blocks them;
 * each becomes a guided step. Creating an organisation used to refuse a taken
 * address with "This slug is already taken. Please choose another", at the first
 * screen of onboarding. Humanitix makes the page URL from the name
 * (C:/dev/START-16OCT/EL-SELLING-PATH-14NOV/leaders-organiser-selling.md), so
 * EventLinqs now does the same: the organiser's own address when it is free, and
 * otherwise the first free numbered one beside it, which they can change later.
 *
 * Pure, so it is tested without a database. The unique constraint on
 * organisations.slug still decides a race between two people at the same second;
 * this only chooses what to try.
 */

/** The longest address the organisation form accepts (CreateOrgSchema in dashboard/organisation/actions.ts). */
export const ORGANISATION_SLUG_MAX = 60

/**
 * The first of `base`, `base-2`, `base-3` ... that is not in `taken`, trimmed so a
 * numbered address never passes ORGANISATION_SLUG_MAX. Returns null only when a
 * thousand neighbours are taken, which the caller reports in words.
 */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string | null {
  if (!taken.has(base)) return base
  for (let n = 2; n <= 1000; n += 1) {
    const suffix = `-${n}`
    const stem = base.slice(0, ORGANISATION_SLUG_MAX - suffix.length).replace(/-+$/, '')
    const candidate = `${stem}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return null
}
