import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/*
 * A SECOND PATH THROUGH A JOIN TABLE IS A SECOND RELATIONSHIP (the CONTROLLER's 20:20 of 1 November 2026). Migration
 * 20261101161001 created event_secondary_categories (events, event_categories); PostgREST then refused every bare
 * `event_categories(...)` embed from events with PGRST201 and the city guide's gate stopped at its build. The guard
 * no-ambiguous-embed counted only a table's own foreign keys and passed. This drives the real guard on a fixture tree:
 * the junction, a bare embed in a select constant and in a nested embed, and the named form.
 */
const GUARD = join(process.cwd(), 'scripts/guards/no-ambiguous-embed.mjs')
let dir = ''

function tree(files: Record<string, string>) {
  dir = mkdtempSync(join(tmpdir(), 'ambiguous-embed-'))
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true })
    writeFileSync(join(dir, p), body)
  }
  return spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' })
}

const SCHEMA = `create table if not exists public.event_categories (
  id uuid primary key
);
create table if not exists public.events (
  id uuid primary key,
  category_id uuid references public.event_categories (id)
);
`
const JUNCTION = `create table if not exists public.event_secondary_categories (
  event_id uuid not null references public.events (id) on delete cascade,
  category_id uuid not null references public.event_categories (id) on delete restrict,
  primary key (event_id, category_id)
);
`

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

describe('no-ambiguous-embed sees a second path through a join table', () => {
  it('without the join table, a bare embed passes (one relationship)', () => {
    const r = tree({
      'supabase/migrations/001.sql': SCHEMA,
      'src/q.ts': "export const S = 'id, category:event_categories(name, slug)'\n",
    })
    expect(r.status).toBe(0)
  })

  it('with the join table, a bare embed in a select constant and one with !inner fail, naming the file and line', () => {
    const r = tree({
      'supabase/migrations/001.sql': SCHEMA,
      'supabase/migrations/002.sql': JUNCTION,
      'src/q.ts': "export const S = 'id, category:event_categories(name, slug)'\nexport const T = 'x, c:event_categories!inner(slug)'\n",
      'scripts/drive.mjs': "const s = 'r, events(id, category:event_categories(slug))'\n",
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('src/q.ts:1')
    expect(r.stderr).toContain('src/q.ts:2')
    expect(r.stderr).toContain('scripts/drive.mjs:1')
    expect(r.stderr).toContain('PGRST201')
  })

  it('with the join table, the named key passes, plain and with !inner', () => {
    const r = tree({
      'supabase/migrations/001.sql': SCHEMA,
      'supabase/migrations/002.sql': JUNCTION,
      'src/q.ts': "export const S = 'id, category:event_categories!events_category_id_fkey(name, slug)'\nexport const T = 'x, c:event_categories!events_category_id_fkey!inner(slug)'\n",
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('2 embed(s) of them name their key')
  })
})
