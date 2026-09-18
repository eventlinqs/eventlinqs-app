import { withBuildRetry } from './build-retry'

/**
 * A READ THAT WANTS EVERY ROW MUST ASK FOR EVERY ROW. THE SERVER WILL NOT
 * VOLUNTEER THE ONES IT LEFT OUT.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, measured rather than argued. 19 September 2026.
 *
 * Supabase projects cap a single response at a fixed number of rows: "By
 * default, Supabase projects return a maximum of 1,000 rows ... You can use
 * range() queries to paginate through your data"
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 *
 * The cap is applied by the server, AFTER the order by, and it is invisible to
 * the caller: HTTP 200, no error, a full-looking array. Measured on the TEST
 * project the same day:
 *
 *     consent_events        9,490 rows in the table
 *     select with no limit  1,000 rows in the body, Content-Range 0-999/9490
 *
 * `src/lib/audience/read.ts` read that table with no bound, ordered OLDEST
 * FIRST, and kept the last answer per address. The ceiling therefore deleted
 * precisely the newest events, which are the ones that decide. The admin
 * audience screen was reporting, on real data:
 *
 *                       screen      ledger
 *     people asked         997       9,364
 *     withdrawn              1          53
 *     declined               0         102
 *     opt-in rate         100%       98.9%
 *
 * A screen that says nobody has ever declined, when a hundred people have, is
 * not a rounding error. It is the number a founder would act on.
 *
 * The same shape sits in front of the send decision: `filterPermittedRecipients`
 * reads a chunk of addresses' consent events with no bound, and `decideSend`
 * takes the LATEST event per person. Drop somebody's withdrawal and keep their
 * older grant and the platform mails a person who unsubscribed.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STOP CONDITION IS AN EMPTY PAGE AND NOT A SHORT ONE.
 *
 * The obvious loop stops when a page comes back shorter than the page size.
 * That is correct only while the page size and the server's ceiling are equal,
 * and the ceiling is a project setting in a dashboard that this repository
 * cannot see (Law 9 clause 3: a setting nobody can diff is a setting nobody can
 * review). Lower it to 500, ask for 1,000, and every page is "short": the loop
 * stops after the first one and reports a third of the table as all of it.
 *
 * So this advances by the number of rows it ACTUALLY received and stops only on
 * an empty page. It costs one extra request per read and it is correct at any
 * ceiling, including one changed by somebody who has never read this file.
 *
 * ---------------------------------------------------------------------------
 * WHY IT TAKES A FACTORY AND NOT A QUERY.
 *
 * A PostgREST builder is a thenable and resolves once. Handing the same builder
 * a second `.range()` does not re-issue it, so a pager that accepted a query
 * object would silently return page one for ever. The caller passes a function
 * that BUILDS the query for a given window, which is the only shape that can be
 * issued more than once.
 *
 * THE CALLER MUST APPLY A STABLE TOTAL ORDER. Ranged paging with no order by is
 * undefined: Postgres may return a row twice across two pages and skip another
 * entirely. `scripts/guards/no-silent-row-ceiling.mjs` fails the build when a
 * ranged read carries no `.order(`, because this is the kind of rule that is
 * obeyed for a month and then forgotten.
 */

export interface PagedResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/** The documented default ceiling. Used as the page size, never as a promise. */
export const SUPABASE_DEFAULT_ROW_CEILING = 1000

/**
 * A read that refuses to be half a read.
 *
 * Every failure throws rather than returning what it managed to collect,
 * because a partial answer that looks whole is the defect this module exists to
 * end. Callers that would rather degrade than fail catch it; the consent
 * resolver's existing catch already fails the send CLOSED, which is the right
 * answer there and is why nothing in the send path needed a new decision.
 *
 * @param what  named in the error, so a failure says which read gave up
 * @param page  builds the query for one window, inclusive of both bounds
 */
export async function readEveryRow<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  { pageSize = SUPABASE_DEFAULT_ROW_CEILING, maxRows = 200_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`readEveryRow(${what}): pageSize must be a positive integer, got ${pageSize}`)
  }

  const rows: T[] = []
  let from = 0

  for (;;) {
    const result = await withBuildRetry<T[]>(
      () => page(from, from + pageSize - 1) as PromiseLike<{ data: T[] | null; error: unknown }>,
      { label: `readEveryRow ${what}` },
    )
    if (result.error) {
      const message = (result.error as { message?: string }).message ?? String(result.error)
      throw new Error(`${what} could not be read in full: ${message}`)
    }

    const batch = result.data ?? []
    if (batch.length === 0) return rows

    rows.push(...batch)

    /*
     * A CEILING LOWER THAN THE PAGE SIZE IS NOT AN ERROR AND IS NOT THE END.
     * Advance by what arrived, never by what was asked for; see the header.
     */
    from += batch.length

    if (rows.length > maxRows) {
      throw new Error(
        `${what} returned more than ${maxRows} rows; this read needs a filter or a bound rather than a bigger page`,
      )
    }
  }
}
