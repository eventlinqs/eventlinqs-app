/**
 * Sitewide spacing rhythm.
 *
 * Every top-level <section> on a composed page should use one of these
 * three classes as its vertical padding. No ad-hoc `py-12`/`py-20` values.
 *
 * Rules:
 *   SECTION_HERO    — py-0. Hero is full-bleed; its internal layout owns spacing.
 *   SECTION_DEFAULT — py-16 sm:py-24. Default. Also used when the colour changes
 *                     between the previous section and this one.
 *   SECTION_TIGHT   — py-12 sm:py-16. Use when two adjacent sections share the
 *                     same background colour (e.g. Bento → This Week → Cultural
 *                     Picks, all cream) so they read as continuous content,
 *                     not three disconnected slabs.
 *
 * Inner content:
 *   CONTAINER           — max-w-7xl mx-auto px-4 sm:px-6 lg:px-8. ALL section
 *                         content uses this. No exceptions.
 *   HEADER_TO_CONTENT   — mt-8 on the body wrapper below a section header.
 *   ITEM_GAP            — gap-4 between cards/tiles in rails or grids.
 */

export const SECTION_HERO    = 'py-0' as const
export const SECTION_DEFAULT = 'py-16 sm:py-24' as const
export const SECTION_TIGHT   = 'py-12 sm:py-16' as const

export const CONTAINER         = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8' as const
export const HEADER_TO_CONTENT = 'mt-8' as const
export const ITEM_GAP          = 'gap-4' as const
