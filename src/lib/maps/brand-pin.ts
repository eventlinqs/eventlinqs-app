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

/**
 * The brand navy, for the venue label plate. Matches --color-navy-950 in
 * globals.css. A JS map config cannot read a CSS variable, which is why the
 * gold above is pinned here too rather than looked up.
 */
const BRAND_NAVY = '#0A1628'

/**
 * THE VENUE PIN: a labelled marker, not a bare dot (close-out UX2.2).
 *
 * WHY. On the first real organiser event the venue rendered as an unlabelled
 * 20px gold dot whose only label was a `title` attribute, which is a hover
 * tooltip and therefore does not exist on a phone. Every surrounding commercial
 * POI on the basemap carried a labelled marker with an icon, so the one point on
 * the map that the page is actually about was the least legible thing on it.
 *
 * The plate carries the venue NAME as real text, in the brand navy with the gold
 * dot beside it, so it reads at a glance and reads on touch. Use this for the
 * single venue on an event or venue page; the multi-point city and events maps
 * keep the plain dot, because forty labelled plates is a worse map, not a better
 * one.
 *
 * COLLISION. Google publishes the mechanism for winning against basemap labels
 * (Maps JavaScript API, CollisionBehavior,
 * https://developers.google.com/maps/documentation/javascript/reference/marker,
 * fetched 2026-09-09):
 *
 *   REQUIRED_AND_HIDES_OPTIONAL - "Always display the marker regardless of
 *   collision, and hide any OPTIONAL_AND_HIDES_LOWER_PRIORITY markers or labels
 *   that would overlap with the marker."
 *
 * The basemap's own POI labels are that optional class, so the caller sets that
 * value alongside this content. It is published behaviour, not an inference.
 */
export function createVenuePin(options: { name?: string | null } = {}): HTMLElement {
  const name = options.name?.trim()
  if (!name) return createBrandPin()

  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.alignItems = 'center'
  wrap.style.gap = '8px'
  wrap.style.padding = '7px 12px 7px 9px'
  wrap.style.borderRadius = '9999px'
  // Solid, never translucent: CLAUDE.md bans glassmorphism, and a label over
  // satellite imagery has to stay readable regardless of what is beneath it.
  wrap.style.background = BRAND_NAVY
  wrap.style.border = `2px solid ${BRAND_GOLD}`
  wrap.style.boxShadow = '0 6px 16px rgba(10, 22, 40, 0.35)'
  wrap.style.boxSizing = 'border-box'
  wrap.style.maxWidth = '260px'
  wrap.style.cursor = 'default'
  wrap.title = name

  const dot = document.createElement('span')
  dot.style.flex = '0 0 auto'
  dot.style.width = '10px'
  dot.style.height = '10px'
  dot.style.borderRadius = '9999px'
  dot.style.background = BRAND_GOLD
  wrap.appendChild(dot)

  const text = document.createElement('span')
  text.textContent = name
  text.style.color = '#FFFFFF'
  text.style.fontSize = '13px'
  text.style.fontWeight = '600'
  text.style.lineHeight = '1.2'
  text.style.whiteSpace = 'nowrap'
  text.style.overflow = 'hidden'
  text.style.textOverflow = 'ellipsis'
  // The overlay pane is outside our stylesheet, so the stack is named here.
  text.style.fontFamily = 'Manrope, Arial, sans-serif'
  wrap.appendChild(text)

  // An advanced marker anchors its content by the BOTTOM CENTRE. The plate is
  // centred ON the coordinate rather than sitting above it, so the dot inside
  // it marks the point, exactly as the bare pin does.
  wrap.style.transform = 'translateY(50%)'
  return wrap
}
