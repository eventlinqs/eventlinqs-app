/**
 * DuotoneFilterDefs (Batch 10) - SVG filter definitions for the
 * EventLinqs brand duotone imagery treatment per
 * docs/IMAGERY-STRATEGY.md.
 *
 * Maps source-image luminance to the brand palette:
 *   shadows  → navy   #0A1628
 *   highlights → gold #D4A437
 *
 * Mounted once in the root layout; referenced by media surfaces via
 *   `style={{ filter: 'url(#brand-duotone)' }}`
 * or the Tailwind arbitrary class `[filter:url(#brand-duotone)]` on
 * the wrapping element.
 *
 * Architecture: this is a render-once SVG with a `<defs>` block. The
 * filter id is global so any image on the page can reference it.
 * Dimensions are 0×0 with `position: absolute; visibility: hidden` so
 * the SVG element itself never paints.
 *
 * Tuning:
 *   - feColorMatrix collapses RGB to luminance (Rec. 601 weights:
 *     0.299 / 0.587 / 0.114).
 *   - feComponentTransfer's tableValues map the luminance gradient
 *     [0..1] to the navy → gold colour ramp:
 *       R: 0.039 → 0.831  (10  → 212 / 255)
 *       G: 0.086 → 0.643  (22  → 164 / 255)
 *       B: 0.157 → 0.216  (40  →  55 / 255)
 *     where (10, 22, 40) is navy `#0A1628` and (212, 164, 55) is gold
 *     `#D4A437`.
 */
export function DuotoneFilterDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: 'absolute', visibility: 'hidden' }}
    >
      <defs>
        <filter id="brand-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.299 0.587 0.114 0 0
                    0.299 0.587 0.114 0 0
                    0.299 0.587 0.114 0 0
                    0     0     0     1 0"
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.039 0.831" />
            <feFuncG type="table" tableValues="0.086 0.643" />
            <feFuncB type="table" tableValues="0.157 0.216" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  )
}
