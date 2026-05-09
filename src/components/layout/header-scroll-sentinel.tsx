/**
 * HeaderScrollSentinel - 1px tall sentinel element that the
 * IntersectionObserver in useHeaderScrollState watches (Batch 9.1).
 *
 * Mounted immediately after the SiteHeader in app/layout.tsx so it
 * occupies the slice of viewport at scroll position 0..80px below the
 * header. When the user scrolls more than 80px, this element leaves
 * the viewport and the header transitions to State B.
 *
 * Why 80px: matches the brief's "scroll past 80px" threshold. Gives
 * the user a small buffer of pure transparent header before the
 * frosted glass kicks in.
 *
 * The element is `aria-hidden` and has no visible content, just a
 * fixed height. It does NOT affect document layout - block element
 * with explicit height, no margin.
 */
export function HeaderScrollSentinel() {
  return (
    <div
      id="header-scroll-sentinel"
      aria-hidden="true"
      className="pointer-events-none -mt-px h-20 w-full"
    />
  )
}
