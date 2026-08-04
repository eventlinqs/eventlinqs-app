/**
 * HoverWash - the platform-wide hover illumination layer (v2).
 *
 * Founder law v2: hover BRIGHTENS, never darkens. This component renders only
 * the navy WHISPER at the base (brand identity + bottom-edge text legibility),
 * layered ABOVE the image but BELOW any scrim/label/text the surface paints
 * after its media (pure DOM paint order, no z-index). The brightening of the
 * image itself is the paired `.card-media-img` filter (brightness + saturation
 * on hover), applied on the image by every media surface. Together with the
 * wrapper lift + image scale, the net effect is illumination, not shade.
 *
 * Single source of truth:
 *   - markup lives here (one component, rendered by every card/tile media
 *     surface - never copied per page)
 *   - both visuals live once in globals.css (`.card-hover-wash` whisper +
 *     `.card-media-img` brighten)
 *
 * Armed only under `html[data-motion="1"]` (the pre-paint motion flag set in
 * layout.tsx). That means headless/Lighthouse audits and visitors with
 * prefers-reduced-motion never see it and never pay for it. See CLAUDE.md
 * "Motion" -> "Hover illumination law".
 */
export function HoverWash() {
  return (
    <>
      {/* Design elevation 2026-07-12: the permanent house-grade veil sits
          under the hover whisper - one colourist's base anchor on every
          card photograph, identical for reduced-motion and audits. */}
      <span aria-hidden className="media-grade-veil" />
      <span aria-hidden className="card-hover-wash" />
    </>
  )
}
