# Seating designer visual self-check (2026-07-12)

Step 4 of the seating-designer elevation. Screenshots captured on a local
production-parity dev server against the TEST database
(vkapkibzokmfaxqogypq), at 1440x900 and 390x844, on the SAME seeded seated
event and the SAME organiser-built chart before and after. Every claim below is
answered by looking at the captured pairs, not from memory.

Pairs (all in this folder):
- `before/builder-1440x900.png`  vs `after/builder-1440x900.png`
- `before/builder-390x844.png`   vs `after/builder-390x844.png`
- `before/buyer-map-1440x900.png` vs `after/buyer-map-1440x900.png`
- `before/buyer-map-390x844.png`  vs `after/buyer-map-390x844.png`
- close-ups: `iter2/svg-closeup-1440.png` (pre-remap, bright material blue) vs
  `iter3-svg-closeup-1440.png` (post-remap, editorial harbour blue)

## The two honest questions

### Q1: Is this visibly more premium and more elegant than the category leader?

ORGANISER BUILDER: YES, decisively.
- BEFORE: ten material-design brights straight off a default swatch row (sky
  blue, hot pink, bright green), a flat cream canvas with no grid, a plain text
  tool row, no zoom, no undo, no alignment help. It read as a utility, and the
  bright palette was the exact "AI-built default" look the Originality Law bans.
- AFTER: a drafting-table canvas (quiet dot grid), the navy proscenium STAGE
  with the gold footlight keyline shared with the buyer map, an editorial
  section palette (deep harbour, garnet, forest, terracotta ...), an icon
  toolbar as a segmented control, a floating zoom cluster, a 50-step undo
  (button + Ctrl+Z), snap-to-grid drag with gold sibling alignment guides, a
  single dashed-gold selection outline, and inline relabel/note editing instead
  of a browser prompt. The leader's public docs describe none of undo, snapping,
  or alignment guides and warn their tool can reload and lose work; ours is a
  crafted studio next to that.

BUYER SEAT MAP: YES.
- BEFORE: already competent (gold selected state, navy stage, whole-table
  booking, best-available) but the section colour rendered in bright material
  sky blue, zoom was a crude CSS width multiplier that went dead past 900px on
  mobile, and the legend's "Selected" swatch (navy square, gold ring) did not
  match the real selected seat (gold fill, navy ring).
- AFTER: available seats render in the deep editorial harbour tone, the gold
  selection pops against them with a 240ms bloom on pick, the three states read
  instantly (grey unavailable / harbour available / gold selected), the legend
  swatch now IS the selected seat, and the map has touch-first pinch-zoom,
  drag-pan (6px intent threshold so taps still select), Ctrl/trackpad zoom, and
  double-tap zoom to 3x. The leader publishes nothing on mobile map behaviour;
  this is a deliberately designed answer to their biggest undocumented gap.

### Q2: Does it pass the Originality Law (navy and gold and photography, no AI-built look, no glassmorphism)?

YES, and this pass is what made it pass. The single most "AI-default" thing in
the whole surface was the material-bright section palette, and it appeared on
the CUSTOMER-facing buyer map (not just the builder), because the buyer map
reads the stored section colour from the database. The fix is the single-source
`src/lib/seating/palette.ts`: an editorial palette plus a display-time remap of
the retired material brights, applied in the builder, the buyer map, AND the
organiser room view. Stored data and the funds-holding engine are untouched; a
chart adopts the editorial tone permanently on its next save. No glassmorphism
was introduced (solid surfaces throughout), and the navy/gold stage identity is
now shared across builder and buyer map. Verified against the close-up pair:
`iter2/svg-closeup-1440.png` (bright #0EA5E9) -> `iter3-svg-closeup-1440.png`
(editorial #1F5673).

## Iterations taken to reach both YES

1. Builder rebuilt to the room studio (editorial palette local to the builder,
   dot grid, stage, snap, undo, icon toolbar, inline edits).
2. Builder refinements: legacy palette remap on load, single selection outline.
3. Buyer map: touch-first zoom/pan, honest legend, gold bloom, quieter keylines.
4. Close-up review exposed the bright material blue STILL rendering on the buyer
   map for existing events (stored DB colour). Extracted the palette to one
   module and remapped at display time on every seating surface. Re-captured:
   available seats now editorial harbour, standing zone editorial terracotta.

Both questions answer YES after iteration 4. Delivered.
