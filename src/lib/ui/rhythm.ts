/**
 * Homepage rhythm tokens - VARIANT B ("role rhythm").
 *
 * Part of the homepage rhythm A/B/C test (Mission 3, Part 2). Variant A is the
 * untouched control; this branch (test/home-rhythm-b) opens the side-to-side
 * card spacing and differentiates rails by role, in response to the founder
 * verdict on Ticketmaster: "rails too symmetrical, cards too close
 * side-to-side." Vertical rhythm is unchanged; only horizontal gap and per-rail
 * card scale move.
 *
 * These are full literal class strings so Tailwind's source scanner keeps them.
 *
 * ============================================================================
 * EVERY RAIL CELL IS DECLARED TWICE, ON PURPOSE
 * ============================================================================
 *
 * Each cell below is a class string AND a `{ base, sm }` pixel pair. They say
 * the same two numbers and neither can be generated from the other: Tailwind's
 * scanner only keeps class names it can see as literals in the source, so the
 * class string cannot be built from the numbers, and a browser needs the numbers
 * in a `sizes` attribute, which cannot be read back out of a class string at
 * runtime.
 *
 * So the two are held together by a gate instead of by hope:
 * `scripts/guards/image-hints-match-the-cell.mjs` parses `w-[Npx]` and
 * `sm:w-[Mpx]` out of each class string, compares them to the pair beside it,
 * and then compares the `sizes` hint built from that pair in
 * `src/components/media/sizes.ts` to the literal declared there. Change a cell
 * width and forget the hint, and the build fails naming both lines.
 *
 * THAT GATE EXISTS BECAUSE THE DRIFT ALREADY HAPPENED. Measured on this tree's
 * production build on 18 September 2026, every rail on the homepage was telling
 * the browser a width it did not render at: the event cards asked for an image
 * twice as wide as their slot, and the city tiles asked for one SMALLER than
 * theirs, which is a blurry tile on any retina phone. The evidence is
 * `C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt`.
 *
 * `sm` is Tailwind's 640px breakpoint. A cell whose real width does not change
 * at 640 still declares both numbers, identical, rather than a special case.
 */

// Inter-card gap: +1/3 on mobile (12 -> 16px), +2/3 on desktop (12 -> 20px; was 18px,
// which sat off the 4px scale, close-out C14.12, 6 September 2026).
// Within the founder's "increase by a third to a half" instruction.
export const RHYTHM_GAP = 'gap-4 sm:gap-5' as const

/** Tailwind's `sm` breakpoint, in CSS pixels. The one place it is written down. */
export const SM_BREAKPOINT = 640

/** A rail cell: the class Tailwind reads, and the same widths a browser needs. */
export type RailCell = { readonly cell: string; readonly base: number; readonly sm: number }

// Scenes rail: proper SQUARE tiles at a distinct, smaller scale than the
// landscape event cards (which sit at 240/280). Square + smaller marks the
// scenes rail as a different role at a glance.
export const SCENE_TILE_CELL = 'w-[150px] shrink-0 snap-start sm:w-[168px]' as const
export const SCENE_TILE_PX = { cell: SCENE_TILE_CELL, base: 150, sm: 168 } as const satisfies RailCell

// City rail: a distinct, larger "destination" treatment - wider than event
// cards so cities read as places, not listings.
export const CITY_TILE_CELL = 'w-[280px] shrink-0 snap-start sm:w-[340px]' as const
export const CITY_TILE_PX = { cell: CITY_TILE_CELL, base: 280, sm: 340 } as const satisfies RailCell

// The three event-card cells of the homepage rails (src/components/features/
// events/this-week-card.tsx). They were inline strings in that file until the
// hint gate needed one place to read them from.
export const EVENT_CARD_CELL = 'w-[240px] shrink-0 snap-start sm:w-[280px]' as const
export const EVENT_CARD_PX = { cell: EVENT_CARD_CELL, base: 240, sm: 280 } as const satisfies RailCell

export const FEATURE_CARD_CELL = 'w-[300px] shrink-0 snap-start sm:w-[420px]' as const
export const FEATURE_CARD_PX = { cell: FEATURE_CARD_CELL, base: 300, sm: 420 } as const satisfies RailCell

export const SQUARE_CARD_CELL = 'w-[180px] shrink-0 snap-start sm:w-[200px]' as const
export const SQUARE_CARD_PX = { cell: SQUARE_CARD_CELL, base: 180, sm: 200 } as const satisfies RailCell

// "Find your community" rail (src/components/features/home/community-rail.tsx):
// portrait heritage tiles, narrower than an event card.
export const COMMUNITY_TILE_CELL = 'w-[160px] shrink-0 snap-start sm:w-[180px]' as const
export const COMMUNITY_TILE_PX = { cell: COMMUNITY_TILE_CELL, base: 160, sm: 180 } as const satisfies RailCell

// "Browse by category" rail (src/components/features/home/category-nav-rail.tsx),
// including the Communities doorway tile that leads it.
export const COMPACT_TILE_CELL = 'w-[220px] shrink-0 snap-start sm:w-[260px]' as const
export const COMPACT_TILE_PX = { cell: COMPACT_TILE_CELL, base: 220, sm: 260 } as const satisfies RailCell

// The portrait tile used by the profile-page rails: the community rail on a city
// page, the cities rail on an organiser profile, and the same on a venue. The
// width was written out three times in three long class strings until the hint
// gate needed one place to read it from.
export const WIDE_TILE_CELL = 'w-[260px] shrink-0 snap-start sm:w-[280px]' as const
export const WIDE_TILE_PX = { cell: WIDE_TILE_CELL, base: 260, sm: 280 } as const satisfies RailCell

// The "what's on" format tile on a city page (event-types-rail).
export const STANDARD_TILE_CELL = 'w-[240px] shrink-0 snap-start sm:w-[260px]' as const
export const STANDARD_TILE_PX = { cell: STANDARD_TILE_CELL, base: 240, sm: 260 } as const satisfies RailCell

// The flat event-rail cell: no `sm` step, so it is 280px at every viewport. It
// is the cell on /feed, /city/*, /community/*, /suburb, /venues/*, /artists/*
// and /organisers/*, and it was written out eleven times before the hint gate
// needed one place to read it from.
export const FLAT_RAIL_CELL = 'w-[280px] shrink-0 snap-start' as const
export const FLAT_RAIL_PX = { cell: FLAT_RAIL_CELL, base: 280, sm: 280 } as const satisfies RailCell

// A flat 260px rail cell that carries TEXT and no image: the "more from this
// organiser" and "more at this venue" cards. It is declared here so clause 3 of
// the hint gate can see that every cell on the platform lives in one file, and
// it deliberately has NO `_PX` pair, because a pair exists to build a `sizes`
// hint and this cell has no image to hint about. If one is ever added, it needs
// a pair and a hint, and the gate will not ask for them on its behalf.
export const TEXT_CARD_CELL = 'w-[260px] shrink-0 snap-start' as const
