# Seating designer visual benchmark: Humanitix vs EventLinqs (2026-07-12)

The visual pass companion to `humanitix-seating-study.md` (2026-07-05 capability
study). Studied as a user via Humanitix's PUBLIC help centre and marketing
material only: concepts, never their code, markup, or assets. This document
records what the leader does well visually, what their public material shows
they do NOT do, and precisely where the EventLinqs execution is elevated to be
visibly more premium. Sources are in the appendix.

## 1. What Humanitix does well (facts from public docs)

- A true free-form canvas: WebGL "bird's-eye view of your venue", four seating
  element types (rows, round tables, square tables, capacity areas) plus a
  decorative objects menu (circle, square, line, icon, text) for stages, bars
  and exits.
- Direct manipulation: drag positioning, click-to-rotate handles, duplicate and
  delete icons on the selected element, shift-drag multi-select (within one
  element only).
- A left element palette with an info/settings/mapping panel: a recognisable
  design-tool layout.
- Ticket mapping with a capacity cross-check ("see issue" + one-click Auto
  Match): capability EventLinqs already matches.
- Hidden seats render "a darker shade": a legible suppressed state.

## 2. Where their public material shows the ceiling (the openings)

1. NO undo, NO snapping, NO alignment guides documented anywhere, and the docs
   warn Safari "may reload the webpage automatically without saving your work".
   The builder is freehand and fragile.
2. NO best-available or seat-assist for buyers is documented: hand-pick only.
3. The buyer sees the map only AFTER committing to a ticket type; price-aware
   seat browsing does not exist.
4. NO first-class accessible-seat marker in the builder (handled by ticket-type
   workarounds and removing seats); no first-class hold state (faked with
   hidden ticket types plus access codes).
5. Whole-table booking is a packaged-ticket SKU, never a map interaction.
6. The documented visual language is schematic utility: default shapes, "a
   darker shade" for hidden, generic objects. Nothing suggests brand-grade art
   direction, a designed legend, or a styled stage identity.
7. Mobile map behaviour (pinch zoom, touch targets) is entirely undocumented
   and unmarketed.

## 3. EventLinqs before-state (honest audit, captures in evidence-elevation/before/)

The organiser builder was functional but utility-grade:

- Ten generic material-design section colours (#0EA5E9, #E91E63, #4CAF50...)
  straight off a default palette: exactly the AI-built look the Originality Law
  bans.
- A flat cream canvas with no grid, no zoom, no snapping, and 1px free drag.
- A text-only tool row; relabel and note edits through `window.prompt`.
- A thin navy stage band without the gold footlight identity the buyer map
  already carries.
- No undo: one wrong drag or delete is permanent (the exact fragility the
  leader is criticised for).

The buyer map was closer to the bar (gold selected state, stage with footlight,
whole-table booking, best-available) but:

- Zoom was a crude CSS width multiplier with no pinch, no wheel, no drag-pan:
  the mobile experience the leader also leaves undesigned.
- The legend's "Selected" swatch (navy square, gold outline) did not match the
  actual selected seat (gold fill, navy ring): a small dishonesty in the visual
  language.
- Available seats carried a heavy white keyline that flattened section colour
  at small sizes.

## 4. The elevation (what changed, and why it is more premium than the leader)

Every change stays inside the design system: navy `#0A1628`, gold tiers,
Archivo/Hanken/Manrope, solid surfaces, no glassmorphism, motion 150-300ms
ease-out gated behind `html[data-motion="1"]`.

ORGANISER BUILDER (the room studio):

1. EDITORIAL SECTION PALETTE: ten deep editorial tones derived from the brand
   family (harbour blue, garnet, forest, terracotta, aubergine, petrol, rust,
   indigo ink, olive, plum) replace the material defaults. Every tone passes
   4.5:1 with a white numeral and sits naturally beside navy and gold. Existing
   saved charts keep their stored colours; the palette governs new picks.
2. DRAFTING-TABLE CANVAS: a whisper-quiet 24px dot grid on the light canvas
   (the drafting-paper cue every serious design tool carries), the proscenium
   STAGE band with the gold footlight keyline (one visual language across
   builder and buyer), and floating zoom controls (in, out, fit).
3. CRAFTED MANIPULATION: drag snaps to the 4px spacing base; block edges snap
   to sibling block axes within a threshold with a hairline gold alignment
   guide flashing at the snapped axis. This is the "feels crafted" gap the
   leader's freehand canvas leaves open.
4. UNDO: a 50-step history (button + Ctrl+Z). The leader documents none.
5. A REAL TOOLBAR: icon + label tool buttons (select, blocked, accessible,
   companion, remove, relabel, note) in a segmented control with a navy active
   state, and add-element buttons with glyphs. No bare text rows.
6. INLINE SEAT EDITING: relabel and note edits happen in an anchored inline
   panel, never `window.prompt`.
7. SEAT VISUAL LANGUAGE: section-coloured seats with soft white keylines and
   numerals; blocked = ink with a diagonal strike; accessible = white ring +
   "A"; companion = "C"; the selected block glows with a gold halo.

BUYER MAP (the box-office moment):

1. TOUCH-FIRST ZOOM AND PAN: pinch zoom around the gesture focal point, wheel
   and trackpad zoom, drag-pan with tap-preserving thresholds, double-tap zoom,
   plus the button cluster. The leader publishes nothing on mobile map
   behaviour; this is a designed answer.
2. HONEST LEGEND: the Selected swatch is now exactly the selected seat (gold,
   navy ring); section chips carry from-prices; the states read at a glance.
3. THE GOLD MOMENT: selecting a seat lands a gentle 200ms gold bloom
   (motion-gated); best-available picks bloom as a group so the suggestion is
   FELT.
4. Seat keylines quietened so section colour reads at small sizes; unavailable
   seats stay one uniform quiet ink.
5. Whole-table one-tap booking stays a map-adjacent interaction (the leader
   still sells tables as packaged SKUs off the map).

## 5. Verdict discipline

The self-check (Step 4 of the mission) captures builder and buyer map at
1440x900 and 390x844 before and after, and answers two questions honestly:
visibly more premium than the leader, and passing the Originality Law (navy
and gold and photography, no AI-built look, no glassmorphism). Any "no"
iterates before delivery.

## Appendix: sources (public only)

- https://help.humanitix.com/en/articles/8905642-complete-guide-how-to-build-a-seating-map
- https://help.humanitix.com/en/articles/8893240-build-a-seating-map-and-manage-assigned-seating
- https://help.humanitix.com/en/articles/8914357-how-to-move-an-attendee-to-a-different-seat
- https://help.humanitix.com/en/articles/13548552-the-ticket-buyer-journey-on-humanitix
- https://help.humanitix.com/en/articles/8906272-event-guide-galas-awards-nights
- https://help.humanitix.com/en/articles/8893185-offer-group-bundle-and-tables-with-packaged-tickets
- https://help.humanitix.com/en/articles/8892493-add-or-edit-an-event-banner-image
- https://blog.promotix.com/humanitix-review (third party)

Banner-image note: the live Humanitix help article (July 2026) specifies a 2:1
ratio with a recommended minimum of 3200x1600 (JPEG/PNG/SVG under 10MB, auto
crop). The 1000x500 minimum / 2160x1080 recommendation used for our cover
floor matches the founder's directive and is not stricter than the market;
the current published leader spec is recorded here for future review.
