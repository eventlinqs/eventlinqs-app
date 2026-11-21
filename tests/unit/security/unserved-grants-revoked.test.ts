import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs module, its exports read as any here (scripts/ops/pipeline-migrations.mjs)
import { classify } from '../../../scripts/ops/pipeline-migrations.mjs'

/*
 * THE GRANT SWEEP (the PM's 09:55 of 22 November 2026, item 1, a security fix; the 21 October 2026 grant rule). 5C read
 * on production that anon and authenticated held TRUNCATE, REFERENCES and TRIGGER on 116 public tables, and every
 * privilege on audit_log and feature_flags: through the public key nothing could use TRUNCATE (the Data API never issues
 * it), but no policy serves it and row security does not govern it. Migration 20261122101001 removes them. Its own
 * statements are read here; the production read back of the grants follows the release.
 */
// Line endings normalised (the tree carries CRLF).
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261122101001_revoke_unserved_grants.sql'), 'utf8').replace(/\r\n/g, '\n')
const statements = sql.split('\n').filter((l) => /^(revoke|grant) /i.test(l))

describe('audit_log and feature_flags hold only what a policy serves', () => {
  it('everything is revoked from anon and authenticated on both', () => {
    expect(sql).toMatch(/^revoke all on public\.audit_log from anon, authenticated;$/m)
    expect(sql).toMatch(/^revoke all on public\.feature_flags from anon, authenticated;$/m)
  })

  it('anon gets nothing back on audit_log; only reading is granted back, and only where a policy serves it', () => {
    const back = statements.filter((l) => /^grant /i.test(l))
    expect(back.filter((l) => /audit_log/.test(l))).toEqual(['grant select on public.audit_log to authenticated;'])
    for (const l of back) expect(l).toMatch(/^grant select on public\.(audit_log|feature_flags) to (anon|authenticated);$/)
  })
})

describe('the sweep', () => {
  it('never grants TRUNCATE, REFERENCES or TRIGGER, and never touches service_role', () => {
    for (const l of statements.filter((s) => /^grant /i.test(s))) expect(l).not.toMatch(/truncate|references|trigger/i)
    for (const l of statements) expect(l).not.toMatch(/service_role/)
  })

  it('every revoke names TRUNCATE, REFERENCES and TRIGGER, for anon or authenticated only', () => {
    const revokes = statements.filter((l) => /^revoke truncate/i.test(l))
    expect(revokes.length).toBeGreaterThan(100)
    for (const l of revokes) expect(l).toMatch(/^revoke truncate, references, trigger(, (insert|update|delete))* on public\.[a-z_0-9]+ from (anon|authenticated);$/)
  })

  it('the pipeline reads it as a grant change: nothing lost, nothing refused, it never rides alone', () => {
    const c = classify(sql)
    expect(c.losesData).toBe(false)
    expect(c.refused).toEqual([])
  })
})
