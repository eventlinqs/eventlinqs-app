/**
 * AN `.in()` LIST IS BOUNDED BY BYTES, NOT BY HOW MANY THINGS ARE IN IT.
 *
 * ---------------------------------------------------------------------------
 * THE SOURCE, CITED RATHER THAN REMEMBERED.
 *
 * Supabase Cloud sits behind Cloudflare, and an `in` filter is spelled into the
 * URL. Supabase's own troubleshooting page names the limit and names this
 * filter as the usual cause:
 *
 *   "16+KB worth of data is present in the headers/URL of your requests" ...
 *   "This is commonly caused by lengthy `in` clauses."
 *   https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2
 *   (fetched 2026-09-19)
 *
 * MEASURED ON THIS PROJECT'S TEST INSTANCE THE SAME DAY, so the number is not
 * taken on trust. One `.in('email', ...)` against `marketing_consents`, growing
 * the joined value list:
 *
 *     joined bytes   result
 *           8,141    OK
 *          12,112    OK
 *          15,038    OK
 *          16,083    TypeError: fetch failed
 *          20,054    TypeError: fetch failed
 *          25,689    Bad Request
 *
 * The break sits between 15,038 and 16,083, which is the documented 16 KB, and
 * the two failure shapes differ only in how far up the stack the request got.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A DEFECT AND NOT A THEORETICAL BOUND.
 *
 * The send path chunked its address lists at A HUNDRED AT A TIME, and a comment
 * in `src/lib/consent/resolver.ts` already recorded what happened the first
 * time that bound was wrong: a single `.in()` of five hundred addresses is
 * about twenty-two kilobytes, PostgREST refused it, and GA2's first driven run
 * "produced zero matches out of five hundred consented people". The answer then
 * was to chunk by count. Count is not the thing being bounded.
 *
 * An email address may be up to 254 characters (RFC 5321 section 4.5.3.1.3,
 * the forward-path limit), so a hundred LEGAL addresses is up to about 25 KB
 * and fails. Nothing about that is exotic: it needs one organisation whose
 * buyers use long addresses.
 *
 * ---------------------------------------------------------------------------
 * THE BUDGET, AND WHY IT IS FAR UNDER THE LIMIT.
 *
 * The 16 KB is spent on the HEADERS AND THE URL TOGETHER. A service-role
 * request already carries two JWTs (`apikey` and `Authorization`), the select
 * list, the other filters and the host, none of which this function can see. So
 * the value list gets 4 KB: a quarter of the documented limit, which still
 * holds a hundred ordinary addresses (a hundred 30-character addresses join to
 * about 3.1 KB) in ONE request, so nothing about the common path changes.
 *
 * A chunk is never empty: one value larger than the whole budget still goes on
 * its own, because refusing to ask is worse than asking and being told no.
 */

/**
 * The bytes of `in` VALUES one request may carry. A quarter of the documented
 * 16 KB, for the reason in the header.
 */
export const IN_FILTER_VALUE_BUDGET_BYTES = 4_000

/** The count bound that was here before, kept so a short-value list still pages. */
export const IN_FILTER_MAX_VALUES = 100

/**
 * Split values into chunks that fit BOTH bounds.
 *
 * @param values the `.in()` list, in caller order, which is preserved
 * @returns one array per request, never containing an empty chunk
 */
export function chunkInFilterValues(
  values: string[],
  {
    budgetBytes = IN_FILTER_VALUE_BUDGET_BYTES,
    maxValues = IN_FILTER_MAX_VALUES,
  }: { budgetBytes?: number; maxValues?: number } = {},
): string[][] {
  if (budgetBytes < 1 || maxValues < 1) {
    throw new Error(
      `chunkInFilterValues: a budget of ${budgetBytes} bytes and ${maxValues} values cannot hold anything`,
    )
  }

  const chunks: string[][] = []
  let current: string[] = []
  let bytes = 0

  for (const value of values) {
    // The separating comma is part of what travels, so it is part of the cost.
    const cost = byteLengthOf(value) + (current.length === 0 ? 0 : 1)
    const wouldOverflow = current.length > 0 && (bytes + cost > budgetBytes || current.length >= maxValues)
    if (wouldOverflow) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(value)
    bytes += current.length === 1 ? byteLengthOf(value) : cost
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

/**
 * BYTES, NOT CHARACTERS. A URL carries percent-encoded UTF-8, so an address
 * with a non-ASCII domain (RFC 6531 permits them) costs more than its
 * `.length`. `String.length` counts UTF-16 units and would under-count exactly
 * the addresses most likely to be long.
 */
function byteLengthOf(value: string): number {
  return new TextEncoder().encode(value).length
}
