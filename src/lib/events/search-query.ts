/**
 * Search query construction (pure, so it is fully unit-tested without a
 * database).
 *
 * WHAT WAS WRONG. Search was `ilike('title', '%q%')` and nothing else. That
 * matches a literal substring of the title, so:
 *
 *   - "Melbourne" found 10 events when 29 were in Melbourne
 *   - "Geelong" found 4 when 27 were in Geelong, the founder's wedge city
 *   - "Harbourline Live" found 0 when that organiser had 16 events
 *   - "jazz soul" found 1 when 3 were jazz or soul, because a two-word query
 *     had to appear in the title in that exact order
 *
 * It only looked healthy on the TEST catalogue because the seeder writes the
 * genre phrase into the title ("Electronic Dance Live at The Espy"). Real
 * organiser titles do not do that, which is why this was invisible.
 *
 * WHAT IT DOES NOW. Every whitespace-separated token must match SOMEWHERE
 * (title, summary, description, venue name, venue city, a tag, or the
 * organiser's name); different tokens may match different fields. So
 * "live music melbourne" finds a music event at a Melbourne venue without
 * needing those three words adjacent in the title.
 *
 * AND across tokens, OR across fields. Each token becomes one PostgREST
 * `.or()` group and separate `.or()` calls AND together, which is what makes
 * extra words narrow the result rather than widen it.
 */

/** Fields on `events` a free-text token is allowed to match. */
const TEXT_COLUMNS = ['title', 'summary', 'description', 'venue_name', 'venue_city'] as const

/**
 * PostgREST parses `or=(...)` as a comma-separated list with dot-separated
 * parts, so a raw comma, dot, parenthesis, quote or backslash in a term
 * changes the shape of the filter rather than being searched for. `%` and `*`
 * are wildcards. All of them are removed rather than escaped: a user typing
 * them means them literally, and dropping them degrades to a slightly broader
 * match instead of a malformed query or an injection surface.
 */
export function sanitiseToken(raw: string): string {
  return raw.replace(/[,.()"'\\%*{}[\]:]/g, ' ').trim()
}

export const MAX_TOKENS = 6
export const MIN_TOKEN_LENGTH = 2

/**
 * Split a query into the tokens that must each match. Tokens shorter than two
 * characters are dropped ("a", "of") because they match nearly everything and
 * cost a full scan. A query that is entirely short tokens keeps the longest
 * one so the search still narrows to something rather than silently returning
 * the whole catalogue.
 */
export function tokenise(q: string): string[] {
  const all = q
    .split(/\s+/)
    .map(sanitiseToken)
    .filter(Boolean)
  const kept = all.filter((t) => t.length >= MIN_TOKEN_LENGTH)
  if (kept.length === 0 && all.length > 0) {
    return [all.reduce((a, b) => (b.length > a.length ? b : a))].slice(0, MAX_TOKENS)
  }
  return kept.slice(0, MAX_TOKENS)
}

/**
 * The `.or()` group for one token. `organisationIds` are the organisations
 * whose NAME matches this token; including them by id is how an organiser
 * name becomes searchable without a cross-table filter.
 */
export function buildTokenOrGroup(token: string, organisationIds: string[] = []): string {
  const parts = TEXT_COLUMNS.map((col) => `${col}.ilike.*${token}*`)
  // A tag is an exact token in a jsonb array, matched the same way the
  // community tag bridge matches it.
  parts.push(`tags.cs.["${token.toLowerCase()}"]`)
  if (organisationIds.length > 0) {
    parts.push(`organisation_id.in.(${organisationIds.join(',')})`)
  }
  return parts.join(',')
}

/**
 * The full set of `.or()` groups for a query. One group per token; the caller
 * applies them as separate `.or()` calls so they AND together.
 *
 * `organisationIdsByToken` maps a token to the organisation ids whose name
 * matches it. Absent entries simply mean no organiser matched that token.
 */
export function buildSearchOrGroups(
  q: string,
  organisationIdsByToken: Map<string, string[]> = new Map(),
): string[] {
  return tokenise(q).map((t) => buildTokenOrGroup(t, organisationIdsByToken.get(t) ?? []))
}
