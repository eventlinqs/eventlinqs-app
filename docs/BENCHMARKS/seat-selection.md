# Benchmark: Seat Selection

## Overview

Interactive seat selection is the single most complex UI challenge in event ticketing. Ticketmaster has refined this over two decades. AXS and See Tickets have their own approaches. DICE largely avoids it (GA-first philosophy). This document breaks down exactly how these platforms handle the UX so EventLinqs can build a seat map that is as good as Ticketmaster's and better on mobile.

---

## Ticketmaster Seat Map — Desktop

### Rendering

Ticketmaster renders seat maps as **SVG overlaid on a venue background image**. The SVG layer contains:
- Section polygons (clickable zones that trigger section-level zoom)
- Individual seat circles within sections (visible only at section-zoom level)
- Pricing overlays (color-coded per price tier)

The venue background is typically a stylized venue illustration (not a photo) that helps orient the user (stage is always at top or center, labeled "STAGE").

### Color Coding (Status)

Seats are colored at all times to communicate status without interaction:

| Status | Color | Notes |
|--------|-------|-------|
| Available — Standard | Light blue or white | Default available state |
| Available — Premium | Gold or orange | Price-differentiated zones |
| Available — Platinum | Purple | Dynamic pricing tier |
| Selected | Green or bright teal | User's current selection |
| Sold / Unavailable | Dark grey (#888) | Faded, non-clickable |
| On Hold | Medium grey | Temporarily reserved by another user |
| ADA / Accessible | Wheelchair icon overlay | Blue with accessibility icon |
| Obstructed View | Diagonal stripe pattern | Available but flagged |
| Artist / Promoter Hold | Dark navy | Staff-only visibility |

### Hover States

On desktop, hovering a **section** (before zoom):
- Section polygon highlights with 20% opacity overlay
- Tooltip appears: section name, price range, seats available count — e.g., "Section 201 · $85–$115 · 42 available"
- Cursor changes to pointer

Hovering an **individual seat** (inside section zoom):
- Seat circle slightly enlarges (scale 1.2)
- Tooltip: Row letter, Seat number, Price, Section — e.g., "Row D · Seat 14 · $95"
- If accessible: "Accessible seat — companion seat available nearby"

### Selection Feedback

Clicking an available seat:
- Immediately turns green (selected state)
- Counter in selection panel updates: "2 of 4 seats selected"
- Bottom drawer (or right rail) shows selected seats with row/seat/price

Clicking a sold seat:
- No visual change
- Brief tooltip: "This seat is unavailable"
- No error sound or disruptive UX

Selecting seats that are not adjacent:
- Ticketmaster shows a yellow warning banner: "You're leaving fewer than 2 seats between your selection. Other fans may not be able to use these seats."
- This is not a blocker — it's advisory. User can proceed.

### "Best Available" Logic

Ticketmaster's best available:
- Priority 1: Center sections, then flanks
- Priority 2: Rows closest to stage within section
- Priority 3: Consecutive seats within a row
- User selects quantity first (1–8), clicks "Find Best Available"
- Result: seats auto-selected, highlighted green, with option to "Pick different seats"
- No exposure of algorithm to user

### Reservation Timeout

When seats are selected, a **timer appears** (typically 8 minutes for standard events, 5 minutes during high-demand on-sales):
- Timer shown as countdown in header: "Your seats are held for 7:42"
- At 2 minutes remaining: timer turns orange with pulsing animation
- At 0: seats released, modal appears "Your time has expired. Please select new seats."
- No silent failure — always explicit communication

### Section-Level vs Seat-Level Zoom

Ticketmaster uses a **two-tier zoom model**:
1. **Overview** — entire venue, section polygons, color-coded by price
2. **Section zoom** — clicking a section expands the view to show individual rows and seats

Zoom transition is animated (200ms ease-in-out). A back button ("← All sections") returns to overview.

On section zoom, rows are labeled (A, B, C... or 1, 2, 3...) and seats numbered left-to-right from stage perspective.

### Price Color Coding

Price tiers are always visible on the map even before hovering:
- Different price zones use distinct background colors on section polygons
- A legend at bottom-left of the map shows: "● Standard $45–$65  ● Premium $85–$115  ● Platinum $150+"
- This lets users immediately know which areas to consider before interacting

---

## AXS Seat Map

AXS (used by many US arenas and UK venues like The O2) follows a similar pattern to Ticketmaster with some differences:

- Uses **Canvas rendering** instead of SVG in some implementations — faster for very large venues but less accessible
- **Pinch-to-zoom** on mobile is AXS's primary mobile interaction model (not section-click-to-zoom)
- Stronger emphasis on **3D view toggle** — shows an approximate view from the selected seat using a 3D venue model (TBD — verify with Playwright MCP visit to axs.com)
- "View from seat" feature shows a panoramic photo taken from within 3 rows of the selected seat
- ADA seats require explicit "I need accessible seating" toggle before they become selectable

---

## See Tickets Seat Map

See Tickets (UK-focused) uses a lighter-weight approach:

- SVG-based, less detailed than Ticketmaster
- Section-level selection only for most venues (no individual seat selection)
- Simpler color scheme: available = green, unavailable = red, selected = blue
- No timeout timer shown — hold is server-side with no UI feedback
- Less hover detail — just section name and price on hover

---

## DICE — GA-First Philosophy

DICE (London-founded, global music focus) has deliberately avoided seat maps:

- All DICE events are **General Admission** by design
- No seat map UI exists in DICE's flow
- Instead of seat selection, DICE focuses on **ticket type selection** (Standard, Early Bird, VIP, Table)
- This makes the checkout dramatically simpler and faster
- DICE's anti-touting philosophy is built around named tickets linked to ID — not seat selection

**When to apply DICE's lesson to EventLinqs:** For purely GA events, do not show a seat map. Only show tier cards. The seat map should appear only when `has_reserved_seating = true`. This matches what we've already built.

---

## Mobile Seat Map — Critical Requirements

This is where Ticketmaster fails and EventLinqs must win.

### Ticketmaster Mobile Failures (as of 2025)
- Seat map loads slowly on mobile (3–5 second render time on 4G)
- Touch targets on individual seats are too small — users frequently tap the wrong seat
- Section zoom requires precise taps that are difficult with a thumb
- Horizontal pinch-to-zoom conflicts with browser scroll gestures
- No "snap to seat" behavior on touch — imprecise taps often hit nothing

### EventLinqs Mobile Seat Map Requirements

**Touch targets:**
- Minimum 44×44px for section polygons in overview mode (Apple HIG minimum)
- Minimum 48×48px recommended (Material Design) for primary CTA buttons around the map
- Individual seats in section-zoom must be minimum 28px diameter with 8px touch gap — if the venue has very many seats this means limiting zoom until viewport is large enough to show selectable sizes

**Interaction model for mobile:**
- Overview: tap section → zoom to section (no pinch required in overview)
- Section zoom: pinch-to-zoom enabled WITHIN the section view
- Double-tap: zoom in to section
- Two-finger spread: zoom in to seat level
- One-finger drag: pan within zoomed view
- Pinch close: return to overview
- Bottom sheet (not tooltip): tapping a seat opens a bottom sheet showing row, seat, price, Add/Remove button
- Bottom sheet is 300px tall at peek, full-screen expandable

**No hover dependency:**
- All hover states must be replaced with tap states
- Tooltips must not rely on hover — use tap-to-reveal or bottom sheet
- Price tooltips on map: tap section → bottom sheet shows price range + available count

**Performance:**
- SVG seat map must load and be interactive within 2.5 seconds on a 4G connection
- Use lazy loading for sections not in current viewport
- Pre-render the venue thumbnail at low resolution, progressive-enhance to full SVG
- Seats not in selected section can be rendered at lower fidelity to reduce DOM node count

---

## Sold-Out States

When all seats in a section are sold:
- Ticketmaster: section turns dark grey, cursor shows "not-allowed", tooltip "Section sold out"
- AXS: similar — section greyed with strikethrough text "SOLD"
- EventLinqs target: grey section with "Sold Out" label, and if waitlist is enabled: bottom area shows "Join Waitlist" button that opens waitlist modal

When the entire event is sold out:
- Do not show the seat map at all — replace with sold-out state component
- Show waitlist CTA prominently
- Show similar events below

---

## Accessibility Seat Mapping

WCAG 2.2 + platform patterns:

- ADA seats must be **separately discoverable** without requiring a user to navigate the entire map
- "Show accessible seats only" filter button should exist at top of seat map
- Each accessible seat must have ARIA label: `aria-label="Row G Seat 1 - Accessible seat - $85 - Available"`
- Companion seats (seats adjacent to ADA) should auto-suggest when ADA seat is selected
- Keyboard navigation: Tab moves between sections in overview, Arrow keys move between seats within a section, Enter to select, Escape to deselect or return to overview

---

## EventLinqs Seat Selection — Target Summary

| Feature | Ticketmaster | EventLinqs Target |
|---------|-------------|-------------------|
| Rendering | SVG + venue background | SVG, venue background optional |
| Color coding | 6 states | 6 states (match Ticketmaster) |
| Hover tooltip | Row, seat, price | Same + "X remaining in row" |
| Section zoom | Click to zoom | Click to zoom + pinch on mobile |
| Best Available | Yes, 1–8 | Yes, 1–20 |
| Timeout | 8 min, visible countdown | Configurable per event, visible |
| Mobile touch targets | Too small (failure) | 44px min, bottom sheet interaction |
| GA events | Seat map forced | No map shown — tier cards only |
| Waitlist | No (redirects away) | Inline waitlist CTA on sold-out |
| 3D view | No | TBD — verify with Playwright MCP |
| Accessible seats filter | No dedicated filter | Yes, "Show accessible seats" toggle |
