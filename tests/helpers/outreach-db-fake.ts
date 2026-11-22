/**
 * A SMALL IN-MEMORY FAKE OF THE OUTREACH TABLES, FOR THE CONTACT POLICY'S REGRESSION TESTS (the PM's 01:52 of
 * 23 November 2026, item 4: "two runs at once create one row", "a retried send gives one message").
 *
 * Enough of the supabase-js query shape for draftFromTemplate (src/lib/outreach/drafts.ts), the contact policy's reader
 * (src/lib/outreach/contact-policy.ts) and the sender's one path (src/lib/outreach/sender.ts), and nothing more: select
 * with eq, neq, in, is, not, lte, gte, lt, ilike, order, limit, single and maybeSingle; insert; a conditional update; rpc.
 *
 * Two things it does as the database does, because they are what the tests prove:
 *   1. outreach_touches takes its category from its template on insert (trg_outreach_touch_takes_its_class, by the one map
 *      in src/lib/comms/categories.ts), and an insert that would give a second non void row for the same contact,
 *      category, context and step is refused in Postgres's own words for the unique index outreach_touches_one_per_step,
 *      as migration 20261123020001 writes it (tests/unit/outreach/contact-policy.test.ts reads that migration and fails
 *      if the two ever disagree); among rows with no context, a second for the same contact and step is refused for
 *      outreach_touches_one_per_step_without_context, the same migration's second index.
 *   2. an update applies only to the rows its filters match at that moment, one statement at a time, so a claim
 *      (queued to sending, filtered on state queued) is taken by exactly one of two runs, as a row lock makes it.
 * Everything else a trigger would refuse is not imitated: those refusals are the database's, proved on TEST in SQL.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

/** The unique key as the migration writes it: (contact_id, coalesce(comms_category,''), coalesce(context_key,''), step) where state <> 'void'. */
export const TOUCH_KEY = ['contact_id', 'comms_category', 'context_key', 'step'] as const

type Filter = (row: Row) => boolean

let seq = 0
const nextId = (table: string) => `${table}-${++seq}`

function classOf(tables: Tables, row: Row): Row {
  const tpl = (tables.outreach_templates ?? []).find((t) => t.id === row.template_id)
  const cls = tpl ? TEMPLATE_CLASS[String(tpl.key)] : undefined
  return cls ? { comms_category: cls.category, comms_subtype: cls.subtype, comms_source: 'template' } : {}
}

function sameKey(a: Row, b: Row): boolean {
  if (a.step === null || a.step === undefined || b.step === null || b.step === undefined) return false
  return TOUCH_KEY.every((k) => (k === 'step' ? a[k] === b[k] : String(a[k] ?? '') === String(b[k] ?? '')))
}

