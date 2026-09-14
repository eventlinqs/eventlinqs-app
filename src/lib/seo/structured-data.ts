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

/**
 * EVERY NODE, AT EVERY DEPTH, OR THE BLOCK IS INVALID SOMEWHERE NOBODY LOOKED.
 *
 * WHY THIS EXISTS, and it is a defect the gate caught rather than a tidy-up.
 * On 14 September 2026 the push gate stopped at its indexing step with one line:
 *
 *     [structured-data] FAIL: /events/lineup-loop-proof-night-3z7osn
 *                       Offer.name is an empty string
 *
 * A ticket tier on TEST carries `name = ''`, the event serialiser wrote it
 * straight into the nested Offer, and nothing removed it. The serialiser DID
 * compact, and that is the part worth recording: its compaction ran over the top
 * level of the payload ONLY, so `image` and `description` were handled and every
 * property of every nested Offer, Place, PostalAddress and PerformingGroup was
 * not. A shallow clean on a deeply nested document is a clean that reports
 * success over the part of the document nobody was worried about.
 *
 * WHY AN EMPTY STRING IS WORSE THAN AN ABSENT PROPERTY. It is a positive claim
 * that the value is nothing, and the platform's own validator
 * (scripts/verify/structured-data-validate.mjs) refuses it for that reason:
 * "no property is an empty string, an empty array or null". Google's Event
 * guidance never asks for `Offer.name`, so the honest answer to a nameless tier
 * is silence, not a name of zero characters. Inventing one would be worse still.
 *
 * WHERE IT IS APPLIED, and it is two places on purpose rather than by accident.
 * `buildEventSchemaPayload` uses it so the object it RETURNS is the contract its
 * own tests read, and `<JsonLd>` uses it so no emitter on the platform, present
 * or future, can put an empty value into the DOM even if it never compacts at
 * all. The guard scripts/guards/event-structured-data.mjs pins both.
 *
 * WHAT IT DOES NOT DO. It never drops an empty ARRAY and never drops `0` or
 * `false`. An `itemListElement: []` is markup that describes nothing and the
 * validator is supposed to fail on it; quietly deleting the key would hide the
 * fault rather than fix it. A price of `0` is a fact about a free ticket.
 */
export function pruneJsonLd<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== null && item !== undefined && !(typeof item === 'string' && item.trim() === ''))
      .map(item => pruneJsonLd(item)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === null || child === undefined) continue
      if (typeof child === 'string' && child.trim() === '') continue
      out[key] = pruneJsonLd(child)
    }
    return out as unknown as T
  }
  return value
}
