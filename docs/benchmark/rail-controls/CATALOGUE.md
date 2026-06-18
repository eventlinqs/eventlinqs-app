# Rail Control System: Competitor Evidence Catalogue

Mission 3, Part 1. Captured live with Playwright (real UA, en-AU, deviceScaleFactor 2)
at three widths: 1440 (desktop), 1180 (intermediate resized desktop), 390 (mobile).
Raw geometry: `rail-controls-measurements.json`. Screenshots: `*-{width}-{state}.png`
(downscaled views under `view/`). Sites: Ticketmaster AU, Eventbrite AU, Airbnb AU,
Humanitix.

**Rule for this mission: no design call is made from taste. Every value below is read
from a real captured site, and the EventLinqs system is derived from these numbers.**

---

## 1. Airbnb (the rail gold standard) - PRIMARY REFERENCE

Airbnb runs the cleanest content-rail control system of the four. Measured at 1440
and 1180, identical structure:

| Property | Measured value |
|---|---|
| Placement | TOP-RIGHT of each rail header, on the headline's horizontal line (per-rail, one pair each) |
| Button shape | circular, `border-radius: 50%` |
| Size | 28x28 (1180) / 28x28 (1440) - small, but Airbnb is dense; founder floor is 44px |
| Pairing | Previous + Next sit side by side, ~32px apart (x=1317 / x=1349 at 1440) |
| Idle fill | solid `rgb(242,242,242)` (#F2F2F2), opaque - NOT translucent/glass |
| Border | none in normal state |
| Shadow | none on header-anchored rail arrows |
| **Disabled state** | Previous at rail start: `opacity: 0.5` + border `rgb(193,193,193)` (#C1C1C1). Next stays `opacity: 1`. This is the at-either-end disabled treatment. |
| Progress indicator | NONE. No dot, no bar, no counter. Arrows alone. |
| Mobile (390) | NO prev/next arrows at all. Native horizontal swipe only. (Only wishlist hearts present.) |
| Per-rail repetition | each rail (y=254, y=569, y=899 ...) carries its own pair at its own header line - stable, never floating |

**Read:** the indicator the founder rejected (travelling dot) is also absent from the
gold standard. Airbnb proves "arrows only, no progress device" is the premium pattern.
The disabled-at-end state is a real, designed state (dimmed + greyed border), not a
guess.

---

## 2. Ticketmaster AU

| Property | Measured / observed |
|---|---|
| Placement | TOP-RIGHT of the rail header ("POPULAR CITIES" rail shows paired `<` `>` beside a "See All" link) |
| Button shape | square with rounded corners (not full circle), outlined |
| Size | ~44x44 (the nav-strip anchors caught at 44x44 confirm TM's 44px control scale) |
| Pairing | Previous + Next side by side at the header's right edge |
| Companion | a "See All" text link sits left of the arrow pair |
| Progress indicator | none beside the arrows |
| Mobile (390) | arrows not surfaced in header; swipe-driven |

**Read:** TM corroborates Airbnb's top-right paired placement and confirms a ~44px
control scale is competitor-real (not just a founder preference). TM adds a "See All"
affordance, which EventLinqs rails already express via their section "View all" links.

---

## 3. Eventbrite AU

| Property | Measured / observed |
|---|---|
| Homepage structure | promo banner + category circle nav + a GRID of events ("Events in Melbourne"), not a heavily railed home |
| Rail arrows | not a prominent system on the home fold; the 36px control caught is a header utility, not a rail nav |
| Progress indicator | none |

**Read:** Eventbrite leans on grids over rails on its home, so it does not contribute
a rail-arrow pattern. No counter-evidence against the Airbnb/TM top-right pattern.

---

## 4. Humanitix (hero carousel only)

| Property | Measured value |
|---|---|
| Placement | LEFT and RIGHT EDGES of the hero, vertically centred overlay (x=8 and x≈1400 at 1440) |
| Button shape | circular, `border-radius: 50%` |
| Size | 32x32 |
| Idle fill | near-white `#F9F9FA`, opaque |
| Shadow | YES - drop shadow (edge-overlay arrows need separation from imagery) |
| Extra | a circular pause/play control for the autoplay |
| Progress indicator | autoplay timeline, not a click-dot |

**Read:** edge-overlay arrows with a shadow are the right pattern ONLY for a full-bleed
hero carousel over imagery (Humanitix's case). For in-page CONTENT rails, the gold
standard (Airbnb) anchors arrows in the header, not over the cards. The EventLinqs hero
is out of scope for this mission ("hero untouched"), so the edge-overlay pattern is
recorded but not applied to content rails.

---

## 5. Convergent findings -> the EventLinqs rail control law

Derived strictly from the evidence above:

1. **Placement: top-right of the rail header, on the headline line.** Airbnb + TM agree.
   This is inherently STABLE: the control lives in normal header flow, so it never
   floats, jumps, or vanishes on scroll/resize. (Solves the founder's "stable placement
   at every viewport and window resize" requirement structurally, not with JS.)
2. **Shape: circular, solid, opaque.** Airbnb #F2F2F2, Humanitix #F9F9FA - both opaque.
   No glassmorphism (also a project hard rule). EventLinqs uses navy/gold solids.
3. **Size: >= 44px.** TM runs 44px; Airbnb runs 28-32px but is denser than EventLinqs.
   Founder floor is 44px; 44px is competitor-real and meets the touch-target law.
4. **Pairing: Previous + Next, side by side**, at the header right.
5. **Disabled state at either end: dimmed + muted border.** Read directly off Airbnb
   (opacity 0.5 + #C1C1C1 border on the Previous button at rail start).
6. **No progress device.** The gold standard has none. The travelling dot the founder
   rejected is removed and replaced with NOTHING - which is exactly what Airbnb and TM do.
7. **Mobile: native swipe.** Airbnb + TM hide arrows on mobile. The founder asks that
   arrows stay reachable on mobile; because EventLinqs anchors them in the HEADER (not
   over cards), they remain visible and reachable on mobile at the 44px touch size with
   zero layout cost - better than the competitors, consistent with the evidence on
   placement.
8. **Desktop drag-to-scroll** on the rail body (already provided by `useDragScroll`,
   mouse-only) PLUS the arrows. Mobile native swipe. Full keyboard a11y on the arrows.

This catalogue is the sole authority for the control redesign in `snap-rail.tsx` /
`drag-rail.tsx`. Hero-LCP arming law and the locked glide easing are preserved.