export function fakeOutreachDb(tables: Tables, rpcs: Record<string, (args: unknown) => unknown> = {}) {
  const log: { table: string; op: string; payload?: unknown }[] = []

  const builder = (table: string, op: 'select' | 'update' | 'insert', payload?: unknown, columns = '*') => {
    const filters: Filter[] = []
    let limit: number | null = null
    let offset = 0
    let orderBy: { col: string; asc: boolean }[] = []
    let returning = op === 'select'
    const b: Record<string, unknown> = {}
    const add = (f: Filter) => (filters.push(f), b)
    b.select = (cols?: string) => {
      if (op !== 'select') returning = true
      if (cols) columns = cols
      return b
    }
    b.eq = (c: string, v: unknown) => add((r) => r[c] === v)
    b.neq = (c: string, v: unknown) => add((r) => r[c] !== v)
    b.in = (c: string, vs: unknown[]) => add((r) => vs.includes(r[c]))
    b.is = (c: string, v: unknown) => add((r) => (r[c] ?? null) === v)
    b.not = (c: string, operator: string, v: unknown) => add((r) => (operator === 'is' ? (r[c] ?? null) !== v : r[c] !== v))
    b.lte = (c: string, v: string) => add((r) => r[c] !== null && r[c] !== undefined && String(r[c]) <= v)
    b.gte = (c: string, v: string) => add((r) => r[c] !== null && r[c] !== undefined && String(r[c]) >= v)
    b.lt = (c: string, v: string) => add((r) => r[c] !== null && r[c] !== undefined && String(r[c]) < v)
    b.ilike = (c: string, pattern: string) => {
      const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
      return add((r) => re.test(String(r[c] ?? '')))
    }
    b.order = (col: string, o?: { ascending?: boolean }) => ((orderBy = [...orderBy, { col, asc: o?.ascending !== false }]), b)
    b.limit = (n: number) => ((limit = n), b)
    // A page of rows, as PostgREST's range: the platform reader pages its reads (src/lib/growth/platform-organiser.ts).
    b.range = (from: number, to: number) => ((offset = from), (limit = to - from + 1), b)

    const run = (): { data: unknown; error: { message: string; code?: string } | null } => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === 'insert') {
        const incoming = (Array.isArray(payload) ? payload : [payload]) as Row[]
        const made: Row[] = []
        for (const p of incoming) {
          const row: Row = { id: nextId(table), drafted_at: new Date().toISOString(), state: 'held', ...p }
          if (table === 'outreach_touches') {
            Object.assign(row, classOf(tables, row))
            const clash = rows.find((r) => r.state !== 'void' && row.state !== 'void' && sameKey(r, row))
            if (clash) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "outreach_touches_one_per_step"' } }
            }
            const bare = (x: Row) => x.context_key === null || x.context_key === undefined
            const legacy = rows.find((r) => r.state !== 'void' && row.state !== 'void' && bare(r) && bare(row) && r.step !== null && r.step !== undefined && r.contact_id === row.contact_id && r.step === row.step)
            if (legacy) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "outreach_touches_one_per_step_without_context"' } }
            }
          }
          made.push(row)
        }
        rows.push(...made)
        log.push({ table, op, payload })
        return { data: returning ? made : null, error: null }
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        for (const r of matched) Object.assign(r, payload as Row)
        log.push({ table, op, payload })
        return { data: returning ? matched.map((r) => ({ ...r })) : null, error: null }
      }
      let out = [...matched]
      for (const o of [...orderBy].reverse()) out.sort((x, y) => (String(x[o.col] ?? '') < String(y[o.col] ?? '') ? -1 : String(x[o.col] ?? '') > String(y[o.col] ?? '') ? 1 : 0) * (o.asc ? 1 : -1))
      if (offset > 0) out = out.slice(offset)
      if (limit !== null) out = out.slice(0, limit)
      // The one embedded read the sender and the drafter make: a touch's template key.
      if (columns.includes('outreach_templates(key)')) {
        out = out.map((r) => ({ ...r, outreach_templates: (tables.outreach_templates ?? []).find((t) => t.id === r.template_id) ?? null }))
      }
      return { data: out.map((r) => ({ ...r })), error: null }
    }
    // One statement at a time, each after a turn of the event loop, so two runs started together interleave as two
    // connections would, and each statement still sees and changes the rows as they stand at that moment.
    const settle = () => new Promise<ReturnType<typeof run>>((resolve) => setTimeout(() => resolve(run()), 0))
    b.single = async () => {
      const r = await settle()
      if (r.error) return r
      const list = (r.data ?? []) as Row[]
      return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: `expected one row, found ${list.length}` } }
    }
    b.maybeSingle = async () => {
      const r = await settle()
      if (r.error) return r
      const list = (r.data ?? []) as Row[]
      return { data: list[0] ?? null, error: null }
    }
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => settle().then(resolve, reject)
    return b
  }

  const db = {
    from: (table: string) => ({
      select: (cols?: string) => builder(table, 'select', undefined, cols ?? '*'),
      insert: (payload: unknown) => builder(table, 'insert', payload),
      update: (payload: unknown) => builder(table, 'update', payload),
    }),
    rpc: async (name: string, args: unknown) => {
      const fn = rpcs[name]
      return fn ? { data: fn(args), error: null } : { data: null, error: { message: `no rpc ${name}` } }
    },
  }
  return { db: db as unknown as SupabaseClient<Database>, tables, log }
}
