/**
 * ONE PLACE THAT KNOWS A POSTGREST `or(...)` VALUE IS NOT PLAIN TEXT.
 *
 * ---------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS NOT OPTIONAL.
 *
 * Inside `or(...)` the characters `,` `.` `(` `)` are GRAMMAR, not data. An
 * unescaped term containing one does not merely fail to match: it is parsed as
 * more filter clauses. Measured against TEST on 19 September 2026:
 *
 *     .or(`title.ilike.%Session, Geelong%,slug.ilike.%Session, Geelong%`)
 *     PGRST100  failed to parse logic tree
 *
 * The request answers 500 and the screen that asked shows nothing, with no way
 * for the person typing to know that a comma is the reason.
 *
 * Quoting makes the whole value literal. A quote or a backslash inside it has
 * to be escaped first so it cannot close the quoting early.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES HERE RATHER THAN IN THE FILE THAT FIRST NEEDED IT.
 *
 * It was written in src/lib/events/fetchers.ts, privately, with the whole of the
 * reasoning above it. By 19 September 2026 the same decision had been made THREE
 * more times in three different ways, and six reads had not made it at all:
 *
 *   src/lib/events/search-scopes.ts   copied the expression by hand, correctly,
 *                                     with a comment pointing at fetchers.ts
 *   src/app/admin/(authed)/network/page.tsx   replaced `,()` with spaces, which
 *                                     does not error and does not match either:
 *                                     searching an organisation called
 *                                     "Rock, Paper" looked for "Rock  Paper" and
 *                                     found nothing, silently
 *   src/app/admin/(authed)/pricing/targets/route.ts   did nothing at all, so the
 *                                     picker a fee override is attached from
 *                                     returned NOTHING for any event whose title
 *                                     carries a comma. Four of the first 320
 *                                     titles on TEST do, and they are all of the
 *                                     shape "Something Night, Geelong"
 *
 * A rule kept by habit is kept until somebody copy-pastes.
 * scripts/guards/or-filter-values-are-escaped.mjs is what keeps it now.
 */

/**
 * Escape a value for use inside a PostgREST `or(...)` filter.
 *
 * The result INCLUDES the surrounding quotes, so it is dropped straight after
 * the operator: `title.ilike.${escapeOrValue('%' + q + '%')}`.
 */
export function escapeOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * The whole filter for "any of these columns is like this term", escaped.
 *
 * Every call site that had this defect was spelling out the same three-line
 * shape around the same escape, so the shape is shared as well as the escape.
 * A caller that needs something other than `ilike` composes it from
 * `escapeOrValue` directly.
 *
 * The term is used verbatim: `%` and `_` inside it stay wildcards, which is the
 * long-standing behaviour of every search on this platform and is not this
 * module's decision to change.
 */
export function ilikeAnyOf(columns: readonly string[], term: string): string {
  const value = escapeOrValue(`%${term}%`)
  return columns.map(column => `${column}.ilike.${value}`).join(',')
}
