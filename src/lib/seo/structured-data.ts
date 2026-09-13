/**
 * THE ONE SWITCH FOR EVERY JSON-LD BLOCK ON THE PLATFORM.
 *
 * SEO1's reversal condition, in the owner's words: "One configuration flag,
 * structured_data_enabled, stops every JSON-LD block being emitted on every page
 * type at once, leaving every other tag untouched. If Google Search Console
 * reports structured data errors on more than five percent of event pages thirty
 * days after launch, the emission is narrowed to the required fields only and re
 * validated before any optional property is restored."
 *
 * That sentence is only TRUE if there is exactly one place a block can be
 * emitted from. Before this, there were seventeen: six components and ten pages
 * hand-rolling the same three lines. Turning emission off would have meant
 * finding and editing all of them, which is the kind of reversal that gets
 * announced and never actually performed.
 *
 * So every block now goes through `<JsonLd>` (src/components/seo/json-ld.tsx),
 * which asks this constant first, and
 * scripts/guards/event-structured-data.mjs fails the build if a raw
 * `application/ld+json` script tag appears anywhere else in src.
 *
 * WHY A CONSTANT AND NOT AN ENVIRONMENT VARIABLE. The reversal is triggered by a
 * Search Console reading taken thirty days after launch, which is a considered
 * decision with a redeploy's worth of time in hand, not an incident. A constant
 * is diffable, reviewable and cannot disagree with a dashboard. Law 9 clause 3:
 * "a setting nobody can diff is a setting nobody can review".
 *
 * FLIPPING IT TO false leaves the canonical tag, the title, the meta
 * description, Open Graph and Twitter cards completely untouched. Only the
 * machine-readable blocks stop.
 */
export const STRUCTURED_DATA_ENABLED = true
