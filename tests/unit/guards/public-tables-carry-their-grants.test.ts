/**
 * The judge behind scripts/guards/public-tables-carry-their-grants.mjs, on SQL
 * written to break each rule once (Lawal, 21 October 2026: every migration that
 * creates a public table grants it, in that migration, to exactly the roles its
 * row security policies serve, never wider).
 */
import { describe, expect, it } from 'vitest'
import { judgeMigration, statementsOf } from '../../../scripts/guards/public-tables-carry-their-grants.mjs'

const RIGHT = `
create table if not exists public.notes (id uuid primary key, body text);
alter table public.notes enable row level security;
create policy "Anyone reads notes" on public.notes for select to anon, authenticated using (true);
revoke all on public.notes from public, anon, authenticated, service_role;
grant select on public.notes to anon, authenticated;
grant select, insert, update on public.notes to service_role;
`

const problems = (sql: string): string[] => judgeMigration(sql).problems

describe('a table granted exactly passes', () => {
  it('the right shape has no problem', () => {
    expect(problems(RIGHT)).toEqual([])
  })

  it('a service-role-only table with no policy passes', () => {
    expect(
      problems(`
        create table public.jobs (id uuid primary key);
        alter table public.jobs enable row level security;
        revoke all on public.jobs from anon, authenticated, service_role;
        grant select, insert on public.jobs to service_role;
      `),
    ).toEqual([])
  })

  it('a table in another schema, or a temp table, is not judged', () => {
    expect(judgeMigration('create table private.secrets (id int); create temp table scratch (id int);').tables).toEqual([])
  })

  it('a create table inside a comment, a string or a function body is not a table', () => {
    const sql = `
      -- create table public.fake (id int);
      comment on table public.notes is 'create table public.also_fake (id int);';
      create or replace function public.f() returns void language sql as $$ select 1; $$;
    `
    expect(judgeMigration(sql).tables).toEqual([])
  })

  it('a create table built by dynamic SQL is counted as not seen', () => {
    expect(judgeMigration(`do $$ begin execute 'create table public.x (id int)'; end $$;`).dynamic).toBe(1)
  })
})

describe('each rule refuses once', () => {
  it('NO GRANT: created and granted to nobody', () => {
    expect(problems('create table public.notes (id int);')).toEqual([expect.stringMatching(/^NO GRANT: public\.notes/)])
  })

  it('NOT REVOKED: granted without revoking the old default first', () => {
    expect(problems(RIGHT.replace('revoke all on public.notes from public, anon, authenticated, service_role;', ''))).toEqual([
      expect.stringMatching(/^NOT REVOKED: public\.notes/),
    ])
  })

  it('NOT REVOKED: a revoke that leaves out service_role does not count', () => {
    expect(problems(RIGHT.replace('from public, anon, authenticated, service_role', 'from anon, authenticated'))).toEqual([
      expect.stringMatching(/^NOT REVOKED/),
    ])
  })

  it('WIDER: ALL to authenticated', () => {
    const found = problems(RIGHT.replace('grant select on public.notes to anon, authenticated;', 'grant all on public.notes to anon, authenticated;'))
    expect(found.some((p) => /^WIDER: public\.notes grants ALL to anon/.test(p))).toBe(true)
  })

  it('WIDER: TRUNCATE to anon', () => {
    expect(problems(RIGHT + 'grant truncate on public.notes to anon;')).toEqual([expect.stringMatching(/^WIDER: public\.notes grants TRUNCATE to anon/)])
  })

  it('WIDER: anything to PUBLIC', () => {
    expect(problems(RIGHT + 'grant select on public.notes to public;').some((p) => p.includes('to PUBLIC'))).toBe(true)
  })

  it('WIDER: every table in the schema at once', () => {
    expect(problems('grant select on all tables in schema public to anon;')).toEqual([expect.stringMatching(/^WIDER: .*every table in the schema/)])
  })

  it('NOT SERVED: INSERT to authenticated with only a SELECT policy', () => {
    expect(problems(RIGHT.replace('grant select on public.notes to anon, authenticated;', 'grant select on public.notes to anon;\ngrant select, insert on public.notes to authenticated;'))).toEqual([
      expect.stringMatching(/^NOT SERVED: public\.notes grants INSERT to authenticated/),
    ])
  })

  it('NOT SERVED: anon granted where the only policy serves authenticated', () => {
    const sql = RIGHT.replace('to anon, authenticated using (true)', 'to authenticated using (true)')
    expect(problems(sql)).toEqual([expect.stringMatching(/^NOT SERVED: public\.notes grants SELECT to anon/)])
  })

  it('a policy with no role list serves every role', () => {
    expect(problems(RIGHT.replace(' to anon, authenticated using (true)', ' using (true)'))).toEqual([])
  })

  it('a restrictive policy serves nobody on its own', () => {
    const sql = RIGHT.replace('for select to anon', 'as restrictive for select to anon')
    expect(problems(sql).filter((p) => p.startsWith('NOT SERVED')).length).toBe(2)
  })

  it('NOT GRANTED: a policy for anon that anon can never use', () => {
    expect(problems(RIGHT.replace('grant select on public.notes to anon, authenticated;', 'grant select on public.notes to authenticated;'))).toEqual([
      expect.stringMatching(/^NOT GRANTED: a SELECT policy on public\.notes serves anon/),
    ])
  })

  it('NO RLS: anon granted on a table without row level security', () => {
    expect(problems(RIGHT.replace('alter table public.notes enable row level security;', ''))).toEqual([
      expect.stringMatching(/^NO RLS: public\.notes is granted to anon/),
      expect.stringMatching(/^NO RLS: public\.notes is granted to authenticated/),
    ])
  })

  it('unqualified and quoted names are the same public table', () => {
    const sql = RIGHT.replaceAll('public.notes', '"notes"')
    expect(judgeMigration(sql).tables).toEqual(['notes'])
    expect(problems(sql)).toEqual([])
  })
})

describe('the statement reader', () => {
  it('a semicolon inside quotes or a dollar body never splits a statement', () => {
    const s = statementsOf(`select 'a;b'; create function f() returns int language sql as $fn$ select 1; $fn$; select 2`)
    expect(s).toHaveLength(3)
  })

  it('a dollar tag with a digit in it is still one body', () => {
    const s = statementsOf(`create function f() returns int language sql as $wi1$ select 1; select 2; $wi1$; select 3`)
    expect(s).toHaveLength(2)
  })

  it('a grant inside a digit-tagged function body is not read as a grant', () => {
    const sql = `${RIGHT}
      create or replace function public.g() returns void language plpgsql as $b2$
      begin execute 'grant all on public.notes to anon'; end $b2$;`
    expect(problems(sql)).toEqual([])
  })
})
