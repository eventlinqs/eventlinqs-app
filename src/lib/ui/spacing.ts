/**
 * Sitewide spacing rhythm.
 *
 * Every top-level <section> on a composed page should use one of these
 * three classes as its vertical padding. No ad-hoc `py-12`/`py-20` values.
 *
 * Rules:
 *   SECTION_HERO    - py-0. Hero is full-bleed; its internal layout owns spacing.
 *   SECTION_DEFAULT - py-16 sm:py-24. Default. Also used when the colour changes
 *                     between the previous section and this one.
 *   SECTION_TIGHT   - py-12 sm:py-16. Use when two adjacent sections share the
 *                     same background colour (e.g. Bento → This Week → Community
 *                     Picks, all cream) so they read as continuous content,
 *                     not three disconnected slabs.
 *
 * Inner content:
 *   CONTAINER           - max-w-7xl mx-auto px-4 sm:px-6 lg:px-8. ALL section
 *                         content uses this. No exceptions. `max-w-7xl` is the
 *                         sitewide cap; it resolves to 1400px (the EventLinqs
 *                         page width, evidence-derived - see globals.css
 *                         `--container-7xl`), not Tailwind's 1280 default.
 *   HEADER_TO_CONTENT   - mt-8 on the body wrapper below a section header.
 *   ITEM_GAP            - gap-4 between cards/tiles in rails or grids.
 */

export const SECTION_HERO    = 'py-0' as const
export const SECTION_DEFAULT = 'py-16 sm:py-24' as const
export const SECTION_TIGHT   = 'py-12 sm:py-16' as const

// SECTION_RAIL - compressed vertical rhythm for stacked homepage rails, so two
// rails read together on a standard laptop after the hero (the Ticketmaster
// marketplace density; founder verdict). Tighter than SECTION_TIGHT but never
// cramped. Horizontal card rhythm (Variant B gaps) is untouched. Use ONLY on
// the stacked home rail sections, not on prose/marketing bands.
export const SECTION_RAIL    = 'py-6 sm:py-8' as const

export const CONTAINER         = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8' as const
export const HEADER_TO_CONTENT = 'mt-8' as const
export const ITEM_GAP          = 'gap-4' as const
