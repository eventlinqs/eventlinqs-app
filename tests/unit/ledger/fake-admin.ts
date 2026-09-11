/**
 * AN IN-MEMORY STAND-IN FOR THE SERVICE-ROLE CLIENT, for the slot-ledger tests.
 *
 * WHY IT IS A LITTLE DATABASE RATHER THAN A PILE OF `vi.fn()`s. Every defect
 * this ledger can have is a defect about WHAT LANDED IN A ROW: a refund that
 * went in positive, a demand row with no address on it, a sale counted twice
 * because two paths minted different occurrence keys. A mock that only records
 * that a function was called cannot see any of those. So the rows are kept, the
 * filters actually filter, and the assertions read the rows back.
 *
 * It implements the exact slice of the query builder the ledger code uses and
 * nothing else. An unimplemented operator is a THROW rather than a silent
 * no-op, because a filter that quietly did nothing would make a test pass by
 * reading rows the real code would never have seen.
 */
import { vi } from 'vitest'

export type Row = Record<string, unknown>

export type RpcCall = { name: string; args: Record<string, unknown> }

export type FakeWorld = {
  /** table name -> rows */
  tables: Map<string, Row[]>
  /** every rpc the code under test sent, in order */
  rpcCalls: RpcCall[]
  /** the rows `record_ledger_entry` accepted, as the database would hold them */
  ledger: Array<{ slot: Row; entry: Row }>
  /** set to make the next rpc answer with an error, the way PostgREST does */
  rpcError: string | null
  /** set to make a named table read throw, to prove the caller survives it */
  throwOnRead: string | null
}

export function makeWorld(seed: Record<string, Row[]> = {}): FakeWorld {
  return {
    tables: new Map(Object.entries(seed).map(([k, v]) => [k, v.map(r => ({ ...r }))])),
    rpcCalls: [],
    ledger: [],
    rpcError: null,
    throwOnRead: null,
  }
}

type Filter = (row: Row) => boolean

function builder(world: FakeWorld, table: string) {
  const filters: Filter[] = []
  let limit: number | null = null
  let head = false
  let counting = false

  const rows = () => {
    if (world.throwOnRead === table) throw new Error(`the ${table} read fell over`)
    const source = world.tables.get(table) ?? []
    let out = source.filter(row => filters.every(f => f(row)))
    if (limit !== null) out = out.slice(0, limit)
    return out.map(r => ({ ...r }))
  }

  const api = {
    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      if (options?.head) head = true
      if (options?.count) counting = true
      return api
    },
    eq(column: string, value: unknown) {
      filters.push(row => row[column] === value)
      return api
    },
    neq(column: string, value: unknown) {
      filters.push(row => row[column] !== value)
      return api
    },
    in(column: string, values: unknown[]) {
      const set = new Set(values)
      filters.push(row => set.has(row[column]))
      return api
    },
    is(column: string, value: null) {
      if (value !== null) throw new Error('.is() is only used with null by this code')
      filters.push(row => row[column] === null || row[column] === undefined)
      return api
    },
    not(column: string, operator: string, value: null) {
      if (operator !== 'is' || value !== null) throw new Error('.not() is only used as .not(col, "is", null)')
      filters.push(row => row[column] !== null && row[column] !== undefined)
      return api
    },
    /*
     * PostgREST's `or`, in the one form this code uses:
     * `col.eq."value",other.eq."value"`, combined with every other filter by AND,
     * which is what PostgREST does with a top-level `or`.
     *
     * It is here because the adapter started asking "has this person bought
     * before" of BOTH the address and the account id, and without it the whole
     * call threw, was swallowed by the adapter's guard, and came back as null.
     * The suite caught it as `expected undefined to be false`, which is exactly
     * the shape of "a field the ledger silently stopped recording".
     */
    or(expression: string) {
      const terms = expression.split(',').map(term => {
        const m = /^([A-Za-z0-9_]+)\.eq\.(.*)$/.exec(term)
        if (!m) throw new Error(`.or() in this stand-in only understands <col>.eq.<value>, got "${term}"`)
        const value = m[2].replace(/^"(.*)"$/, '$1')
        return { column: m[1], value }
      })
      filters.push(row => terms.some(t => String(row[t.column] ?? '') === t.value))
      return api
    },
    gte(column: string, value: string) {
      filters.push(row => String(row[column] ?? '') >= value)
      return api
    },
    lt(column: string, value: string) {
      filters.push(row => String(row[column] ?? '') < value)
      return api
    },
    order(_column: string, _options?: unknown) {
      return api
    },
    limit(n: number) {
      limit = n
      return api
    },
    /*
     * A FAULT THROWS RATHER THAN BEING HANDED BACK AS `{ error }`.
     *
     * The two faults this ledger actually met in the suite were both throws
     * rather than PostgREST errors: `headers()` called outside a request scope,
     * and `input.before.map is not a function`. A stand-in that turned every
     * fault into a return value could not see either, and the adapter's
     * guarantee is precisely that neither of them reaches somebody's checkout.
     */
    async maybeSingle() {
      const found = rows()
      return { data: found[0] ?? null, error: null }
    },
    async single() {
      return api.maybeSingle()
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      const found = rows()
      if (head || counting) return Promise.resolve({ data: null, count: found.length, error: null }).then(resolve, reject)
      return Promise.resolve({ data: found, error: null }).then(resolve, reject)
    },
  }
  return api
}

