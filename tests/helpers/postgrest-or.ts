const BACKSLASH = String.fromCharCode(92)
const DOUBLE_QUOTE = String.fromCharCode(34)

/**
 * SPLIT A POSTGREST FILTER LIST THE WAY POSTGREST ITSELF WOULD.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE INVARIANT WORTH TESTING, rather than the exact output string.
 *
 * Inside `or(...)` the characters `,` `.` `(` `)` are GRAMMAR. An unescaped
 * search term carrying one does not merely fail to match: it is parsed as MORE
 * FILTER CLAUSES. Measured against TEST on 19 September 2026:
 *
 *     .or(`title.ilike.%Night, Geelong%,slug.ilike.%Night, Geelong%`)
 *     PGRST100  failed to parse logic tree
 *
 *     the same search, escaped -> 3 rows, every one of the shape
 *     "... Night, Geelong", which is this platform's own naming
 *
 * Asserting the produced string pins today's spelling. The property that
 * actually matters is that the caller's TERM CANNOT ADD A CLAUSE: split the
 * filter on the commas PostgREST would treat as separators, ignoring any inside
 * a quoted value, and there must be exactly one clause per column, whatever was
 * typed.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A SHARED HELPER AND NOT A LOCAL FUNCTION.
 *
 * It was written once, privately, in tests/unit/supabase/or-filter.test.ts. The
 * guard those tests belong to, scripts/guards/or-filter-values-are-escaped.mjs,
 * exists precisely because one private decision about this grammar was made four
 * times in four different ways. Making a second private copy of the parser that
 * judges it would have been the same mistake one level up.
 */
export function topLevelClauses(filter: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < filter.length; i += 1) {
    const ch = filter[i]
    if (ch === BACKSLASH && inQuotes) {
      current += ch + (filter[i + 1] ?? '')
      i += 1
      continue
    }
    if (ch === DOUBLE_QUOTE) {
      inQuotes = !inQuotes
      current += ch
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out
}
