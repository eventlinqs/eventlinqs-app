/**
 * The one gold pin, for every map on the platform.
 *
 * WHY THIS FILE EXISTS. `google.maps.Marker` was deprecated on 21 February 2024
 * (Google, "Advanced markers migration") and every map on the platform still
 * called it, so a live event page logged a deprecation warning on every load.
 * Its replacement, `AdvancedMarkerElement`, does NOT accept the `icon` +
 * `SymbolPath.CIRCLE` shape the old pins were drawn with: an advanced marker
 * renders a DOM element instead. That would have meant four hand-rolled pins
 * drifting apart, so it is built once here.
 *
 * The geometry reproduces the old pin exactly, so the migration changes the
 * API and not the design: `scale: 10` on a CIRCLE symbol is a 10px RADIUS, so
 * 20px across, with a 3px white stroke.
 */

/**
 * The brand gold for every map pin, gold-500. Inherited from the three
 * duplicate `BRAND_GOLD` constants this file replaces (venue-map, city-map and
 * m5-events-map each declared it separately with the same comment), never
 * re-picked: a JS map config cannot read a CSS variable, so the hex is pinned
 * here once instead of three times.
 */
export const BRAND_GOLD = '#D4A017'

export type BrandPinOptions = {
  /** Accessible label, rendered as the element's title. */
  title?: string | null
  /** Pixel diameter. 20 reproduces the retired `scale: 10` circle. */
  size?: number
}

/**
 * Build the pin element for an AdvancedMarkerElement.
 *
 * Returns a plain DOM node rather than a React element because the advanced
 * marker takes `content` as an HTMLElement and is mounted imperatively inside
 * the map effect, outside React's tree.
 */
export function createBrandPin(options: BrandPinOptions = {}): HTMLElement {
  const size = options.size ?? 20
  const el = document.createElement('div')
  if (options.title) el.title = options.title
  // Inline styles, not a Tailwind class: this node is appended into Google's
  // own overlay pane, which our stylesheet does not reach reliably.
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.borderRadius = '9999px'
  el.style.background = BRAND_GOLD
  el.style.border = '3px solid #ffffff'
  el.style.boxSizing = 'border-box'
  // The retired Marker centred its symbol on the coordinate. An advanced
  // marker anchors content by its BOTTOM CENTRE, so without this the dot sat
  // one radius above the venue.
  el.style.transform = `translateY(${size / 2}px)`
  return el
}

/**
 * The cluster bubble on the events map.
 *
 * The retired renderer drew a CIRCLE symbol with a `label`, which an advanced
 * marker has no equivalent for, so the count now sits inside the element. The
 * radii are carried over unchanged: 18, 22 and 28 by cluster size, which are
 * radii, so the element is twice each.
 */
export function createClusterBubble(count: number): HTMLElement {
  const radius = count < 10 ? 18 : count < 50 ? 22 : 28
  const el = document.createElement('div')
  const d = radius * 2
  el.style.width = `${d}px`
  el.style.height = `${d}px`
  el.style.borderRadius = '9999px'
  el.style.background = BRAND_GOLD
  el.style.opacity = '0.95'
  el.style.border = '2px solid #ffffff'
  el.style.boxSizing = 'border-box'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.color = '#0F172A'
  el.style.fontSize = '13px'
  el.style.fontWeight = '700'
  el.style.fontFamily = 'Arial, sans-serif'
  el.style.transform = `translateY(${radius}px)`
  el.textContent = String(count)
  return el
}
