/**
 * HeaderScrollSentinel - 80px sentinel element that the
 * IntersectionObserver in useHeaderScrollState watches.
 *
 * The sentinel sits absolutely positioned at the top of the body so
 * it occupies the document's first 80px without consuming layout
 * space. When the user scrolls more than 80px the sentinel leaves
 * the viewport and the header transitions to State B.
 *
 * Why absolute (Batch 11.0 followup): the previous block-level
 * implementation pushed every page's header down by 80px, leaving an
 * off-white body band above the sticky header on /community, /city,
 * and intersection routes that broke the white nav's readability.
 * Absolute positioning lets the header sit at y=0 over the hero
 * while preserving the IntersectionObserver trigger geometry.
 */
export function HeaderScrollSentinel() {
  return (
    <div
      id="header-scroll-sentinel"
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-20 w-full"
    />
  )
}
