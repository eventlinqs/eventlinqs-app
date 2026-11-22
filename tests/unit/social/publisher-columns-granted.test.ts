import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * EVERY COLUMN THE PUBLISHER WRITES IS GRANTED (Lawal's hardening order of 22 November 2026, section 2 B; the PM's 09:32
 * item 2 (b)). The publisher writes social_piece_schedules.submission_ref the moment Blotato accepts a post, so a later
 * run reads the submission before it would ever send again; migration 20261028210501 granted update on four columns
 * only, every such write was refused, and the 02:59 pair of 22 November kept no submission id. Red on main a4c40783:
 * submission_ref was written and never granted.
 */
const ROOT = process.cwd()
const SOCIAL = join(ROOT, 'src/lib/social')
const MIGRATIONS = join(ROOT, 'supabase/migrations')

/** The columns every `.from('social_piece_schedules').update({ ... })` in the social engine writes. */
function columnsWritten(): Set<string> {
  const out = new Set<string>()
  for (const f of readdirSync(SOCIAL).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(join(SOCIAL, f), 'utf8')
    for (const m of src.matchAll(/from\('social_piece_schedules'\)\s*\.update\(\{([^}]*)\}/g)) {
      for (const k of m[1].matchAll(/(?:^|,)\s*([a-z_]+)\s*:/g)) out.add(k[1])
    }
  }
  return out
}

/** The columns service_role may update on social_piece_schedules, from every migration's grant. */
function columnsGranted(): Set<string> {
  const out = new Set<string>()
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
    for (const m of sql.matchAll(/grant update \(([^)]*)\) on public\.social_piece_schedules to service_role/gi)) {
      for (const c of m[1].split(',')) out.add(c.trim())
    }
  }
  return out
}

describe('the publisher writes only what it is granted', () => {
  it('reads the writes it judges (state, held_reason, published_ref, published_at, submission_ref)', () => {
    expect([...columnsWritten()].sort()).toEqual(expect.arrayContaining(['held_reason', 'published_at', 'published_ref', 'state', 'submission_ref']))
  })

  it('every column the publisher updates is granted to service_role (red on main: submission_ref)', () => {
    const granted = columnsGranted()
    expect([...columnsWritten()].filter((c) => !granted.has(c))).toEqual([])
  })
})
