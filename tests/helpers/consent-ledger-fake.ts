/**
 * A SMALL FAKE OF THE ROWS THE CONSENT LEDGER READS AND WRITES.
 *
 * Enough of the supabase-js query shape for the consent modules and nothing
 * more: select, eq, in, lte, order, limit, range, maybeSingle and insert, plus
 * the one thing it could not express until 21 September 2026, a read that
 * FAILS. It exists
 * because the rules worth testing here are the ones that span two reads and a
 * write, and mocking each call individually proves the calls happened rather
 * than proving the rule holds.
 *
 * It is deliberately not general. If a new module needs a query shape this
 * cannot answer, the honest move is to add that shape here, in one place, and
 * not to reach for a second fake.
 */

export type FakeRow = Record<string, unknown>

export interface FakeTables {
  [table: string]: FakeRow[]
}

/** The shape supabase-js hands back when PostgREST refuses a read. */
export interface FakeReadError {
  message: string
  code?: string
}

export interface FakeAdminOptions {
  /**
   * Tables whose reads FAIL, by name.
   *
   * WHY THIS EXISTS, AND IT IS THE SAME LESSON TWICE. Until 21 September 2026
   * this fake hardcoded `error: null` on every path it had, so no value of any
   * argument could produce a failed read, and every test written against it was
   * blind to the one thing the consent modules are most required to survive. It
   * was blind to exactly the defect that turned out to be live in
   * `src/lib/consent/resolver.ts`: the suppression read discarded its error, so
   * a blink returned an empty suppression list and the resolver PERMITTED a
   * message to somebody who had unsubscribed.
   *
   * The same gap was found a day earlier in the platform-stats fake, which
   * could not express a row ceiling. A fake that cannot express the fault can
   * never show it, and its green is a statement about the fake.
   */
  failing?: Record<string, FakeReadError>
}

export interface FakeAdmin {
  tables: FakeTables
  inserts: { table: string; rows: FakeRow[] }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
}

type Filter = (row: FakeRow) => boolean

export function fakeConsentAdmin(tables: FakeTables, options: FakeAdminOptions = {}): FakeAdmin {
  const state: FakeTables = {}
  for (const [name, rows] of Object.entries(tables)) state[name] = rows.map((r) => ({ ...r }))
  const inserts: { table: string; rows: FakeRow[] }[] = []

  function builder(table: string) {
    /*
     * A FAILING TABLE ANSWERS EXACTLY AS PostgREST DOES: the promise RESOLVES,
     * `data` is null and `error` carries the fault. It does not reject, which
     * is the whole reason a discarded error is invisible at the call site.
     */
    const fault = options.failing?.[table] ?? null
    const failed = { data: null, error: fault, count: null }
    const filters: Filter[] = []
    let orderKey: string | null = null
    let ascending = true
    let limitTo: number | null = null
    let rangeFrom: number | null = null
    let rangeTo: number | null = null

    const rows = () => {
      let out = (state[table] ?? []).filter((row) => filters.every((f) => f(row)))
      if (orderKey) {
        const key = orderKey
        out = [...out].sort((a, b) => {
          const left = String(a[key] ?? '')
          const right = String(b[key] ?? '')
          return ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
      }
      if (limitTo !== null) out = out.slice(0, limitTo)
      if (rangeFrom !== null && rangeTo !== null) out = out.slice(rangeFrom, rangeTo + 1)
      return out
    }

    const api = {
      select() {
        return api
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value)
        return api
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]))
        return api
      },
      lte(column: string, value: string) {
        filters.push((row) => String(row[column] ?? '') <= value)
        return api
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderKey = column
        ascending = options?.ascending !== false
        return api
      },
      limit(count: number) {
        limitTo = count
        return api
      },
      /*
       * `readEveryRow` pages with `.range(from, to)` and stops when a page
       * comes back shorter than it asked for. Without this shape the pager's
       * callers could not be tested against this fake at all, and
       * `filterPermittedRecipients` is one of them.
       */
      range(from: number, to: number) {
        rangeFrom = from
        rangeTo = to
        return api
      },
      maybeSingle() {
        if (fault) return Promise.resolve(failed)
        const found = rows()[0] ?? null
        return Promise.resolve({ data: found, error: null })
      },
      single() {
        if (fault) return Promise.resolve(failed)
        const found = rows()[0] ?? null
        return Promise.resolve({ data: found, error: found ? null : { message: 'no rows' } })
      },
      insert(payload: FakeRow | FakeRow[]) {
        if (fault) return Promise.resolve(failed)
        const list = Array.isArray(payload) ? payload : [payload]
        inserts.push({ table, rows: list })
        state[table] = [...(state[table] ?? []), ...list]
        return Promise.resolve({ data: list, error: null })
      },
      then(resolve: (value: { data: FakeRow[] | null; error: FakeReadError | null }) => unknown) {
        if (fault) return Promise.resolve(failed).then(resolve)
        return Promise.resolve({ data: rows(), error: null }).then(resolve)
      },
    }
    return api
  }

  return {
    tables: state,
    inserts,
    client: { from: (table: string) => builder(table) },
  }
}

/** The tenant row every ledger write looks up first. */
export const PLATFORM_TENANT_ROW = { id: 'tenant-eventlinqs', slug: 'eventlinqs', is_platform: true }

/** The wording record the checkout renders and stores verbatim. */
export const WORDING_ROW = {
  purpose: 'facilitated_event_marketing',
  version: 'v1',
  label: 'Yes, email and text me about other events near me.',
  body: 'EventLinqs will send you marketing about events run by other organisers who sell tickets on EventLinqs.',
  channel_scope: 'both',
  third_party_scope: 'events ticketed on EventLinqs, marketed by EventLinqs as the sender',
  suppression_scope: 'every EventLinqs facilitated message on every channel',
  effective_from: '2026-09-13T00:00:00.000Z',
}
