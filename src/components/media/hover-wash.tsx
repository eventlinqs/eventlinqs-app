/**
 * HoverWash - the platform-wide "breathing" hover layer.
 *
 * A soft brand-navy gradient that fades in over card/tile imagery on hover,
 * layered ABOVE the image but BELOW any scrim/label/text the surface paints
 * after its media (pure DOM paint order, no z-index). It pairs with - never
 * replaces - the existing wrapper lift and image scale to give the
 * Ticketmaster-class hover.
 *
 * Single source of truth:
 *   - markup lives here (one component, rendered by every card/tile media
 *     surface - never copied per page)
 *   - the visual lives once in globals.css as `.card-hover-wash`
 *
 * Armed only under `html[data-motion="1"]` (the pre-paint motion flag set in
 * layout.tsx). That means headless/Lighthouse audits and visitors with
 * prefers-reduced-motion never see it and never pay for it. See CLAUDE.md
 * "Motion" -> "Hover breathing law".
 */
export function HoverWash() {
  return <span aria-hidden className="card-hover-wash" />
}
