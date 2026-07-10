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
 */

// Inter-card gap: +1/3 on mobile (12 -> 16px), +1/2 on desktop (12 -> 18px).
// Within the founder's "increase by a third to a half" instruction.
export const RHYTHM_GAP = 'gap-4 sm:gap-[18px]' as const

// Scenes rail: proper SQUARE tiles at a distinct, smaller scale than the
// landscape event cards (which sit at 240/280). Square + smaller marks the
// scenes rail as a different role at a glance.
export const SCENE_TILE_CELL = 'w-[150px] shrink-0 snap-start sm:w-[168px]' as const

// City rail: a distinct, larger "destination" treatment - wider than event
// cards so cities read as places, not listings.
export const CITY_TILE_CELL = 'w-[280px] shrink-0 snap-start sm:w-[340px]' as const
