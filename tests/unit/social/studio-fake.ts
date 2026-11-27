/*
 * A small stand in for the database the studio's move reads and writes (studio_pieces, studio_uploads): each read is
 * answered from the rows given, filtered by the calls the code makes (eq, is, gt, in, not null), and each update is kept
 * and applied to its row, so a second run sees the first run's writes. Shared by the bridge's and the phone check's tests.
 */
type Row = Record<string, unknown>

export function studioFakeDb(rows: { pieces: Row[]; uploads: Row[] }) {
  const updates: { table: string; values: Record<string, unknown>; id: unknown }[] = []
  const tableRows = (table: string) => (table === 'studio_pieces' ? rows.pieces : table === 'studio_uploads' ? rows.uploads : [])
  // A column's database default where a row leaves it out: an upload's view is 'full', a piece's preflight false (20261128050001).
  const valueOf = (table: string, r: Row, col: string) => (col === 'view' && table === 'studio_uploads' ? (r.view ?? 'full') : col === 'preflight' && table === 'studio_pieces' ? (r.preflight ?? false) : (r[col] ?? null))
  const db = {
    from(table: string) {
      const filters: [string, string, unknown][] = []
      const q: Record<string, unknown> = {}
      const add = (op: string) => (col: string, val?: unknown) => (filters.push([op, col, val]), q)
      const answer = () => {
        let data = tableRows(table)
        for (const [op, col, val] of filters) {
          if (op === 'eq') data = data.filter((r) => valueOf(table, r, col) === val)
          if (op === 'is') data = data.filter((r) => valueOf(table, r, col) === val)
          if (op === 'gt') data = data.filter((r) => String(valueOf(table, r, col)) > String(val))
          if (op === 'gte') data = data.filter((r) => String(valueOf(table, r, col)) >= String(val))
          if (op === 'in') data = data.filter((r) => (val as unknown[]).includes(valueOf(table, r, col)))
          if (op === 'not') data = data.filter((r) => valueOf(table, r, col) !== null)
        }
        return { data: data.map((r) => ({ ...r })), error: null }
      }
      Object.assign(q, { select: () => q, eq: add('eq'), is: add('is'), gt: add('gt'), gte: add('gte'), in: add('in'), not: add('not'), order: () => q })
      q.limit = () => Promise.resolve(answer())
      q.single = () => {
        const a = answer()
        return Promise.resolve(a.data[0] ? { data: a.data[0], error: null } : { data: null, error: { message: 'no row' } })
      }
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad)
      q.update = (values: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          updates.push({ table, values, id: val })
          const target = tableRows(table).find((r) => r[col] === val)
          if (target) Object.assign(target, values)
          return Promise.resolve({ error: null })
        },
      })
      return q
    },
  }
  return { db: db as never, updates }
}

/** A checklist of ten passed items on each slide, each with a line on what was seen. */
export function passedChecklist(slides: number) {
  return {
    slides: Array.from({ length: slides }, (_, s) => ({
      slide: s + 1,
      items: Array.from({ length: 10 }, (_, i) => ({ item: i + 1, pass: true, seen: `slide ${s + 1}, item ${i + 1}: looked at on the 390 px view` })),
    })),
  }
}
