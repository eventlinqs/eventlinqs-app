/**
 * WHAT THE HOME DRAWS AFTER THE CITY GUIDE, AS FLAGS (Lawal's design notes of 1 November 2026, 19:17, (2); the
 * CONTROLLER's 19:19; C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md). The home is a What's On guide: the
 * guide leads, then these, in this order, the community thread last and never dominating. A section that stops helping
 * a visitor find what's on is switched off HERE, never deleted, so it can come back with one line.
 */
export const AFTER_THE_GUIDE = {
  /** The paid Featured slots (src/lib/promotions): real events an organiser promoted. */
  featuredSlots: true,
  /** Every city, one tap each: the national reach under one city's guide. */
  everyCity: true,
  /** The community thread (Aboriginal and Torres Strait Islander first, then each community): at the bottom. */
  communities: true,
} as const