/**
 * The stand-in for `public.record_ledger_entry`, in JavaScript.
 *
 * It mirrors the three behaviours of the real function that the code above it
 * depends on, and no others: the slot is upserted on (source_system, source_ref),
 * `days_out` is DERIVED from the slot rather than taken from the caller, and the
 * occurrence key is unique so a second write of the same happening returns null.
 */
function recordLedgerEntry(world: FakeWorld, args: Record<string, unknown>): number | null {
  const slot = args.p_slot as Row
  const entry = args.p_entry as Row
  const already = world.ledger.find(
    r => r.entry.occurrence_key === entry.occurrence_key && r.entry.source_system === (slot.source_system ?? 'eventlinqs'),
  )
  if (already) return null

  // The slot dimension is upserted on (source_system, source_ref), exactly as
  // the real function does, because the adapter reads it back by that key when
  // it needs the ledger's own id for a slot.
  const slots = world.tables.get('ledger_slots') ?? []
  let slotRow = slots.find(
    s => s.source_system === (slot.source_system ?? 'eventlinqs') && s.source_ref === slot.source_ref,
  )
  if (!slotRow) {
    slotRow = { ...slot, id: `slot-${slots.length + 1}` }
    slots.push(slotRow)
    world.tables.set('ledger_slots', slots)
  } else {
    Object.assign(slotRow, slot, { id: slotRow.id })
  }

  const slotAt = new Date(String(slot.slot_at))
  const occurredAt = new Date(String(entry.occurred_at ?? new Date().toISOString()))
  const daysOut = Math.max(
    0,
    Math.round((Date.UTC(slotAt.getUTCFullYear(), slotAt.getUTCMonth(), slotAt.getUTCDate()) -
      Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate())) / 86_400_000),
  )

  const stored = {
    slot: { ...slot },
    entry: {
      ...entry,
      source_system: slot.source_system ?? 'eventlinqs',
      slot_id: slotRow.id,
      days_out: daysOut,
    },
  }
  world.ledger.push(stored)

  // The rows are readable back through `.from('ledger_entries')`, because the
  // adapter genuinely reads them: the attribution on a sale is read off the
  // checkout_started row, and the abandonment sweep reads them too.
  const table = world.tables.get('ledger_entries') ?? []
  table.push(stored.entry)
  world.tables.set('ledger_entries', table)

  return world.ledger.length
}

export function makeAdmin(world: FakeWorld) {
  return {
    from: (table: string) => builder(world, table),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      world.rpcCalls.push({ name, args })
      if (world.rpcError) return { data: null, error: { message: world.rpcError } }
      if (name === 'record_ledger_entry') return { data: recordLedgerEntry(world, args), error: null }
      return { data: null, error: null }
    }),
  }
}

/** The one entry of a given kind, or a readable failure naming what was there. */
export function onlyEntry(world: FakeWorld, kind: string): Row {
  const found = world.ledger.filter(r => r.entry.kind === kind).map(r => r.entry)
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${kind} row, found ${found.length}. The ledger holds: ` +
        world.ledger.map(r => String(r.entry.kind)).join(', '),
    )
  }
  return found[0]
}

export const entriesOfKind = (world: FakeWorld, kind: string): Row[] =>
  world.ledger.filter(r => r.entry.kind === kind).map(r => r.entry)
