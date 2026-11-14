/**
 * ONE NAVIGATION ITEM IS THE CURRENT PAGE, NEVER TWO (the PM's score of 14 November 2026, fix 12: "only the active
 * sidebar item carries a fill").
 *
 * THE DEFECT. Each navigation list asked every item on its own whether the path began with its address. Where one
 * item's address sits inside another's, both answered yes: on /dashboard/events/create the sidebar drew "My events"
 * (/dashboard/events) and "Create event" (/dashboard/events/create) as the current page together, and on
 * /account/saved the phone's bottom bar lit "Saved" and "Account" together. Seen in the second look car's screens at
 * 1440 (C:/dev/EVIDENCE/EL-14NOV/payout-words/e2e-look/1440-create-first-step.png).
 *
 * THE RULE. A list asks once: of the items whose address the path is, or sits under, the one with the longest address
 * is the current page; an item with its own `match` answers for itself; an item marked `matchExact` matches its own
 * address only. Every navigation list with a current page draws through `activeNavHref`, and
 * tests/component/navigation/one-active-nav-item.test.tsx renders each list on every one of its own addresses.
 */
export type NavMatchItem = {
  href: string
  /** The item decides for itself (the dashboard's home is its own address only). */
  match?: (pathname: string) => boolean
  /** The item matches its own address only, never a path beneath it. */
  matchExact?: boolean
}

/** Does this item claim the path: its own address, or a path beneath it? */
export function navItemMatches(item: NavMatchItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  if (item.matchExact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

/** The href of the one current item, or null when the path is none of the list's. Longest address wins. */
export function activeNavHref(items: readonly NavMatchItem[], pathname: string): string | null {
  let best: string | null = null
  for (const item of items) {
    if (!navItemMatches(item, pathname)) continue
    if (best === null || item.href.length > best.length) best = item.href
  }
  return best
}
