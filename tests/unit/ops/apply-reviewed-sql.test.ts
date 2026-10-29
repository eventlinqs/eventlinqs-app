import { describe, expect, test } from 'vitest'
import { reviewedBody } from '../../../scripts/ops/apply-reviewed-sql-production.mjs'

/*
 * A dry-run file that ends in ROLLBACK (operating rule 4: outreach-pilot-amcf.mjs, outreach-basis.mjs --production,
 * outreach-cohort.mjs) is applied only as written: one begin, its statements, one rollback, nothing else.
 */
describe('reviewedBody', () => {
  const ok = `-- AMCF as a CRM record. Dry run: ends in ROLLBACK.\nbegin;\ninsert into public.organisers (name) values ('a') on conflict do nothing;\n\nupdate public.organiser_contacts set basis = 'none' where false;\nrollback;\n`

  test('takes the statements between one begin and one closing rollback', () => {
    const r = reviewedBody(ok)
    expect(r.refused).toBeUndefined()
    expect(r.statements).toBe(2)
    expect(r.body).toContain("insert into public.organisers (name) values ('a') on conflict do nothing;")
    expect(r.body).not.toMatch(/\b(begin|rollback|commit)\b\s*;/i)
  })

  test('refuses a file that does not end in rollback, or that commits itself', () => {
    expect(reviewedBody(ok.replace('rollback;', 'commit;')).refused).toMatch(/end in rollback/)
    expect(reviewedBody(ok.replace('rollback;\n', 'rollback;\ninsert into x values (1);\n')).refused).toMatch(/end in rollback/)
    expect(reviewedBody(ok.replace("where false;", "where false;\ncommit;\nbegin;")).refused).toMatch(/one begin/)
    expect(reviewedBody(ok.replace('on conflict do nothing;', 'on conflict do nothing;\ncommit;')).refused).toMatch(/never commit itself/)
  })

  test('takes an insert whose select starts its own line, as the AMCF pilot file writes it', () => {
    const pilot = `begin;\n\ninsert into public.organisers (name, created_by)\nselect a.name, 'x'\n  from public.organisations a where a.slug = 'amcf'\non conflict do nothing;\n\nrollback;\n`
    const r = reviewedBody(pilot)
    expect(r.refused).toBeUndefined()
    expect(r.statements).toBe(1)
  })

  test('counts two statements on one line as two, and a semicolon inside a quoted value as none, as outreach-basis writes them', () => {
    const basis = `begin;\ninsert into t (a) values ('x; y')\n   on conflict do nothing; update t set a = 'z; w' where a = 'x';\nrollback;\n`
    expect(reviewedBody(basis).statements).toBe(2)
  })

  test('takes a closing select as the file\'s own read back, run after the commit, as outreach-templates writes it', () => {
    const tpl = `begin;\ninsert into t (k, v) values ('featured', 2) on conflict (k, v) do nothing;\nselect k, v from t where v = 2 order by k;\nrollback;\n`
    const r = reviewedBody(tpl)
    expect(r.refused).toBeUndefined()
    expect(r.statements).toBe(1)
    expect(r.readBack).toBe('select k, v from t where v = 2 order by k')
    expect(r.body).not.toMatch(/select k, v/)
  })

  test('refuses a bare select, which a DO block cannot run, and an empty file', () => {
    expect(reviewedBody(ok.replace('update public', 'select count(*) from public.organisers;\nupdate public')).refused).toMatch(/select/)
    expect(reviewedBody('begin;\nrollback;\n').refused).toMatch(/no statement/)
  })

  test('refuses a statement that would end the DO block it is run inside', () => {
    expect(reviewedBody(ok.replace("values ('a')", () => "values ('$apply$')")).refused).toMatch(/\$apply\$/)
  })
})
