/**
 * ONE CARD PER EVENT PER PAGE (Lawal's ruling of 31 October 2026, 00:14: "never reused twice on the same platform"; the
 * photo system's P5). An event never appears twice on one page, whatever sections it qualifies for: the first section
 * that shows it keeps it. Sections are given in the order the page draws them; each takes up to its cap from the events
 * no earlier section showed, so a later rail fills its places from the events not yet shown instead of coming up short.
 * Nothing is removed from the page: an event only ever leaves a later section because an earlier one shows it.
 */
export function oneCardPerEvent<E extends { readonly id: string }>(
  sections: readonly { readonly events: readonly E[]; readonly cap: number }[],
): E[][] {
  const shown = new Set<string>()
  return sections.map(({ events, cap }) => {
    const kept: E[] = []
    for (const e of events) {
      if (kept.length >= cap) break
      if (shown.has(e.id)) continue
      shown.add(e.id)
      kept.push(e)
    }
    return kept
  })
}
