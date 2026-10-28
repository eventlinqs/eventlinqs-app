import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * EVERY WRITER OF A LISTING CHECK STATES ITS REUSE BASIS (release checklist A4
 * and D8, 28 October 2026).
 *
 * listing_checks.reuse_basis keeps a default, manual_research_facts_only, on
 * purpose (supabase/migrations/20261028133001_listing_checks_reuse_basis.sql):
 * production runs main's import between that migration and the deploy, and
 * main's import does not name the column. The cost of a default is that a new
 * writer (a collection run, an organiser submission) could fall through to it
 * and call a licensed or submitted night manual research. So the rule lives
 * here: every insert into listing_checks in src or scripts names reuse_basis.
 */

const ROOT = join(__dirname, '..', '..', '..')
const SCAN = ['src', 'scripts']
const SOURCE = /\.(ts|tsx|mjs|js|cjs)$/

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (SOURCE.test(name)) out.push(p)
  }
  return out
}

/** Each insert into listing_checks, as the text from the insert to the end of its values. */
export function checkInserts(text: string): string[] {
  const found: string[] = []
  const sql = /insert into public\.listing_checks[\s\S]{0,600}?\)\s*`?\s*\+?[\s\S]{0,400}?values[\s\S]{0,600}?\)/gi
  for (const m of text.matchAll(sql)) found.push(m[0])
  const client = /\.from\(\s*['"]listing_checks['"]\s*\)\s*\.(insert|upsert)\(\s*\{[\s\S]{0,800}?\}/g
  for (const m of text.matchAll(client)) found.push(m[0])
  return found
}

describe('checkInserts finds both shapes of writer, and sees a missing basis', () => {
  test('a SQL insert without the column is found, and lacks it', () => {
    const planted = "x(`insert into public.listing_checks (series_id, source_url, source_date, import_file, outcome)` + ` values (a, b, c, d, e);`)"
    const inserts = checkInserts(planted)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).not.toContain('reuse_basis')
  })

  test('a client insert without the field is found, and lacks it', () => {
    const planted = "await db.from('listing_checks').insert({ series_id: s, source_url: u, source_date: d, import_file: f, outcome: 'confirmed' })"
    const inserts = checkInserts(planted)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).not.toContain('reuse_basis')
  })
})

describe('the tree', () => {
  const writers = SCAN.flatMap((d) => files(join(ROOT, d)))
    .map((p) => ({ file: relative(ROOT, p).replace(/\\/g, '/'), inserts: checkInserts(readFileSync(p, 'utf8')) }))
    .filter((w) => w.inserts.length > 0)

  test('has writers to judge (the import, at least)', () => {
    expect(writers.map((w) => w.file)).toContain('src/lib/listings/import-write.ts')
  })

  test('every insert into listing_checks names reuse_basis', () => {
    const missing = writers.flatMap((w) => w.inserts.filter((i) => !i.includes('reuse_basis')).map(() => w.file))
    expect(missing, 'name reuse_basis in this insert: a licensed or submitted night must never fall through to the manual default').toEqual([])
  })
})
