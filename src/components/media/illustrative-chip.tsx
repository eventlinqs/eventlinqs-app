/**
 * THE ONE MARK A CARD PHOTOGRAPH MAY CARRY (law 46 (f), Lawal, 21 November 2026, 09:16; the PM's 10:15, ruling 2; the
 * app constitution's Law 6 and Cards and tiles, as amended that day). Where a night has no lawful photograph of its own,
 * a licensed stock photograph of its kind may stand for it (src/lib/images/illustrative.ts), and this chip says so, top
 * left on the photograph, on every card and on the event page's hero. A disclosure, never a credit (law 17 (d) stands).
 * One component, so every surface shows the same words in the same place.
 */
export function IllustrativeChip({ small = false }: { readonly small?: boolean }) {
  return (
    <span
      data-illustrative
      className={`pointer-events-none absolute left-2 top-2 z-10 rounded bg-[var(--color-navy-950)]/75 font-bold text-white ${small ? 'px-1 py-0.5 text-[9px]' : 'px-2 py-1 text-[11px]'}`}
    >
      Illustrative photo
    </span>
  )
}
