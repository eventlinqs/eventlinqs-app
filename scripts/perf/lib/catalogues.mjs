/**
 * THE REFERENCE CATALOGUES THAT MUST NOT BE SERIALISED INTO EVERY DOCUMENT.
 *
 * ============================================================================
 * WHY THIS IS ITS OWN FILE
 * ============================================================================
 *
 * Three things read this list and they must read the same one: the reporter
 * that measures the built documents (scripts/perf/catalogue-in-documents.mjs),
 * the reporter that measures the served ones (scripts/perf/srcset-weight.mjs)
 * and the guard that refuses a build carrying one
 * (scripts/guards/no-catalogue-in-every-document.mjs). A second copy of a
 * registry is a second copy that disagrees, and this repository has already
 * spent a day on one of those.
 *
 * ============================================================================
 * WHAT A CATALOGUE IS, SO A FUTURE ENTRY IS JUDGED AND NOT GUESSED
 * ============================================================================
 *
 * A list of reference rows that is
 *
 *   THE SAME ON EVERY ROUTE. Not this page's events, not this organiser's
 *   ticket tiers: a taxonomy. If two different pages would serialise different
 *   rows, it is page data and it belongs in the page.
 *
 *   READ ONLY AFTER AN ACTION. Behind a dialog, a disclosure, a menu. Rows a
 *   visitor can see without doing anything are paint, and paint belongs in the
 *   document.
 *
 * Both halves have to hold. A taxonomy that paints is fine where it is; page
 * data behind a dialog is a different item with a different fix.
 */

export const CATALOGUES = [
  {
    name: 'picker cities',
    /**
     * A field only a serialised `PickerCity` carries. `slug`, `city` and
     * `country` all appear in other shapes on these pages; this one does not.
     */
    marker: 'isLaunchCity',
    /** The flat list form of the same data, which carries no per-row marker. */
    arrayKeys: ['validSlugs'],
    why: 'the location dialog\'s city list, read only after "Change location" is pressed',
    /**
     * Where it comes from now, printed by the guard so a reader can check the
     * claim rather than trust it.
     */
    servedBy: 'src/app/api/location/cities/route.ts',
    /**
     * Measured on the gate build of 19 September 2026, close-out C8B.3, before
     * the fix. One copy is 3,216 B of rows plus 278 B of `validSlugs`.
     */
    measuredBefore: {
      bytesPerCopy: 3494,
      documentsCarryingIt: 10,
      totalBytesInPrerenderedDocuments: 41928,
    },
  },
]
